import { Notice, Plugin, TFile } from 'obsidian';
import type {
	GrammarTopic,
	TranslationAttempt,
	TranslationEvaluation,
	TranslationQuestion,
} from './domain/types';
import { ATTEMPT_SCHEMA_VERSION } from './domain/constants';
import { GRAMMAR_TOPICS, topicById } from './curriculum/topics';
import { OpenAiCompatibleProvider, questionValidator } from './llm';
import type { LlmProvider } from './domain/types';
import { QuestionService } from './questions';
import {
	applyEvaluation,
	buildReviewQueue,
	markExerciseShown,
	markQuestionShown,
	recentQuestionIds,
	ReviewScheduler,
	snoozeQuestion,
} from './review';
import {
	ApiKeyStore,
	mergeSettings,
} from './settings';
import {
	type SettingsTabActions,
	TranslationTrainerSettingsTab,
} from './settings/settings-tab';
import {
	PluginDataStore,
	type PluginData,
	TranslationTrainerFileStore,
} from './storage';
import {
	buildStatisticsSnapshot,
	StatisticsService,
	type StatisticsPeriod,
	type StatisticsSnapshot,
} from './statistics';
import {
	ErrorReporter,
	LoadingModal,
	STATISTICS_VIEW_TYPE,
	StatisticsView,
	TranslationModal,
} from './ui';
import { VocabularyService } from './vocabulary/service';

export default class TranslationTrainerPlugin extends Plugin {
	private dataStore!: PluginDataStore;
	private data!: PluginData;
	private fileStore!: TranslationTrainerFileStore;
	private apiKeys!: ApiKeyStore;
	private vocabulary!: VocabularyService;
	private provider!: LlmProvider;
	private questions!: QuestionService;
	private statistics!: StatisticsService;
	private scheduler!: ReviewScheduler;
	private readonly reporter = new ErrorReporter();
	private modalOpen = false;
	private sessionQueue: TranslationQuestion[] = [];
	private reindexTimer?: number;

	async onload(): Promise<void> {
		this.dataStore = new PluginDataStore(this);
		this.data = await this.dataStore.load();
		this.apiKeys = new ApiKeyStore(this.app);
		this.fileStore = new TranslationTrainerFileStore(this.app.vault.adapter, (diagnostic) => {
			const location = diagnostic.line ? `${diagnostic.path}:${diagnostic.line}` : diagnostic.path;
			this.reporter.report(new Error(`${diagnostic.message} (${location})`), `Ошибка данных Translation Trainer: ${diagnostic.message}`);
		});
		await this.fileStore.ensureServiceDirectories();
		this.vocabulary = new VocabularyService(this.app.vault);
		await this.safeReindexVocabulary();
		await this.rebuildRuntimeServices();
		this.statistics = new StatisticsService(this.fileStore);

		this.registerView(
			STATISTICS_VIEW_TYPE,
			(leaf) => new StatisticsView(leaf, {
				load: (period) => this.loadStatistics(period),
				drilldownWord: (id) => this.statistics.drilldownWord(id),
				drilldownTopic: (id) => this.statistics.drilldownTopic(id),
			}),
		);
		this.addSettingTab(new TranslationTrainerSettingsTab(this.app, this, this.settingsActions(), this.reporter));
		this.registerCommands();
		this.registerVocabularyEvents();

		this.scheduler = new ReviewScheduler({
			getSettings: () => this.data.settings,
			getState: () => this.data.scheduler,
			saveState: async (state) => {
				this.data.scheduler = state;
				await this.savePluginData();
			},
			isModalOpen: () => this.modalOpen,
			isAppActive: () => activeDocument.visibilityState === 'visible' && activeDocument.hasFocus(),
			showAutomaticExercise: () => this.openExercise(false, false),
		});
		this.registerInterval(window.setInterval(() => {
			void this.scheduler.check().catch((error: unknown) => this.reporter.report(error, 'Не удалось проверить расписание упражнений.'));
		}, 60_000));
		this.register(() => {
			if (this.reindexTimer !== undefined) window.clearTimeout(this.reindexTimer);
		});
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'start-exercise-now',
			name: 'Начать упражнение сейчас',
			callback: () => void this.openExercise(true, false),
		});
		this.addCommand({
			id: 'open-review-session',
			name: 'Открыть сессию повторения',
			callback: () => void this.openExercise(true, true),
		});
		this.addCommand({
			id: 'open-statistics',
			name: 'Открыть статистику',
			callback: () => void this.openStatistics(),
		});
		this.addCommand({
			id: 'toggle-pause',
			name: 'Приостановить или возобновить упражнения',
			callback: () => void this.togglePause(),
		});
		this.addCommand({
			id: 'reindex-vocabulary',
			name: 'Переиндексировать словарь',
			callback: () => void this.reindexVocabularyWithNotice(),
		});
		this.addRibbonIcon('languages', 'Начать упражнение', () => void this.openExercise(true, false));
	}

	private registerVocabularyEvents(): void {
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file.path === this.data.settings.vocabularyPath) this.scheduleVocabularyReindex();
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (oldPath !== this.data.settings.vocabularyPath) return;
			this.data.settings.vocabularyPath = file.path;
			void this.savePluginData().then(() => this.safeReindexVocabulary());
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file.path === this.data.settings.vocabularyPath) {
				this.reporter.report(new Error('Vocabulary source deleted.'), 'Файл со словами был удалён. Выберите новый файл в настройках.');
			}
		}));
	}

	private scheduleVocabularyReindex(): void {
		if (this.reindexTimer !== undefined) window.clearTimeout(this.reindexTimer);
		this.reindexTimer = window.setTimeout(() => {
			this.reindexTimer = undefined;
			void this.safeReindexVocabulary();
		}, 500);
	}

	private async safeReindexVocabulary(): Promise<number> {
		try {
			const index = await this.vocabulary.reindex(
				this.data.settings.vocabularyPath,
				this.data.settings.vocabularySection,
			);
			if (this.questions) await this.rebuildRuntimeServices();
			return index.size;
		} catch (error) {
			this.reporter.report(error, 'Не удалось прочитать заметку со словами.');
			return 0;
		}
	}

	private async rebuildRuntimeServices(): Promise<void> {
		this.provider = new OpenAiCompatibleProvider({
			baseUrl: this.data.settings.endpoint,
			model: this.data.settings.model,
			apiKey: this.apiKeys.get() ?? undefined,
			timeoutMs: this.data.settings.timeoutMs,
		});
		const topicIds = GRAMMAR_TOPICS.map((topic) => topic.id);
		const vocabularyKeys = this.vocabulary.entries.map((entry) => entry.canonicalKey);
		this.questions = new QuestionService({
			store: this.fileStore,
			provider: this.provider,
			topics: GRAMMAR_TOPICS,
			validateQuestion: questionValidator(topicIds, vocabularyKeys),
		});
		await this.questions.initialize();
	}

	private async openExercise(manual: boolean, sessionMode: boolean): Promise<boolean> {
		if (this.modalOpen) {
			if (manual) new Notice('Окно упражнения уже открыто.');
			return false;
		}
		this.modalOpen = true;
		let exerciseOpened = false;
		let cancelled = false;
		const loading = new LoadingModal(
			this.app,
			sessionMode ? 'Готовим сессию повторения…' : 'Готовим задание…',
			() => { cancelled = true; },
			this.data.settings.exerciseModalWidth,
		);
		loading.open();
		try {
			let question: TranslationQuestion | undefined;
			if (sessionMode) {
				const all = await this.questions.allQuestions();
				this.sessionQueue = buildReviewQueue(all, this.data.questionProgress);
				question = this.sessionQueue.shift();
				if (!question) {
					new Notice('Просроченных вопросов для повторения нет.');
					return false;
				}
			} else {
				question = await this.nextAdaptiveQuestion(manual);
			}
			if (cancelled) return false;
			await this.markQuestionForDisplay(question, manual);
			loading.finish();
			new TranslationModal(this.app, {
				question,
				sessionMode,
				widthPx: this.data.settings.exerciseModalWidth,
				reporter: this.reporter,
				actions: {
					evaluate: (current, answer, hintUsed, responseTimeMs) => this.evaluateAnswer(current, answer, hintUsed, responseTimeMs),
					snooze: (questionId) => this.snooze(questionId),
					next: sessionMode ? () => this.nextSessionQuestion() : undefined,
					onClose: () => { this.modalOpen = false; this.sessionQueue = []; },
				},
			}).open();
			exerciseOpened = true;
			return true;
		} catch (error) {
			this.reporter.report(error, 'Не удалось открыть упражнение.');
			return false;
		} finally {
			loading.finish();
			if (!exerciseOpened) this.modalOpen = false;
		}
	}

	private async nextAdaptiveQuestion(allowEarlyReview: boolean): Promise<TranslationQuestion> {
		const all = await this.questions.allQuestions();
		const result = await this.statistics.rebuild(all, { period: 'all' });
		const statistics = this.statistics.selectionStatistics(result.snapshot);
		const recent = recentQuestionIds(result.snapshot.attempts);
		return (await this.questions.next({
			level: this.data.settings.cefrLevel,
			vocabulary: this.vocabulary.entries,
			progress: this.data.questionProgress,
			statistics,
			recentQuestionIds: recent,
			allowEarlyReview,
			generation: { recentQuestionsToAvoid: recent },
		})).question;
	}

	private async nextSessionQuestion(): Promise<TranslationQuestion | undefined> {
		const question = this.sessionQueue.shift();
		if (question) await this.markQuestionForDisplay(question, true);
		return question;
	}

	private async markQuestionForDisplay(question: TranslationQuestion, manual: boolean): Promise<void> {
		const now = new Date();
		this.data.questionProgress[question.id] = markQuestionShown(this.data.questionProgress[question.id], now);
		if (manual) this.data.scheduler = markExerciseShown(this.data.scheduler, now);
		await this.savePluginData();
	}

	private async evaluateAnswer(
		question: TranslationQuestion,
		answer: string,
		hintUsed: boolean,
		responseTimeMs: number,
	): Promise<TranslationEvaluation> {
		const allowedTopics = question.topics
			.map((id) => topicById(id))
			.filter((topic): topic is GrammarTopic => topic !== undefined);
		const result = await this.provider.evaluateAnswer({ question, userAnswer: answer, allowedTopics });
		const timestamp = new Date().toISOString();
		const attempt: TranslationAttempt = {
			schemaVersion: ATTEMPT_SCHEMA_VERSION,
			id: crypto.randomUUID(),
			questionId: question.id,
			timestamp,
			userAnswer: answer,
			evaluation: result.data,
			hintUsed,
			responseTimeMs,
			provider: result.metadata.provider,
			model: result.metadata.model,
			promptVersion: result.metadata.promptVersion,
			llmLatencyMs: result.metadata.latencyMs,
		};
		await this.fileStore.appendAttempt(attempt);
		this.data.questionProgress[question.id] = applyEvaluation(
			this.data.questionProgress[question.id],
			result.data,
			new Date(timestamp),
		).progress;
		this.data.statisticsCache.attemptCount += 1;
		this.data.statisticsCache.lastRebuiltAt = undefined;
		await this.savePluginData();
		return result.data;
	}

	private async snooze(questionId: string): Promise<void> {
		this.data.questionProgress[questionId] = snoozeQuestion(this.data.questionProgress[questionId]);
		await this.savePluginData();
	}

	private async loadStatistics(period: StatisticsPeriod): Promise<StatisticsSnapshot> {
		try {
			const questions = await this.questions.allQuestions();
			const result = await this.statistics.rebuild(questions, { period });
			return withTopicLabels(result.snapshot);
		} catch (error) {
			this.reporter.report(error, 'Не удалось загрузить статистику.');
			return buildStatisticsSnapshot([], { period });
		}
	}

	private async openStatistics(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(STATISTICS_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf(true);
		if (!existing) await leaf.setViewState({ type: STATISTICS_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	private settingsActions(): SettingsTabActions {
		return {
			settings: () => this.data.settings,
			update: async (patch) => {
				const previousPath = this.data.settings.vocabularyPath;
				const previousSection = this.data.settings.vocabularySection;
				this.data.settings = mergeSettings({ ...this.data.settings, ...patch });
				await this.savePluginData();
				if (previousPath !== this.data.settings.vocabularyPath || previousSection !== this.data.settings.vocabularySection) {
					await this.safeReindexVocabulary();
				} else {
					await this.rebuildRuntimeServices();
				}
			},
			setApiKey: async (value) => {
				this.apiKeys.set(value);
				await this.rebuildRuntimeServices();
			},
			hasApiKey: async () => this.apiKeys.get() !== null,
			testConnection: async () => this.provider.testConnection(),
			importQuestionBank: () => this.importActiveQuestionBank(),
			reindexVocabulary: async () => ({ count: await this.safeReindexVocabulary() }),
			getVocabularyDiagnostics: async () => this.vocabulary.entries.map(({ displayTerm, translation }) => ({ displayTerm, translation })),
			startExercise: async () => { await this.openExercise(true, false); },
			openStatistics: () => this.openStatistics(),
			togglePause: () => this.togglePause(),
		};
	}

	private async importActiveQuestionBank(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'jsonl') {
			throw userError('Откройте JSONL-файл банка в Obsidian и повторите импорт.');
		}
		const result = await this.questions.importJsonl(await this.app.vault.read(file));
		new Notice(`Импортировано: ${result.accepted}. Пропущено: ${result.skipped}.`);
	}

	private async reindexVocabularyWithNotice(): Promise<void> {
		const count = await this.safeReindexVocabulary();
		new Notice(`Распознано слов: ${count}.`);
	}

	private async togglePause(): Promise<void> {
		this.data.settings.paused = !this.data.settings.paused;
		await this.savePluginData();
		new Notice(this.data.settings.paused ? 'Автоматические упражнения приостановлены.' : 'Автоматические упражнения возобновлены.');
	}

	private async savePluginData(): Promise<void> {
		await this.dataStore.save(this.data);
	}
}

function withTopicLabels(snapshot: StatisticsSnapshot): StatisticsSnapshot {
	const label = <T extends { id: string; label: string }>(item: T): T => ({
		...item,
		label: topicById(item.id)?.title ?? item.label,
	});
	return {
		...snapshot,
		topicDistribution: snapshot.topicDistribution.map(label),
		topicRankings: snapshot.topicRankings.map(label),
		easiestTopics: snapshot.easiestTopics.map(label),
		hardestTopics: snapshot.hardestTopics.map(label),
	};
}

function userError(message: string): Error & { userMessage: string } {
	return Object.assign(new Error(message), { userMessage: message });
}

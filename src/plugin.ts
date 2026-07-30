import { Notice, Plugin, TFile } from 'obsidian';
import type {
	GrammarTopic,
	TranslationAttempt,
	TranslationEvaluation,
	TranslationQuestion,
	VocabularyAddition,
	VocabularyAdditionResult,
} from './domain/types';
import { ATTEMPT_SCHEMA_VERSION } from './domain/constants';
import { DiagnosticLog } from './diagnostics';
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
	DeviceLlmSettingsStore,
	isVocabularyConfigured,
	mergeSettings,
	pickDeviceLlmSettings,
	settingsForVault,
	type DeviceLlmSettings,
	type ExerciseDisplayMode,
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
	ExerciseDisplayModeModal,
	LoadingModal,
	STATISTICS_VIEW_TYPE,
	StatisticsView,
	TRANSLATION_VIEW_TYPE,
	TranslationModal,
	TranslationView,
	type TranslationExerciseOptions,
} from './ui';
import { VocabularyService } from './vocabulary/service';

export default class TranslationTrainerPlugin extends Plugin {
	private dataStore!: PluginDataStore;
	private data!: PluginData;
	private fileStore!: TranslationTrainerFileStore;
	private apiKeys!: ApiKeyStore;
	private deviceLlmSettings!: DeviceLlmSettingsStore;
	private synchronizedLlmFallback!: DeviceLlmSettings;
	private vocabulary!: VocabularyService;
	private provider!: LlmProvider;
	private questions?: QuestionService;
	private statistics!: StatisticsService;
	private scheduler!: ReviewScheduler;
	private reporter = new ErrorReporter();
	private diagnosticLog!: DiagnosticLog;
	private exerciseOpen = false;
	private sessionQueue: TranslationQuestion[] = [];
	private reindexTimer?: number;
	private vocabularyRevision = 0;

	async onload(): Promise<void> {
		this.dataStore = new PluginDataStore(this);
		this.data = await this.dataStore.load();
		this.synchronizedLlmFallback = pickDeviceLlmSettings(this.data.settings);
		this.deviceLlmSettings = new DeviceLlmSettingsStore(this.app);
		this.data.settings = mergeSettings({ ...this.data.settings, ...this.deviceLlmSettings.load(this.data.settings) });
		this.apiKeys = new ApiKeyStore(this.app);
		this.diagnosticLog = new DiagnosticLog(this.app.vault.adapter);
		try {
			await this.diagnosticLog.initialize();
		} catch (error) {
			this.reporter.report(error, 'Не удалось инициализировать журнал ошибок Translation Trainer.');
		}
		this.reporter = new ErrorReporter((error, context) => this.diagnosticLog.append(error, context));
		this.fileStore = new TranslationTrainerFileStore(this.app.vault.adapter, (diagnostic) => {
			const location = diagnostic.line ? `${diagnostic.path}:${diagnostic.line}` : diagnostic.path;
			this.reporter.report(new Error(`${diagnostic.message} (${location})`), `Ошибка данных Translation Trainer: ${diagnostic.message}`);
		});
		await this.fileStore.ensureServiceDirectories();
		this.vocabulary = new VocabularyService(this.app.vault);
		this.rebuildProvider();
		this.statistics = new StatisticsService(this.fileStore);

		this.registerView(
			STATISTICS_VIEW_TYPE,
			(leaf) => new StatisticsView(leaf, {
				load: (period) => this.loadStatistics(period),
				drilldownWord: (id) => this.statistics.drilldownWord(id),
				drilldownTopic: (id) => this.statistics.drilldownTopic(id),
			}),
		);
		this.registerView(
			TRANSLATION_VIEW_TYPE,
			(leaf) => new TranslationView(leaf, {
				startExercise: async () => { await this.openExercise(true, false, 'sidebar'); },
			}),
		);
		this.addSettingTab(new TranslationTrainerSettingsTab(this.app, this, this.settingsActions(), this.reporter));
		this.registerCommands();

		this.scheduler = new ReviewScheduler({
			getSettings: () => this.data.settings,
			getState: () => this.data.scheduler,
			saveState: async (state) => {
				this.data.scheduler = state;
				await this.savePluginData();
			},
			isModalOpen: () => this.exerciseOpen,
			isAppActive: () => activeDocument.visibilityState === 'visible' && activeDocument.hasFocus(),
			showAutomaticExercise: () => this.openExercise(false, false),
		});
		this.registerInterval(window.setInterval(() => {
			if (!this.questions) return;
			void this.scheduler.check().catch((error: unknown) => this.reporter.report(error, 'Не удалось проверить расписание упражнений.'));
		}, 60_000));
		this.registerInterval(window.setInterval(() => {
			void this.diagnosticLog.prune();
		}, 60 * 60_000));
		this.register(() => {
			if (this.reindexTimer !== undefined) window.clearTimeout(this.reindexTimer);
		});
		this.app.workspace.onLayoutReady(() => {
			this.registerVocabularyEvents();
			void this.safeReindexVocabulary().catch((error: unknown) => {
				this.reporter.report(error, 'Не удалось запустить Translation Trainer.');
			});
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
			id: 'open-translation-panel',
			name: 'Открыть панель переводов',
			callback: () => void this.openTranslationPanel()
				.catch((error: unknown) => this.reporter.report(error, 'Не удалось открыть панель переводов.')),
		});
		this.addCommand({
			id: 'choose-exercise-display-mode',
			name: 'Выбрать режим показа переводов',
			callback: () => new ExerciseDisplayModeModal(
				this.app,
				this.data.settings.exerciseDisplayMode,
				(mode) => void this.setExerciseDisplayMode(mode)
					.catch((error: unknown) => this.reporter.report(error, 'Не удалось изменить режим показа переводов.')),
			).open(),
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
			void this.savePluginData()
				.then(() => this.safeReindexVocabulary())
				.catch((error: unknown) => this.reporter.report(error, 'Не удалось обновить путь к заметке со словами.'));
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file.path === this.data.settings.vocabularyPath) {
				this.data.settings.vocabularyPath = '';
				this.deactivateVocabularyRuntime();
				void this.savePluginData()
					.then(() => new Notice('Файл со словами был удалён. Упражнения отключены до выбора новой заметки.'))
					.catch((error: unknown) => this.reporter.report(error, 'Не удалось сохранить очистку пути к заметке со словами.'));
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
		this.deactivateVocabularyRuntime();
		const revision = this.vocabularyRevision;
		if (!isVocabularyConfigured(this.data.settings)) {
			return 0;
		}
		try {
			const index = await this.vocabulary.buildIndex(
				this.data.settings.vocabularyPath,
				this.data.settings.vocabularySection,
			);
			if (revision !== this.vocabularyRevision) return 0;
			this.vocabulary.use(index);
			await this.rebuildRuntimeServices(revision);
			return index.size;
		} catch (error) {
			if (revision !== this.vocabularyRevision) return 0;
			this.deactivateVocabularyRuntime();
			this.reporter.report(error, 'Не удалось подготовить заметку со словами.');
			return 0;
		}
	}

	private async rebuildRuntimeServices(expectedVocabularyRevision = this.vocabularyRevision): Promise<void> {
		this.rebuildProvider();
		const topicIds = GRAMMAR_TOPICS.map((topic) => topic.id);
		const vocabularyKeys = this.vocabulary.entries.map((entry) => entry.canonicalKey);
		const questions = new QuestionService({
			store: this.fileStore,
			provider: this.provider,
			topics: GRAMMAR_TOPICS,
			validateQuestion: questionValidator(topicIds, vocabularyKeys),
		});
		await questions.initialize();
		if (expectedVocabularyRevision === this.vocabularyRevision &&
			isVocabularyConfigured(this.data.settings)) {
			this.questions = questions;
		}
	}

	private rebuildProvider(): void {
		this.provider = new OpenAiCompatibleProvider({
			baseUrl: this.data.settings.endpoint,
			model: this.data.settings.model,
			apiKey: this.apiKeys.get() ?? undefined,
			timeoutMs: this.data.settings.timeoutMs,
		});
	}

	private deactivateVocabularyRuntime(): void {
		this.vocabularyRevision += 1;
		this.questions = undefined;
		this.vocabulary.clear();
	}

	private async openExercise(
		manual: boolean,
		sessionMode: boolean,
		displayMode = this.data.settings.exerciseDisplayMode,
	): Promise<boolean> {
		const questions = this.questions;
		if (!questions) {
			if (manual) new Notice('Сначала выберите заметку со словами в настройках плагина.');
			return false;
		}
		if (this.exerciseOpen) {
			if (manual) new Notice('Упражнение уже открыто.');
			return false;
		}
		this.exerciseOpen = true;
		let exerciseOpened = false;
		let cancelled = false;
		let loadingModal: LoadingModal | undefined;
		let translationView: TranslationView | undefined;
		const loadingText = sessionMode ? 'Готовим сессию повторения…' : 'Готовим задание…';
		try {
			if (displayMode === 'sidebar') {
				translationView = await this.openTranslationPanel();
				translationView.showLoading(loadingText, () => { cancelled = true; });
			} else {
				loadingModal = new LoadingModal(
					this.app,
					loadingText,
					() => { cancelled = true; },
					this.data.settings.exerciseModalWidth,
				);
				loadingModal.open();
			}
			let question: TranslationQuestion | undefined;
			if (sessionMode) {
				const all = await questions.allQuestions();
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
			loadingModal?.finish();
			translationView?.finishLoading();
			const exerciseOptions: TranslationExerciseOptions = {
				question,
				reporter: this.reporter,
				actions: {
					evaluate: (current, answer, hintUsed, responseTimeMs) => this.evaluateAnswer(current, answer, hintUsed, responseTimeMs),
					askFollowUp: async (current, answer, evaluation, history, userQuestion) => (await this.provider.answerFollowUp({ question: current, userAnswer: answer, evaluation, history: [...history], userQuestion })).data,
					addVocabulary: (additions) => this.addVocabulary(additions),
					snooze: (questionId) => this.snooze(questionId),
					next: sessionMode ? () => this.nextSessionQuestion() : () => this.nextRegularQuestion(),
					onClose: () => { this.exerciseOpen = false; this.sessionQueue = []; },
				},
			};
			if (displayMode === 'sidebar') {
				translationView ??= await this.openTranslationPanel();
				translationView.showExercise(exerciseOptions);
			} else {
				new TranslationModal(this.app, {
					...exerciseOptions,
					widthPx: this.data.settings.exerciseModalWidth,
				}).open();
			}
			exerciseOpened = true;
			return true;
		} catch (error) {
			this.reporter.report(error, 'Не удалось открыть упражнение.');
			return false;
		} finally {
			loadingModal?.finish();
			translationView?.finishLoading();
			if (!exerciseOpened) this.exerciseOpen = false;
		}
	}

	private async addVocabulary(additions: readonly VocabularyAddition[]): Promise<VocabularyAdditionResult> {
		if (!isVocabularyConfigured(this.data.settings)) {
			throw userError('Сначала выберите заметку со словами в настройках плагина.');
		}
		const result = await this.vocabulary.addEntries(
			this.data.settings.vocabularyPath,
			this.data.settings.vocabularySection,
			additions,
		);
		if (result.added.length) {
			if (this.reindexTimer !== undefined) {
				window.clearTimeout(this.reindexTimer);
				this.reindexTimer = undefined;
			}
			await this.safeReindexVocabulary();
		}
		return result;
	}

	private async nextAdaptiveQuestion(allowEarlyReview: boolean): Promise<TranslationQuestion> {
		const questions = this.requireQuestionService();
		const all = await questions.allQuestions();
		const result = await this.statistics.rebuild(all, { period: 'all' });
		const statistics = this.statistics.selectionStatistics(result.snapshot);
		const recent = recentQuestionIds(result.snapshot.attempts);
		return (await questions.next({
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

	private async nextRegularQuestion(): Promise<TranslationQuestion> {
		const question = await this.nextAdaptiveQuestion(true);
		await this.markQuestionForDisplay(question, true);
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
		const questions = this.questions;
		if (!questions) return buildStatisticsSnapshot([], { period });
		try {
			const allQuestions = await questions.allQuestions();
			const result = await this.statistics.rebuild(allQuestions, { period });
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

	private async openTranslationPanel(): Promise<TranslationView> {
		const existing = this.app.workspace.getLeavesOfType(TRANSLATION_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(true);
		if (!leaf) throw userError('Не удалось открыть боковую панель переводов.');
		if (!existing) await leaf.setViewState({ type: TRANSLATION_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
		if (!(leaf.view instanceof TranslationView)) {
			throw userError('Не удалось подготовить боковую панель переводов.');
		}
		return leaf.view;
	}

	private async setExerciseDisplayMode(mode: ExerciseDisplayMode): Promise<void> {
		this.data.settings.exerciseDisplayMode = mode;
		await this.savePluginData();
		if (mode === 'sidebar') await this.openTranslationPanel();
		new Notice(mode === 'sidebar'
			? 'Новые переводы будут открываться в боковой панели.'
			: 'Новые переводы будут открываться в окне поверх заметок.');
	}

	private settingsActions(): SettingsTabActions {
		return {
			settings: () => this.data.settings,
			update: async (patch) => {
				const previousPath = this.data.settings.vocabularyPath;
				const previousSection = this.data.settings.vocabularySection;
				this.data.settings = mergeSettings({ ...this.data.settings, ...patch });
				if ('endpoint' in patch || 'model' in patch || 'timeoutMs' in patch) {
					this.deviceLlmSettings.save(this.data.settings);
				}
				await this.savePluginData();
				if (previousPath !== this.data.settings.vocabularyPath || previousSection !== this.data.settings.vocabularySection) {
					if (this.app.workspace.layoutReady) await this.safeReindexVocabulary();
				} else if ('endpoint' in patch || 'model' in patch || 'timeoutMs' in patch) {
					const runtimeWasActive = this.questions !== undefined;
					this.rebuildProvider();
					if (runtimeWasActive) await this.rebuildRuntimeServices();
				}
			},
			setApiKey: async (value) => {
				this.apiKeys.set(value);
				const runtimeWasActive = this.questions !== undefined;
				this.rebuildProvider();
				if (runtimeWasActive) await this.rebuildRuntimeServices();
			},
			hasApiKey: async () => this.apiKeys.get() !== null,
			testConnection: async () => this.provider.testConnection(),
			readDiagnosticLog: () => this.diagnosticLog.readText(),
			importQuestionBank: () => this.importActiveQuestionBank(),
			reindexVocabulary: async () => {
				if (!isVocabularyConfigured(this.data.settings)) {
					throw userError('Сначала выберите заметку со словами в настройках плагина.');
				}
				return { count: await this.safeReindexVocabulary() };
			},
			getVocabularyDiagnostics: async () => this.vocabulary.entries.map(({ displayTerm, translation }) => ({ displayTerm, translation })),
			startExercise: async () => { await this.openExercise(true, false); },
			openTranslationPanel: async () => { await this.openTranslationPanel(); },
			openStatistics: () => this.openStatistics(),
			togglePause: () => this.togglePause(),
		};
	}

	private async importActiveQuestionBank(): Promise<void> {
		const questions = this.requireQuestionService();
		const file = this.app.workspace.getActiveFile();
		if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'jsonl') {
			throw userError('Откройте JSONL-файл банка в Obsidian и повторите импорт.');
		}
		const result = await questions.importJsonl(await this.app.vault.read(file));
		new Notice(`Импортировано: ${result.accepted}. Пропущено: ${result.skipped}.`);
	}

	private async reindexVocabularyWithNotice(): Promise<void> {
		if (!isVocabularyConfigured(this.data.settings)) {
			new Notice('Сначала выберите заметку со словами в настройках плагина.');
			return;
		}
		const count = await this.safeReindexVocabulary();
		new Notice(`Распознано слов: ${count}.`);
	}

	private async togglePause(): Promise<void> {
		this.data.settings.paused = !this.data.settings.paused;
		await this.savePluginData();
		new Notice(this.data.settings.paused ? 'Автоматические упражнения приостановлены.' : 'Автоматические упражнения возобновлены.');
	}

	private async savePluginData(): Promise<void> {
		await this.dataStore.save({
			...this.data,
			settings: settingsForVault(this.data.settings, this.synchronizedLlmFallback),
		});
	}

	private requireQuestionService(): QuestionService {
		if (!this.questions) {
			throw userError('Сначала выберите заметку со словами в настройках плагина.');
		}
		return this.questions;
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

import { Component, Notice, type App } from 'obsidian';
import type {
	FollowUpMessage,
	TranslationEvaluation,
	TranslationQuestion,
	VocabularyAddition,
	VocabularyAdditionResult,
} from '../domain/types';
import { enhanceButtonMotion } from './button-motion';
import type { ErrorReporter } from './error-reporter';
import { renderFollowUpView } from './follow-up-view';
import { renderTranslationResult } from './result-view';
import { createTokenStream, type TokenStreamAnimation } from './token-stream';
import { VocabularyEntryEditor } from './vocabulary-entry-editor';

export interface TranslationExerciseActions {
	evaluate(question: TranslationQuestion, answer: string, hintUsed: boolean, responseTimeMs: number): Promise<TranslationEvaluation>;
	askFollowUp(question: TranslationQuestion, answer: string, evaluation: TranslationEvaluation, history: readonly FollowUpMessage[], userQuestion: string): Promise<string>;
	addVocabulary(additions: readonly VocabularyAddition[]): Promise<VocabularyAdditionResult>;
	snooze(questionId: string): Promise<void>;
	next?(): Promise<TranslationQuestion | undefined>;
	onClose?(): void;
}

export interface TranslationExerciseOptions {
	question: TranslationQuestion;
	actions: TranslationExerciseActions;
	reporter: ErrorReporter;
	autoFocus?: boolean;
}

export class TranslationExercise {
	private contentEl?: HTMLElement;
	private question: TranslationQuestion;
	private answer = '';
	private evaluation?: TranslationEvaluation;
	private technicalDetails?: string;
	private submitting = false;
	private showTopics = false;
	private showVocabulary = false;
	private showVocabularyEditor = false;
	private shownAt = Date.now();
	private tokenStream?: TokenStreamAnimation;
	private followUpDraft = '';
	private followUpMessages: FollowUpMessage[] = [];
	private followUpDiagnostic?: string;
	private askingFollowUp = false;
	private markdownComponent?: Component;
	private readonly vocabularyEntryEditor: VocabularyEntryEditor;

	constructor(
		private readonly app: App,
		private readonly options: TranslationExerciseOptions,
		private readonly requestClose: () => void,
	) {
		this.question = options.question;
		this.vocabularyEntryEditor = new VocabularyEntryEditor(
			(additions) => options.actions.addVocabulary(additions),
			options.reporter,
		);
	}

	mount(contentEl: HTMLElement): void {
		this.contentEl = contentEl;
		this.render();
	}

	unmount(): void {
		this.stopTokenStream();
		this.unloadMarkdown();
		this.contentEl = undefined;
	}

	private render(): void {
		const contentEl = this.contentEl;
		if (!contentEl) return;
		this.stopTokenStream();
		this.unloadMarkdown();
		contentEl.empty();
		contentEl.addClass('translation-trainer-exercise');
		contentEl.createEl('h2', { text: 'Перевод на английский' });
		contentEl.createEl('p', { text: this.question.sourceRu, cls: 'translation-trainer-source' });
		contentEl.createEl('p', { text: `Уровень: ${this.question.level} · Сложность: ${Math.round(this.question.difficulty * 100)}/100`, cls: 'translation-trainer-meta' });
		const reveals = contentEl.createDiv({ cls: 'translation-trainer-reveals' });
		const vocabularyButton = enhanceButtonMotion(reveals.createEl('button', { text: this.showVocabulary ? 'Скрыть слова' : 'Показать слова' }));
		vocabularyButton.addEventListener('click', () => { this.showVocabulary = !this.showVocabulary; this.render(); });
		const topicButton = enhanceButtonMotion(reveals.createEl('button', { text: this.showTopics ? 'Скрыть тему' : 'Показать тему' }));
		topicButton.addEventListener('click', () => { this.showTopics = !this.showTopics; this.render(); });
		const addVocabularyButton = enhanceButtonMotion(reveals.createEl('button', { text: this.showVocabularyEditor ? 'Скрыть добавление' : 'Добавить слова' }));
		addVocabularyButton.addEventListener('click', () => { this.showVocabularyEditor = !this.showVocabularyEditor; this.render(); });
		if (this.showVocabulary) contentEl.createEl('p', { text: `Слова: ${this.question.targetVocabulary.join(', ') || '—'}`, cls: 'translation-trainer-hint-panel' });
		if (this.showTopics) contentEl.createEl('p', { text: `Темы: ${this.question.topics.join(', ') || '—'}`, cls: 'translation-trainer-hint-panel' });
		if (this.showVocabularyEditor) this.vocabularyEntryEditor.render(contentEl);

		if (!this.evaluation) this.renderEditor(contentEl);
		else this.renderResult(contentEl, this.evaluation);
	}

	private renderEditor(contentEl: HTMLElement): void {
		const textarea = contentEl.createEl('textarea', { cls: 'translation-trainer-answer', attr: { placeholder: 'Введите перевод на английский', rows: '6' } });
		textarea.value = this.answer;
		textarea.addEventListener('input', () => { this.answer = textarea.value; });
		if (this.options.autoFocus !== false) textarea.focus();
		const controls = contentEl.createDiv({ cls: 'translation-trainer-controls' });
		const check = enhanceButtonMotion(controls.createEl('button', { text: this.submitting ? 'Проверяем…' : 'Проверить', cls: 'mod-cta' }));
		check.disabled = this.submitting;
		check.addEventListener('click', () => void this.submit());
		const snooze = enhanceButtonMotion(controls.createEl('button', { text: 'Отложить' }));
		snooze.disabled = this.submitting;
		snooze.addEventListener('click', () => void this.snooze());
		if (this.submitting) this.tokenStream = createTokenStream(contentEl, 'Проверяем перевод');
		if (this.technicalDetails) {
			const details = contentEl.createEl('details', { cls: 'translation-trainer-diagnostics' });
			details.createEl('summary', { text: 'Технические детали' });
			details.createEl('pre', { text: this.technicalDetails });
		}
	}

	private async submit(): Promise<void> {
		if (this.submitting) return;
		if (!this.answer.trim()) { new Notice('Введите перевод перед проверкой.'); return; }
		this.submitting = true;
		this.technicalDetails = undefined;
		this.render();
		try {
			this.evaluation = await this.options.actions.evaluate(this.question, this.answer, this.showTopics || this.showVocabulary, Date.now() - this.shownAt);
		} catch (error) {
			this.options.reporter.report(error, 'Не удалось проверить перевод. Текст ответа сохранён.');
			this.technicalDetails = this.options.reporter.diagnostics(error);
		} finally {
			this.submitting = false;
			this.stopTokenStream();
			this.render();
		}
	}

	private async snooze(): Promise<void> {
		if (this.submitting) return;
		try {
			await this.options.actions.snooze(this.question.id);
			this.requestClose();
		} catch (error) {
			this.options.reporter.report(error, 'Не удалось отложить задание.');
		}
	}

	private renderResult(contentEl: HTMLElement, result: TranslationEvaluation): void {
		renderTranslationResult(contentEl, result, this.answer);
		this.tokenStream = renderFollowUpView(contentEl, {
			app: this.app,
			component: this.loadMarkdown(),
			messages: this.followUpMessages,
			draft: this.followUpDraft,
			loading: this.askingFollowUp,
			diagnostic: this.followUpDiagnostic,
			onDraftChange: value => { this.followUpDraft = value; },
			onSubmit: () => void this.submitFollowUp(),
		});
		const controls = contentEl.createDiv({ cls: 'translation-trainer-controls translation-trainer-result-controls' });
		if (this.options.actions.next) {
			const next = enhanceButtonMotion(controls.createEl('button', { text: this.submitting ? 'Готовим…' : 'Далее', cls: 'mod-cta' }));
			next.disabled = this.askingFollowUp || this.submitting;
			next.addEventListener('click', () => void this.loadNext());
		}
		const close = enhanceButtonMotion(controls.createEl('button', { text: 'Закрыть' }));
		close.disabled = this.submitting;
		close.addEventListener('click', this.requestClose);
		if (this.submitting) this.tokenStream = createTokenStream(contentEl, 'Готовим следующее задание');
	}

	private async submitFollowUp(): Promise<void> {
		if (this.askingFollowUp || !this.evaluation) return;
		const userQuestion = this.followUpDraft.trim();
		if (!userQuestion) return;
		const history = [...this.followUpMessages];
		this.followUpMessages.push({ role: 'user', content: userQuestion });
		this.followUpDraft = '';
		this.followUpDiagnostic = undefined;
		this.askingFollowUp = true;
		this.render();
		try {
			const response = await this.options.actions.askFollowUp(this.question, this.answer, this.evaluation, history, userQuestion);
			this.followUpMessages.push({ role: 'assistant', content: response });
		} catch (error) {
			this.followUpMessages.pop();
			this.followUpDraft = userQuestion;
			this.options.reporter.report(error, 'Не удалось получить ответ на уточнение. Текст вопроса сохранён.');
			this.followUpDiagnostic = this.options.reporter.diagnostics(error);
		} finally {
			this.askingFollowUp = false;
			this.stopTokenStream();
			this.render();
		}
	}

	private async loadNext(): Promise<void> {
		if (!this.options.actions.next || this.submitting || this.askingFollowUp) return;
		this.submitting = true;
		this.render();
		try {
			const next = await this.options.actions.next();
			if (!next) {
				new Notice('Больше заданий пока нет.');
				this.requestClose();
				return;
			}
			this.question = next;
			this.answer = '';
			this.evaluation = undefined;
			this.technicalDetails = undefined;
			this.showTopics = false;
			this.showVocabulary = false;
			this.showVocabularyEditor = false;
			this.followUpDraft = '';
			this.followUpMessages = [];
			this.followUpDiagnostic = undefined;
			this.shownAt = Date.now();
		} catch (error) {
			this.options.reporter.report(error, 'Не удалось загрузить следующее задание.');
		} finally {
			this.submitting = false;
			this.render();
		}
	}

	private stopTokenStream(): void { this.tokenStream?.stop(); this.tokenStream = undefined; }
	private loadMarkdown(): Component { const component = new Component(); component.load(); this.markdownComponent = component; return component; }
	private unloadMarkdown(): void { this.markdownComponent?.unload(); this.markdownComponent = undefined; }
}

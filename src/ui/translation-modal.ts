import { App, Modal, Notice } from 'obsidian';
import type { TranslationEvaluation, TranslationQuestion } from '../domain/types';
import { enhanceButtonMotion } from './button-motion';
import { ErrorReporter } from './error-reporter';
import { renderTranslationResult } from './result-view';

export interface TranslationModalActions {
	evaluate(question: TranslationQuestion, answer: string, hintUsed: boolean, responseTimeMs: number): Promise<TranslationEvaluation>;
	snooze(questionId: string): Promise<void>;
	next?(): Promise<TranslationQuestion | undefined>;
	onClose?(): void;
}

export interface TranslationModalOptions {
	question: TranslationQuestion;
	actions: TranslationModalActions;
	reporter: ErrorReporter;
	sessionMode?: boolean;
}

export class TranslationModal extends Modal {
	private question: TranslationQuestion;
	private answer = '';
	private evaluation?: TranslationEvaluation;
	private technicalDetails?: string;
	private submitting = false;
	private showTopics = false;
	private showVocabulary = false;
	private shownAt = Date.now();
	private pseudoWordTimer?: number;
	private pseudoWordIndex = 0;
	private readonly pseudoWords = ['mira', 'tavo', 'neli', 'sora', 'vemi'];

	constructor(app: App, private readonly options: TranslationModalOptions) {
		super(app);
		this.question = options.question;
	}

	onOpen(): void { this.render(); }
	onClose(): void { this.stopPseudoWords(); this.options.actions.onClose?.(); }

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('translation-trainer-modal');
		contentEl.createEl('h2', { text: 'Перевод на английский' });
		contentEl.createEl('p', { text: this.question.sourceRu, cls: 'translation-trainer-source' });
		contentEl.createEl('p', { text: `Уровень: ${this.question.level} · Сложность: ${Math.round(this.question.difficulty * 100)}/100`, cls: 'translation-trainer-meta' });
		const reveals = contentEl.createDiv({ cls: 'translation-trainer-reveals' });
		const vocabularyButton = enhanceButtonMotion(reveals.createEl('button', { text: this.showVocabulary ? 'Скрыть слова' : 'Показать слова' }));
		vocabularyButton.addEventListener('click', () => { this.showVocabulary = !this.showVocabulary; this.render(); });
		const topicButton = enhanceButtonMotion(reveals.createEl('button', { text: this.showTopics ? 'Скрыть тему' : 'Показать тему' }));
		topicButton.addEventListener('click', () => { this.showTopics = !this.showTopics; this.render(); });
		if (this.showVocabulary) contentEl.createEl('p', { text: `Слова: ${this.question.targetVocabulary.join(', ') || '—'}`, cls: 'translation-trainer-hint-panel' });
		if (this.showTopics) contentEl.createEl('p', { text: `Темы: ${this.question.topics.join(', ') || '—'}`, cls: 'translation-trainer-hint-panel' });

		if (!this.evaluation) this.renderEditor(contentEl);
		else this.renderResult(contentEl, this.evaluation);
	}

	private renderEditor(contentEl: HTMLElement): void {
		const textarea = contentEl.createEl('textarea', { cls: 'translation-trainer-answer', attr: { placeholder: 'Введите перевод на английский', rows: '6' } });
		textarea.value = this.answer;
		textarea.addEventListener('input', () => { this.answer = textarea.value; });
		textarea.focus();
		const controls = contentEl.createDiv({ cls: 'translation-trainer-controls' });
		const check = enhanceButtonMotion(controls.createEl('button', { text: this.submitting ? 'Проверяем…' : 'Проверить', cls: 'mod-cta' }));
		check.disabled = this.submitting;
		check.addEventListener('click', () => void this.submit());
		const snooze = enhanceButtonMotion(controls.createEl('button', { text: 'Отложить' }));
		snooze.disabled = this.submitting;
		snooze.addEventListener('click', () => void this.snooze());
		if (this.submitting) {
			const status = contentEl.createEl('p', { text: 'Проверяем перевод…', cls: 'translation-trainer-evaluating', attr: { 'aria-live': 'polite' } });
			const token = status.createSpan({ text: ` ${this.pseudoWords[this.pseudoWordIndex] ?? ''}`, cls: 'translation-trainer-pseudo-word' });
			this.startPseudoWords(token);
		}
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
			this.submitting = false; this.stopPseudoWords();
			this.render();
		}
	}

	private async snooze(): Promise<void> {
		if (this.submitting) return;
		try { await this.options.actions.snooze(this.question.id); this.close(); }
		catch (error) { this.options.reporter.report(error, 'Не удалось отложить задание.'); }
	}

	private renderResult(contentEl: HTMLElement, result: TranslationEvaluation): void {
		renderTranslationResult(contentEl, result, this.answer);
		const controls = contentEl.createDiv({ cls: 'translation-trainer-controls' });
		if (this.options.sessionMode && this.options.actions.next) {
			const next = enhanceButtonMotion(controls.createEl('button', { text: 'Следующее', cls: 'mod-cta' }));
			next.addEventListener('click', () => void this.loadNext());
		}
		const close = enhanceButtonMotion(controls.createEl('button', { text: 'Закрыть' }));
		close.addEventListener('click', () => this.close());
	}

	private async loadNext(): Promise<void> {
		if (!this.options.actions.next || this.submitting) return;
		this.submitting = true; this.render();
		try {
			const next = await this.options.actions.next();
			if (!next) { new Notice('Больше заданий пока нет.'); this.close(); return; }
			this.question = next; this.answer = ''; this.evaluation = undefined; this.technicalDetails = undefined; this.showTopics = false; this.showVocabulary = false; this.shownAt = Date.now();
		} catch (error) { this.options.reporter.report(error, 'Не удалось загрузить следующее задание.'); }
		finally { this.submitting = false; if (this.modalEl.isConnected) this.render(); }
	}

	private startPseudoWords(token: HTMLElement): void {
		this.stopPseudoWords();
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		this.pseudoWordTimer = window.setInterval(() => {
			this.pseudoWordIndex = (this.pseudoWordIndex + 1) % this.pseudoWords.length;
			token.setText(` ${this.pseudoWords[this.pseudoWordIndex] ?? ''}`);
		}, 120);
	}

	private stopPseudoWords(): void { if (this.pseudoWordTimer !== undefined) { window.clearInterval(this.pseudoWordTimer); this.pseudoWordTimer = undefined; } }
}

export class LoadingModal extends Modal {
	private timer?: number;
	private index = 0;
	private finished = false;
	private readonly pseudoWords = ['mira', 'tavo', 'neli', 'sora', 'vemi'];
	constructor(app: App, private readonly text = 'Готовим задание…', private readonly onCancel?: () => void) { super(app); }
	onOpen(): void { this.contentEl.empty(); this.contentEl.addClass('translation-trainer-loading'); const status = this.contentEl.createEl('p', { text: this.text, attr: { 'aria-live': 'polite' } }); const token = status.createSpan({ text: ` ${this.pseudoWords[0] ?? ''}`, cls: 'translation-trainer-pseudo-word' }); if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.timer = window.setInterval(() => { this.index = (this.index + 1) % this.pseudoWords.length; token.setText(` ${this.pseudoWords[this.index] ?? ''}`); }, 120); }
	finish(): void { this.finished = true; this.close(); }
	onClose(): void { if (this.timer !== undefined) window.clearInterval(this.timer); if (!this.finished) this.onCancel?.(); }
}

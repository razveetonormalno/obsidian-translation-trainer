import { App, Modal, Notice } from 'obsidian';
import type { TranslationEvaluation, TranslationQuestion } from '../domain/types';
import { enhanceButtonMotion } from './button-motion';
import { ErrorReporter } from './error-reporter';
import { renderTranslationResult } from './result-view';
import { createTokenStream, type TokenStreamAnimation } from './token-stream';

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
	widthPx: number;
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
	private tokenStream?: TokenStreamAnimation;
	private removeOutsideClickGuard?: () => void;

	constructor(app: App, private readonly options: TranslationModalOptions) {
		super(app);
		this.question = options.question;
	}

	onOpen(): void { applyModalWidth(this.modalEl, this.options.widthPx); this.removeOutsideClickGuard = guardAgainstOutsideClick(this.containerEl, this.modalEl); this.render(); }
	onClose(): void { this.removeOutsideClickGuard?.(); this.removeOutsideClickGuard = undefined; this.stopTokenStream(); this.options.actions.onClose?.(); }

	private render(): void {
		const { contentEl } = this;
		this.stopTokenStream();
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
			this.tokenStream = createTokenStream(contentEl, 'Проверяем перевод');
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
			this.submitting = false; this.stopTokenStream();
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

	private stopTokenStream(): void { this.tokenStream?.stop(); this.tokenStream = undefined; }
}

export class LoadingModal extends Modal {
	private finished = false;
	private tokenStream?: TokenStreamAnimation;
	private removeOutsideClickGuard?: () => void;
	constructor(app: App, private readonly text = 'Готовим задание…', private readonly onCancel?: () => void, private readonly widthPx = 760) { super(app); }
	onOpen(): void { applyModalWidth(this.modalEl, this.widthPx); this.removeOutsideClickGuard = guardAgainstOutsideClick(this.containerEl, this.modalEl); this.contentEl.empty(); this.contentEl.addClass('translation-trainer-loading'); this.tokenStream = createTokenStream(this.contentEl, this.text.replace(/…$/u, '')); }
	finish(): void { this.finished = true; this.close(); }
	onClose(): void { this.removeOutsideClickGuard?.(); this.removeOutsideClickGuard = undefined; this.tokenStream?.stop(); this.tokenStream = undefined; if (!this.finished) this.onCancel?.(); }
}

function applyModalWidth(modalEl: HTMLElement, widthPx: number): void {
	const width = Number.isFinite(widthPx) ? Math.max(320, Math.min(1600, Math.round(widthPx))) : 760;
	modalEl.addClass('translation-trainer-modal-shell');
	modalEl.style.setProperty('--translation-trainer-modal-width', `${width}px`);
}

function guardAgainstOutsideClick(containerEl: HTMLElement, modalEl: HTMLElement): () => void {
	const preventClose = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Node) || modalEl.contains(target)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	containerEl.addEventListener('click', preventClose, true);
	return () => containerEl.removeEventListener('click', preventClose, true);
}

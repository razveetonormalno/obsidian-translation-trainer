import { Modal, type App } from 'obsidian';
import {
	TranslationExercise,
	type TranslationExerciseActions,
	type TranslationExerciseOptions,
} from './translation-exercise';
import { createTokenStream, type TokenStreamAnimation } from './token-stream';

export type TranslationModalActions = TranslationExerciseActions;

export interface TranslationModalOptions extends TranslationExerciseOptions {
	widthPx: number;
}

export class TranslationModal extends Modal {
	private readonly exercise: TranslationExercise;
	private removeOutsideClickGuard?: () => void;

	constructor(app: App, private readonly options: TranslationModalOptions) {
		super(app);
		this.exercise = new TranslationExercise(app, options, () => this.close());
	}

	onOpen(): void {
		applyModalWidth(this.modalEl, this.options.widthPx);
		this.removeOutsideClickGuard = guardAgainstOutsideClick(this.containerEl, this.modalEl);
		this.contentEl.addClass('translation-trainer-modal');
		this.exercise.mount(this.contentEl);
	}

	onClose(): void {
		this.removeOutsideClickGuard?.();
		this.removeOutsideClickGuard = undefined;
		this.exercise.unmount();
		this.options.actions.onClose?.();
	}
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

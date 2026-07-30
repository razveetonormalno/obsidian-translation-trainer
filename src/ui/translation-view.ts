import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { enhanceButtonMotion } from './button-motion';
import { createTokenStream, type TokenStreamAnimation } from './token-stream';
import { TranslationExercise, type TranslationExerciseOptions } from './translation-exercise';

export const TRANSLATION_VIEW_TYPE = 'translation-trainer-exercise';

export interface TranslationViewActions {
	startExercise(): Promise<void>;
}

export class TranslationView extends ItemView {
	private exercise?: TranslationExercise;
	private exerciseOptions?: TranslationExerciseOptions;
	private loading = false;
	private loadingAnimation?: TokenStreamAnimation;
	private cancelLoading?: () => void;

	constructor(leaf: WorkspaceLeaf, private readonly actions: TranslationViewActions) {
		super(leaf);
	}

	getViewType(): string { return TRANSLATION_VIEW_TYPE; }
	getDisplayText(): string { return 'Переводы'; }
	getIcon(): string { return 'languages'; }

	async onOpen(): Promise<void> {
		this.renderEmpty();
	}

	async onClose(): Promise<void> {
		this.stopLoading(true);
		this.clearExercise(true);
	}

	showLoading(text: string, onCancel: () => void): void {
		this.stopLoading(false);
		this.clearExercise(true);
		this.loading = true;
		this.cancelLoading = onCancel;
		this.contentEl.empty();
		this.contentEl.addClass('translation-trainer-translation-view');
		this.loadingAnimation = createTokenStream(this.contentEl, text.replace(/…$/u, ''));
		const controls = this.contentEl.createDiv({ cls: 'translation-trainer-controls' });
		const cancel = enhanceButtonMotion(controls.createEl('button', { text: 'Отмена' }));
		cancel.addEventListener('click', () => {
			this.stopLoading(true);
			this.renderEmpty();
		});
	}

	finishLoading(): void {
		if (!this.loading) return;
		this.stopLoading(false);
		this.renderEmpty();
	}

	showExercise(options: TranslationExerciseOptions): void {
		this.stopLoading(false);
		this.clearExercise(true);
		this.exerciseOptions = options;
		this.exercise = new TranslationExercise(this.app, { ...options, autoFocus: false }, () => {
			this.clearExercise(true);
			this.renderEmpty();
		});
		this.contentEl.empty();
		this.contentEl.addClass('translation-trainer-translation-view');
		this.exercise.mount(this.contentEl);
	}

	private renderEmpty(): void {
		this.contentEl.empty();
		this.contentEl.addClass('translation-trainer-translation-view');
		const empty = this.contentEl.createDiv({ cls: 'translation-trainer-view-empty' });
		empty.createEl('p', { text: 'Здесь будет открываться следующее упражнение.' });
		const start = enhanceButtonMotion(empty.createEl('button', { text: 'Начать перевод', cls: 'mod-cta' }));
		start.addEventListener('click', () => void this.actions.startExercise());
	}

	private clearExercise(notify: boolean): void {
		this.exercise?.unmount();
		this.exercise = undefined;
		const options = this.exerciseOptions;
		this.exerciseOptions = undefined;
		if (notify) options?.actions.onClose?.();
	}

	private stopLoading(cancel: boolean): void {
		this.loadingAnimation?.stop();
		this.loadingAnimation = undefined;
		const onCancel = this.cancelLoading;
		this.cancelLoading = undefined;
		const wasLoading = this.loading;
		this.loading = false;
		if (cancel && wasLoading) onCancel?.();
	}
}

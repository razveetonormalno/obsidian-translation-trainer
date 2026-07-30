import { SuggestModal, type App } from 'obsidian';
import {
	EXERCISE_DISPLAY_MODE_OPTIONS,
	type ExerciseDisplayMode,
} from '../settings';

type DisplayModeOption = typeof EXERCISE_DISPLAY_MODE_OPTIONS[number];

export class ExerciseDisplayModeModal extends SuggestModal<DisplayModeOption> {
	constructor(
		app: App,
		private readonly current: ExerciseDisplayMode,
		private readonly choose: (mode: ExerciseDisplayMode) => void,
	) {
		super(app);
		this.setTitle('Режим показа переводов');
		this.setPlaceholder('Выберите режим');
	}

	getSuggestions(query: string): DisplayModeOption[] {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) return [...EXERCISE_DISPLAY_MODE_OPTIONS];
		return EXERCISE_DISPLAY_MODE_OPTIONS.filter((option) =>
			`${option.label} ${option.description}`.toLocaleLowerCase().includes(normalized),
		);
	}

	renderSuggestion(option: DisplayModeOption, el: HTMLElement): void {
		el.createDiv({
			text: option.id === this.current ? `${option.label} · выбран` : option.label,
			cls: 'suggestion-title',
		});
		el.createDiv({ text: option.description, cls: 'suggestion-note' });
	}

	onChooseSuggestion(option: DisplayModeOption): void {
		this.choose(option.id);
	}
}

import { AbstractInputSuggest, type App } from 'obsidian';

export class ModelNameSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly models: readonly string[],
		private readonly onModelSelected: (model: string) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) return [...this.models];
		return this.models.filter((model) => model.toLocaleLowerCase().includes(normalized));
	}

	renderSuggestion(model: string, el: HTMLElement): void {
		el.setText(model);
	}

	selectSuggestion(model: string): void {
		this.setValue(model);
		this.close();
		this.onModelSelected(model);
	}
}

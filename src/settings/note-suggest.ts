import { AbstractInputSuggest, App, TFile } from 'obsidian';
import { rankMarkdownNotePaths } from './note-suggestions';

export class MarkdownNoteSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly onPathSelected: (path: string) => void,
	) {
		super(app, inputEl);
		this.limit = 50;
	}

	protected getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const byPath = new Map(files.map((file) => [file.path, file]));
		return rankMarkdownNotePaths(files.map((file) => file.path), query, this.limit)
			.map((path) => byPath.get(path))
			.filter((file): file is TFile => file !== undefined);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ text: file.basename });
		el.createDiv({ text: file.path, cls: 'suggestion-note' });
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.path);
		this.close();
		this.onPathSelected(file.path);
	}
}

import { TFile, type Vault } from 'obsidian';
import type { VocabularyAddition, VocabularyAdditionResult, VocabularyEntry } from '../domain/types';
import { VocabularyIndex } from './index';
import { parseVocabularyMarkdown, selectMarkdownSection } from './parser';
import { appendVocabularyMarkdown } from './writer';

export interface VocabularyVault {
	getAbstractFileByPath(path: string): TFile | null;
	read(file: TFile): Promise<string>;
	process(file: TFile, callback: (data: string) => string): Promise<string>;
}

export class VocabularyService {
	private index = new VocabularyIndex();
	constructor(private readonly vault: Pick<Vault, 'getAbstractFileByPath' | 'read' | 'process'>) {}

	async reindex(sourcePath: string, section = ''): Promise<VocabularyIndex> {
		const index = await this.buildIndex(sourcePath, section);
		this.index = index;
		return index;
	}

	async buildIndex(sourcePath: string, section = ''): Promise<VocabularyIndex> {
		const file = this.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) throw new Error(`Vocabulary source was not found: ${sourcePath}`);
		const markdown = await this.vault.read(file);
		const selected = selectMarkdownSection(markdown, section);
		if (section.trim() && !selected) throw new Error(`Vocabulary section was not found: ${section}`);
		return new VocabularyIndex(parseVocabularyMarkdown(selected, sourcePath));
	}

	async addEntries(sourcePath: string, section: string, additions: readonly VocabularyAddition[]): Promise<VocabularyAdditionResult> {
		const file = this.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) throw new Error(`Vocabulary source was not found: ${sourcePath}`);
		let result: VocabularyAdditionResult | undefined;
		await this.vault.process(file, (markdown) => {
			const update = appendVocabularyMarkdown(markdown, section, additions);
			result = { added: update.added, skippedDuplicates: update.skippedDuplicates };
			return update.markdown;
		});
		if (!result) throw new Error('Vocabulary note was not updated.');
		return result;
	}

	use(index: VocabularyIndex): void { this.index = index; }
	clear(): void { this.index = new VocabularyIndex(); }
	get entries(): VocabularyEntry[] { return this.index.values(); }
	get currentIndex(): VocabularyIndex { return this.index; }
}

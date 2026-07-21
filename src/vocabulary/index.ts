import type { VocabularyEntry } from '../domain/types';
import { canonicalVocabularyKey } from './parser';

export class VocabularyIndex {
	private readonly byKey = new Map<string, VocabularyEntry>();

	constructor(entries: VocabularyEntry[] = []) {
		for (const entry of entries) this.add(entry);
	}

	add(entry: VocabularyEntry): void {
		if (!this.byKey.has(entry.canonicalKey)) this.byKey.set(entry.canonicalKey, entry);
	}

	get(keyOrTerm: string): VocabularyEntry | undefined {
		return this.byKey.get(canonicalVocabularyKey(keyOrTerm));
	}

	has(keyOrTerm: string): boolean { return this.get(keyOrTerm) !== undefined; }
	values(): VocabularyEntry[] { return [...this.byKey.values()]; }
	get size(): number { return this.byKey.size; }
}

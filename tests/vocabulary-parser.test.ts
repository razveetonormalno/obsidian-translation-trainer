import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalVocabularyKey, parseVocabularyMarkdown } from '../src/vocabulary/parser';

describe('Interesting Words parser', () => {
	it('parses the copied current vocabulary fixture, ignores marker and deduplicates', () => {
		const markdown = readFileSync(new URL('./fixtures/interesting-words.md', import.meta.url), 'utf8');
		const entries = parseVocabularyMarkdown(markdown, 'Study/English/Interesting Words.md');
		expect(entries).toHaveLength(110);
		expect(entries.map((entry) => entry.canonicalKey)).not.toContain('stunning-last-card-word');
		expect(entries.filter((entry) => entry.canonicalKey === 'purpose')).toHaveLength(1);
		expect(entries[0]).toMatchObject({ displayTerm: 'Roundabout', translation: 'обходной', sourcePath: 'Study/English/Interesting Words.md' });
		expect(entries[0]?.context).toEqual(['"Although this may appear to be a **roundabout** way"', 'Контекст после записи.']);
	});

	it('normalizes phrases and Unicode/case-equivalent duplicate keys', () => {
		expect(canonicalVocabularyKey('  SAFE   AND sound ')).toBe('safe and sound');
		const entries = parseVocabularyMarkdown('- **Café** — кафе\n- **Café** — duplicate', 'words.md');
		expect(entries).toHaveLength(1);
	});
});

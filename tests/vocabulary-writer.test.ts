import { describe, expect, it } from 'vitest';
import { parseVocabularyMarkdown, selectMarkdownSection } from '../src/vocabulary/parser';
import { appendVocabularyMarkdown } from '../src/vocabulary/writer';

describe('vocabulary Markdown writer', () => {
	it('appends multiple normalized rows in the parser-compatible format', () => {
		const update = appendVocabularyMarkdown(
			'# Words\n\n- **Existing** – существующий\n',
			'',
			[
				{ displayTerm: '  New   word ', translation: ' новое   слово ' },
				{ displayTerm: 'Phrase', translation: 'фраза' },
			],
		);

		expect(update.markdown).toContain('- **New word** – новое слово\n- **Phrase** – фраза');
		expect(update.added).toEqual([
			{ displayTerm: 'New word', translation: 'новое слово' },
			{ displayTerm: 'Phrase', translation: 'фраза' },
		]);
		expect(parseVocabularyMarkdown(update.markdown, 'Words.md').map((entry) => entry.canonicalKey))
			.toEqual(['existing', 'new word', 'phrase']);
	});

	it('writes into the configured section and skips case-insensitive duplicates', () => {
		const markdown = [
			'# Vocabulary',
			'',
			'## Active',
			'- **Known** – известный',
			'',
			'## Archive',
			'- **Old** – старый',
			'',
		].join('\n');
		const update = appendVocabularyMarkdown(markdown, 'Active', [
			{ displayTerm: 'known', translation: 'повтор' },
			{ displayTerm: 'Fresh', translation: 'свежий' },
		]);

		expect(update.skippedDuplicates).toEqual(['known']);
		expect(update.added).toEqual([{ displayTerm: 'Fresh', translation: 'свежий' }]);
		expect(selectMarkdownSection(update.markdown, 'Active')).toContain('- **Fresh** – свежий');
		expect(selectMarkdownSection(update.markdown, 'Archive')).not.toContain('Fresh');
	});

	it('ignores empty extra rows but rejects a partially filled row', () => {
		const unchanged = appendVocabularyMarkdown('- **Known** – известный\n', '', [
			{ displayTerm: '', translation: '   ' },
		]);
		expect(unchanged.added).toEqual([]);
		expect(unchanged.markdown).toBe('- **Known** – известный\n');

		expect(() => appendVocabularyMarkdown('', '', [
			{ displayTerm: 'Incomplete', translation: '' },
		])).toThrow('Для каждого слова заполните английское слово и русский перевод.');
	});

	it('preserves CRLF line endings', () => {
		const update = appendVocabularyMarkdown(
			'## Words\r\n- **Known** – известный\r\n',
			'Words',
			[{ displayTerm: 'Fresh', translation: 'свежий' }],
		);
		expect(update.markdown).toBe('## Words\r\n- **Known** – известный\r\n- **Fresh** – свежий\r\n');
	});
});

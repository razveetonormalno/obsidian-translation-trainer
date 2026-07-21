import type { VocabularyEntry } from '../domain/types';

const ENTRY_PATTERN = /^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:[-–—]|&(?:ndash|mdash);)\s*(.+?)\s*$/u;

/** A stable key which treats visually equivalent Unicode and casing as equal. */
export function canonicalVocabularyKey(term: string): string {
	return term.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

/** Parses the compact vocabulary-list convention used by Interesting Words.md. */
export function parseVocabularyMarkdown(markdown: string, sourcePath: string): VocabularyEntry[] {
	const entries: VocabularyEntry[] = [];
	const seen = new Set<string>();
	let current: VocabularyEntry | undefined;

	for (const rawLine of markdown.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
		const marker = /^\s*Last\s+card\s+word\s*:/iu.test(rawLine);
		if (marker) continue;
		const match = rawLine.match(ENTRY_PATTERN);
		if (match) {
			const displayTerm = match[1]!.trim();
			const canonicalKey = canonicalVocabularyKey(displayTerm);
			if (displayTerm && !seen.has(canonicalKey)) {
				current = { displayTerm, canonicalKey, translation: match[2]!.trim(), context: [], sourcePath };
				entries.push(current);
				seen.add(canonicalKey);
			} else current = undefined;
			continue;
		}
		if (current && /^\s*>\s?/u.test(rawLine)) {
			const context = rawLine.replace(/^\s*>\s?/u, '').trim();
			if (context) current.context.push(context);
		} else if (rawLine.trim()) current = undefined;
	}
	return entries;
}

/** Returns one Markdown heading section, including nested subheadings. */
export function selectMarkdownSection(markdown: string, heading: string): string {
	const target = heading.trim().toLocaleLowerCase();
	if (!target) return markdown;
	const lines = markdown.split(/\r?\n/u);
	let start = -1;
	let level = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(lines[index] ?? '');
		if (!match || match[2]?.trim().toLocaleLowerCase() !== target) continue;
		start = index + 1;
		level = match[1]?.length ?? 0;
		break;
	}
	if (start < 0) return '';
	let end = lines.length;
	for (let index = start; index < lines.length; index += 1) {
		const match = /^(#{1,6})\s+/u.exec(lines[index] ?? '');
		if (match && (match[1]?.length ?? 7) <= level) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

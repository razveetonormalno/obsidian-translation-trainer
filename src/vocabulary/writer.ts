import type { VocabularyAddition, VocabularyAdditionResult } from '../domain/types';
import { canonicalVocabularyKey, parseVocabularyMarkdown, selectMarkdownSection } from './parser';

export interface VocabularyMarkdownUpdate extends VocabularyAdditionResult {
	markdown: string;
}

export function appendVocabularyMarkdown(
	markdown: string,
	section: string,
	additions: readonly VocabularyAddition[],
): VocabularyMarkdownUpdate {
	const normalized = additions
		.map(normalizeAddition)
		.filter((entry) => entry.displayTerm || entry.translation);
	for (const entry of normalized) {
		if (!entry.displayTerm || !entry.translation) {
			throw new Error('Для каждого слова заполните английское слово и русский перевод.');
		}
	}

	const selected = selectMarkdownSection(markdown, section);
	if (section.trim() && !selected) {
		throw new Error(`Раздел словаря не найден: ${section.trim()}`);
	}
	const knownKeys = new Set(
		parseVocabularyMarkdown(selected, 'vocabulary.md')
			.map((entry) => entry.canonicalKey),
	);
	const added: VocabularyAddition[] = [];
	const skippedDuplicates: string[] = [];
	for (const entry of normalized) {
		const key = canonicalVocabularyKey(entry.displayTerm);
		if (knownKeys.has(key)) {
			skippedDuplicates.push(entry.displayTerm);
			continue;
		}
		knownKeys.add(key);
		added.push(entry);
	}
	if (!added.length) return { markdown, added, skippedDuplicates };

	const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
	const lines = markdown.split(/\r?\n/u);
	const range = sectionRange(lines, section);
	let insertion = range.end;
	while (insertion > range.start && !(lines[insertion - 1] ?? '').trim()) insertion -= 1;
	lines.splice(insertion, 0, ...added.map(formatVocabularyMarkdownLine));
	return { markdown: lines.join(newline), added, skippedDuplicates };
}

export function formatVocabularyMarkdownLine(addition: VocabularyAddition): string {
	return `- **${addition.displayTerm}** – ${addition.translation}`;
}

function normalizeAddition(addition: VocabularyAddition): VocabularyAddition {
	return {
		displayTerm: normalizeField(addition.displayTerm),
		translation: normalizeField(addition.translation),
	};
}

function normalizeField(value: string): string {
	return value.trim().replace(/\s+/gu, ' ');
}

function sectionRange(lines: readonly string[], heading: string): { start: number; end: number } {
	const target = heading.trim().toLocaleLowerCase();
	if (!target) return { start: 0, end: lines.length };
	for (let index = 0; index < lines.length; index += 1) {
		const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(lines[index] ?? '');
		if (!match || match[2]?.trim().toLocaleLowerCase() !== target) continue;
		const level = match[1]?.length ?? 0;
		for (let end = index + 1; end < lines.length; end += 1) {
			const nextHeading = /^(#{1,6})\s+/u.exec(lines[end] ?? '');
			if (nextHeading && (nextHeading[1]?.length ?? 7) <= level) {
				return { start: index + 1, end };
			}
		}
		return { start: index + 1, end: lines.length };
	}
	throw new Error(`Раздел словаря не найден: ${heading.trim()}`);
}

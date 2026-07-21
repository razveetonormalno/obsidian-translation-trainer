import type { TranslationQuestion } from '../domain/types';

export function normalizedQuestionKey(question: Pick<TranslationQuestion, 'sourceRu' | 'targetVocabulary' | 'topics'>): string {
	return [
		normalizeText(question.sourceRu),
		[...question.targetVocabulary].map(normalizeText).sort().join('|'),
		[...question.topics].map(normalizeText).sort().join('|'),
	].join('::');
}

export function deduplicateQuestions(questions: readonly TranslationQuestion[]): TranslationQuestion[] {
	const seen = new Set<string>();
	return questions.filter((question) => {
		const key = normalizedQuestionKey(question);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function normalizeText(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

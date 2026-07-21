import { RECENT_QUESTION_LIMIT } from '../domain/constants';
import type { QuestionProgress, TranslationQuestion } from '../domain/types';
import { curriculumPriority } from '../curriculum/priority';
import { canonicalVocabularyKey } from '../vocabulary/parser';
import type { QuestionSelection, QuestionSelectionRequest, SelectionStatistics } from './types';

export class QuestionSelector {
	select(questions: readonly TranslationQuestion[], request: QuestionSelectionRequest): QuestionSelection {
		const now = request.now ?? new Date();
		const recent = new Set((request.recentQuestionIds ?? []).slice(-RECENT_QUESTION_LIMIT));
		const currentVocabulary = new Set(request.vocabulary.map((entry) => entry.canonicalKey));
		const eligible = questions.filter((question) => isEligible(question, request, currentVocabulary, now));
		const nonRecent = eligible.filter((question) => !recent.has(question.id));
		const pool = nonRecent.length > 0 ? nonRecent : eligible;
		if (!pool.length) return { reason: 'none', priority: 0 };

		const due = pool.filter((question) => isDueReview(request.progress[question.id], now));
		if (due.length) return pickHighest(due, (question) => overduePriority(request.progress[question.id], now), 'due-review');

		const newQuestions = pool.filter((question) =>
			!request.progress[question.id] || request.progress[question.id]?.status === 'new',
		);
		const topicWeak = pickHighest(newQuestions, (question) => topicQuestionPriority(question, request.progress[question.id], now, request.statistics), 'weakness');
		if (topicWeak.priority > 0) return topicWeak;
		const vocabularyWeak = pickHighest(newQuestions, (question) => vocabularyQuestionPriority(question, request.progress[question.id], now, request.statistics), 'weakness');
		if (vocabularyWeak.priority > 0) return vocabularyWeak;

		if (newQuestions.length) return pickHighest(newQuestions, (question) => questionPriority(question, request.statistics), 'new-bank');
		return request.allowEarlyReview
			? pickLeastRecentlyShown(pool, request.progress)
			: { reason: 'none', priority: 0 };
	}
}

function isEligible(question: TranslationQuestion, request: QuestionSelectionRequest, vocabulary: ReadonlySet<string>, now: Date): boolean {
	if (question.level !== request.level || !question.targetVocabulary.length) return false;
	if (!question.targetVocabulary.every((key) => vocabulary.has(canonicalVocabularyKey(key)))) return false;
	const progress = request.progress[question.id];
	if (!progress || progress.status === 'new') return true;
	if (progress.status === 'suspended' || progress.status === 'archived') return false;
	return !progress.snoozedUntil || new Date(progress.snoozedUntil).getTime() <= now.getTime();
}

function isDueReview(progress: QuestionProgress | undefined, now: Date): boolean {
	if (!progress || progress.status === 'new' || progress.status === 'suspended' || progress.status === 'archived') return false;
	return new Date(progress.dueAt).getTime() <= now.getTime();
}

function overduePriority(progress: QuestionProgress | undefined, now: Date): number {
	if (!progress) return 0;
	const due = new Date(progress.dueAt).getTime();
	return Math.max(0, Math.min(1, (now.getTime() - due) / Math.max(1, progress.intervalMinutes * 60_000)));
}

export function questionPriority(question: TranslationQuestion, statistics: SelectionStatistics | undefined): number {
	const scores = [...question.topics.map((id) => itemPriority(id, 0, statistics?.topicWeakness, statistics?.topicCoverage)),
		...question.targetVocabulary.map((id) => itemPriority(canonicalVocabularyKey(id), 0, statistics?.vocabularyWeakness, statistics?.vocabularyCoverage))];
	return scores.length ? Math.max(...scores) : 0;
}

function topicQuestionPriority(question: TranslationQuestion, progress: QuestionProgress | undefined, now: Date, statistics: SelectionStatistics | undefined): number {
	return maximum(question.topics.map((id) => itemPriority(id, overduePriority(progress, now), statistics?.topicWeakness, statistics?.topicCoverage)));
}

function vocabularyQuestionPriority(question: TranslationQuestion, progress: QuestionProgress | undefined, now: Date, statistics: SelectionStatistics | undefined): number {
	return maximum(question.targetVocabulary.map((id) => itemPriority(canonicalVocabularyKey(id), overduePriority(progress, now), statistics?.vocabularyWeakness, statistics?.vocabularyCoverage)));
}

function itemPriority(id: string, overdue: number, weaknesses: ReadonlyMap<string, number> | undefined, coverages: ReadonlyMap<string, number> | undefined): number {
	const weakness = weaknesses?.get(id) ?? 0;
	const coverage = coverages?.get(id);
	return curriculumPriority(weakness, overdue, coverage === undefined ? 1 : 1 - coverage);
}

function maximum(values: readonly number[]): number { return values.length ? Math.max(...values) : 0; }

function pickHighest(questions: readonly TranslationQuestion[], score: (question: TranslationQuestion) => number, reason: QuestionSelection['reason']): QuestionSelection {
	let best = questions[0];
	let priority = best ? score(best) : 0;
	for (const question of questions.slice(1)) {
		const candidate = score(question);
		if (candidate > priority || (candidate === priority && question.createdAt < (best?.createdAt ?? ''))) { best = question; priority = candidate; }
	}
	return { question: best, reason, priority };
}

function pickLeastRecentlyShown(questions: readonly TranslationQuestion[], progress: Readonly<Record<string, QuestionProgress>>): QuestionSelection {
	const question = [...questions].sort((left, right) => (progress[left.id]?.lastShownAt ?? '').localeCompare(progress[right.id]?.lastShownAt ?? ''))[0];
	return { question, reason: 'least-recently-shown', priority: 0 };
}

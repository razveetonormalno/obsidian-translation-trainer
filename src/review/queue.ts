import { RECENT_QUESTION_LIMIT } from '../domain/constants';
import type { QuestionProgress } from '../domain/types';

export interface IdentifiedQuestion {
	id: string;
}

export interface QuestionAttemptReference {
	questionId: string;
	timestamp: string;
}

/** Produces stable oldest-due-first queue suitable for a sequential review modal. */
export function buildReviewQueue<T extends IdentifiedQuestion>(
	questions: readonly T[],
	progress: Readonly<Record<string, QuestionProgress>>,
	now = new Date(),
): T[] {
	const nowMs = now.getTime();
	return questions
		.filter((question) => isDue(progress[question.id], nowMs))
		.slice()
		.sort((left, right) => dueTime(progress[left.id]) - dueTime(progress[right.id]) || left.id.localeCompare(right.id));
}

/** Last distinct question ids in chronological order; directly usable by QuestionSelector. */
export function recentQuestionIds(
	attempts: readonly QuestionAttemptReference[],
	limit = RECENT_QUESTION_LIMIT,
): string[] {
	const recent = new Map<string, string>();
	for (const attempt of attempts.slice().sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
		if (!attempt.questionId) continue;
		recent.delete(attempt.questionId);
		recent.set(attempt.questionId, attempt.timestamp);
	}
	return [...recent.keys()].slice(-Math.max(0, limit));
}

function isDue(progress: QuestionProgress | undefined, nowMs: number): boolean {
	if (!progress || progress.status === 'new' || progress.status === 'suspended' || progress.status === 'archived') return false;
	if (progress.snoozedUntil && Date.parse(progress.snoozedUntil) > nowMs) return false;
	return dueTime(progress) <= nowMs;
}

function dueTime(progress: QuestionProgress | undefined): number {
	const parsed = progress ? Date.parse(progress.dueAt) : Number.POSITIVE_INFINITY;
	return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

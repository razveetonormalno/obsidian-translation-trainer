import { SNOOZE_MINUTES } from '../domain/constants';
import type { QuestionProgress, TranslationEvaluation } from '../domain/types';

export type ReviewOutcome = 'critical' | 'fail' | 'partial' | 'success';

export interface ReviewUpdate {
	progress: QuestionProgress;
	outcome: ReviewOutcome;
}

const MINUTE = 60_000;
const SUCCESS_INTERVALS = [10_080, 20_160, 43_200, 86_400, 129_600] as const;

/** Classifies an LLM evaluation without relying on a user self-rating. */
export function reviewOutcome(evaluation: TranslationEvaluation): ReviewOutcome {
	if (hasCriticalError(evaluation) || evaluation.meaning.score < 60) return 'critical';
	if (evaluation.overallScore < 65 || evaluation.grammar.score < 50) return 'fail';
	if (evaluation.overallScore < 80 || hasMajorError(evaluation)) return 'partial';
	return 'success';
}

/** Returns the exact next interval in minutes mandated by the review policy. */
export function nextIntervalMinutes(evaluation: TranslationEvaluation, priorSuccessStreak: number): number {
	if (hasCriticalError(evaluation) || evaluation.meaning.score < 60) {
		if (evaluation.overallScore < 40) return 10;
		if (evaluation.overallScore < 55) return 20;
		return 30;
	}
	if (evaluation.overallScore < 65 || evaluation.grammar.score < 50) return 1_440;
	if (evaluation.overallScore < 80 || hasMajorError(evaluation)) return 4_320;
	return SUCCESS_INTERVALS[Math.min(Math.max(0, priorSuccessStreak), SUCCESS_INTERVALS.length - 1)] ?? 129_600;
}

export function applyEvaluation(
	previous: QuestionProgress | undefined,
	evaluation: TranslationEvaluation,
	now = new Date(),
): ReviewUpdate {
	const base = previous ?? newQuestionProgress(now);
	const outcome = reviewOutcome(evaluation);
	const intervalMinutes = nextIntervalMinutes(evaluation, base.successStreak);
	const success = outcome === 'success';
	const criticalOrFail = outcome === 'critical' || outcome === 'fail';
	const successStreak = success ? base.successStreak + 1 : 0;
	return {
		outcome,
		progress: {
			...base,
			status: success ? 'review' : 'learning',
			dueAt: isoAfterMinutes(now, intervalMinutes),
			snoozedUntil: undefined,
			lastReviewedAt: now.toISOString(),
			intervalMinutes,
			successStreak,
			successfulReviews: base.successfulReviews + (success ? 1 : 0),
			lapses: base.lapses + (criticalOrFail ? 1 : 0),
			lastScore: evaluation.overallScore,
		},
	};
}

/** Defers a card without recording an attempt or changing its learning history. */
export function snoozeQuestion(previous: QuestionProgress | undefined, now = new Date()): QuestionProgress {
	const base = previous ?? newQuestionProgress(now);
	return {
		...base,
		status: base.status === 'new' ? 'learning' : base.status,
		snoozedUntil: isoAfterMinutes(now, SNOOZE_MINUTES),
	};
}

export function markQuestionShown(previous: QuestionProgress | undefined, now = new Date()): QuestionProgress {
	const base = previous ?? newQuestionProgress(now);
	return { ...base, lastShownAt: now.toISOString() };
}

export function newQuestionProgress(now = new Date()): QuestionProgress {
	return {
		status: 'new',
		dueAt: now.toISOString(),
		intervalMinutes: 0,
		successStreak: 0,
		successfulReviews: 0,
		lapses: 0,
	};
}

function hasCriticalError(evaluation: TranslationEvaluation): boolean {
	return evaluation.errors.some((error) => error.severity === 'critical');
}

function hasMajorError(evaluation: TranslationEvaluation): boolean {
	return evaluation.errors.some((error) => error.severity === 'major');
}

function isoAfterMinutes(now: Date, minutes: number): string {
	return new Date(now.getTime() + minutes * MINUTE).toISOString();
}

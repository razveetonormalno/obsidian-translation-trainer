import { describe, expect, it } from 'vitest';
import { QuestionSelector } from '../src/questions/selector';
import type { QuestionProgress, VocabularyEntry } from '../src/domain/types';
import { question } from './helpers';

const vocabulary: VocabularyEntry[] = [{
	displayTerm: 'Purpose',
	canonicalKey: 'purpose',
	translation: 'цель',
	context: [],
	sourcePath: 'Study/English/Interesting Words.md',
}];

function progress(dueAt: string): QuestionProgress {
	return {
		status: 'review',
		dueAt,
		intervalMinutes: 10_080,
		successStreak: 1,
		successfulReviews: 1,
		lapses: 0,
	};
}

describe('question selector due-date policy', () => {
	const selector = new QuestionSelector();
	const now = new Date('2026-07-21T12:00:00.000Z');
	const reviewed = question({ id: 'reviewed' });
	const fresh = question({ id: 'fresh' });

	it('prefers a new bank question to a review that is not due', () => {
		const result = selector.select([reviewed, fresh], {
			level: 'B1',
			vocabulary,
			progress: { reviewed: progress('2026-07-28T12:00:00.000Z') },
			now,
		});
		expect(result.question?.id).toBe('fresh');
	});

	it('does not show a future review automatically, but permits manual early review', () => {
		const request = {
			level: 'B1' as const,
			vocabulary,
			progress: { reviewed: progress('2026-07-28T12:00:00.000Z') },
			now,
		};
		expect(selector.select([reviewed], request).question).toBeUndefined();
		expect(selector.select([reviewed], { ...request, allowEarlyReview: true }).question?.id).toBe('reviewed');
	});

	it('always selects an overdue review first', () => {
		const result = selector.select([reviewed, fresh], {
			level: 'B1',
			vocabulary,
			progress: { reviewed: progress('2026-07-20T12:00:00.000Z') },
			now,
		});
		expect(result.question?.id).toBe('reviewed');
		expect(result.reason).toBe('due-review');
	});
});

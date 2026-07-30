import { describe, expect, it } from 'vitest';
import { buildStatisticsSnapshot, drilldownByTopic, drilldownByWord, filterAttemptsByPeriod } from '../src/statistics/aggregator';
import { attempt, question } from './helpers';

describe('statistics aggregation', () => {
	it('computes EMA alpha .2, includes provisional rankings and handles empty data', () => {
		const records = [attempt('1', '2026-07-18T00:00:00Z', 0), attempt('2', '2026-07-19T00:00:00Z', 100), attempt('3', '2026-07-20T00:00:00Z', 100), attempt('4', '2026-07-20T01:00:00Z', 20, 'future', 'rare')];
		const snapshot = buildStatisticsSnapshot(records, { period: 'all', now: new Date('2026-07-21T00:00:00Z') });
		const purpose = snapshot.wordRankings.find((entry) => entry.id === 'purpose');
		expect(purpose?.emaScore).toBeCloseTo(36, 8);
		expect(snapshot.easiestWords.map((entry) => entry.id)).toEqual(['purpose', 'rare']);
		expect(snapshot.hardestWords.map((entry) => entry.id)).toEqual(['rare', 'purpose']);
		expect(buildStatisticsSnapshot([], { period: 'all' }).empty).toBe(true);
	});

	it('filters invalid and out-of-period dates, and returns chronological drilldowns', () => {
		const records = [attempt('bad', 'not-a-date'), attempt('old', '2026-06-01T00:00:00Z'), attempt('new', '2026-07-20T00:00:00Z')];
		expect(filterAttemptsByPeriod(records, 7, new Date('2026-07-21T00:00:00Z')).map((record) => record.id)).toEqual(['new']);
		const questions = new Map([['q-new', question({ id: 'q-new' })], ['q-old', question({ id: 'q-old' })]]);
		expect(drilldownByTopic(records, questions, 'present-perfect').map((item) => item.attempt.id)).toEqual(['old', 'new', 'bad']);
		expect(drilldownByWord(records, questions, 'purpose')).toHaveLength(3);
	});
});

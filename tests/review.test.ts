import { describe, expect, it } from 'vitest';
import { applyEvaluation, nextIntervalMinutes, snoozeQuestion } from '../src/review/intervals';
import { evaluateAutomaticGate, isQuietHours, markAutomaticShown, ReviewScheduler } from '../src/review/scheduler';
import { DEFAULT_SETTINGS } from '../src/settings/model';
import { EMPTY_SCHEDULER_STATE } from '../src/storage/model';
import { evaluation } from './helpers';

describe('automatic review intervals', () => {
	it.each([
		[39, 10], [40, 20], [54, 20], [55, 30],
	])('uses the critical score boundary %i -> %i minutes', (overall, expected) => {
		expect(nextIntervalMinutes(evaluation({ overallScore: overall, meaning: { score: 59, explanationRu: '' } }), 0)).toBe(expected);
	});

	it.each([[64, 1440], [65, 4320], [79, 4320]])('uses the noncritical boundary %i -> %i minutes', (overall, expected) => {
		expect(nextIntervalMinutes(evaluation({ overallScore: overall }), 0)).toBe(expected);
	});

	it('honours meaning 59/60, grammar 49/50, major and critical error caps', () => {
		expect(nextIntervalMinutes(evaluation({ overallScore: 90, meaning: { score: 59, explanationRu: '' } }), 0)).toBe(30);
		expect(nextIntervalMinutes(evaluation({ overallScore: 64, meaning: { score: 60, explanationRu: '' } }), 0)).toBe(1440);
		expect(nextIntervalMinutes(evaluation({ overallScore: 90, grammar: { score: 49, explanationRu: '', topicScores: [] } }), 0)).toBe(1440);
		expect(nextIntervalMinutes(evaluation({ overallScore: 90, grammar: { score: 50, explanationRu: '', topicScores: [] } }), 0)).toBe(10080);
		expect(nextIntervalMinutes(evaluation({ overallScore: 90, errors: [{ fragment: 'x', category: 'grammar', severity: 'major', explanationRu: '' }] }), 0)).toBe(4320);
		expect(nextIntervalMinutes(evaluation({ overallScore: 90, errors: [{ fragment: 'x', category: 'meaning', severity: 'critical', explanationRu: '' }] }), 0)).toBe(30);
	});

	it.each([[0, 10080], [1, 20160], [2, 43200], [3, 86400], [4, 129600], [20, 129600]])('steps successful reviews through 7/14/30/60/90 days', (streak, minutes) => {
		expect(nextIntervalMinutes(evaluation(), streak)).toBe(minutes);
	});

	it('resets streak and increments lapses only for critical/fail outcomes', () => {
		const now = new Date('2026-07-21T10:00:00.000Z');
		const prior = { status: 'review' as const, dueAt: now.toISOString(), intervalMinutes: 10, successStreak: 3, successfulReviews: 4, lapses: 2 };
		const partial = applyEvaluation(prior, evaluation({ overallScore: 70 }), now).progress;
		expect(partial).toMatchObject({ successStreak: 0, lapses: 2, status: 'learning' });
		const failed = applyEvaluation(prior, evaluation({ overallScore: 64 }), now).progress;
		expect(failed).toMatchObject({ successStreak: 0, lapses: 3 });
		const success = applyEvaluation(prior, evaluation(), now).progress;
		expect(success).toMatchObject({ successStreak: 4, successfulReviews: 5, lapses: 2, status: 'review' });
	});

	it('snoozes for exactly 30 minutes without recording a review', () => {
		const now = new Date('2026-07-21T10:00:00.000Z');
		const result = snoozeQuestion(undefined, now);
		expect(result.snoozedUntil).toBe('2026-07-21T10:30:00.000Z');
		expect(result.lastReviewedAt).toBeUndefined();
	});
});

describe('scheduler gates', () => {
	const now = new Date(2026, 6, 21, 23, 30);
	const settings = { ...DEFAULT_SETTINGS, cadenceMinutes: 30, minimumIntervalMinutes: 10, quietHoursStart: '23:00', quietHoursEnd: '07:00', dailyAutomaticLimit: 2 };
	it('handles quiet hours across midnight and daily/cadence resets', () => {
		expect(isQuietHours(now, '23:00', '07:00')).toBe(true);
		expect(isQuietHours(new Date(2026, 6, 22, 7, 0), '23:00', '07:00')).toBe(false);
		expect(evaluateAutomaticGate({ settings, state: EMPTY_SCHEDULER_STATE, now, modalOpen: false, appActive: true }).reason).toBe('quiet-hours');
		const limited = { ...EMPTY_SCHEDULER_STATE, automaticShownDay: '2026-07-21', automaticShownCount: 2 };
		expect(evaluateAutomaticGate({ settings: { ...settings, quietHoursStart: '00:00', quietHoursEnd: '00:00' }, state: limited, now, modalOpen: false, appActive: true }).reason).toBe('daily-limit');
		const shown = markAutomaticShown(EMPTY_SCHEDULER_STATE, new Date(2026, 6, 21, 12, 0));
		expect(evaluateAutomaticGate({ settings: { ...settings, quietHoursStart: '00:00', quietHoursEnd: '00:00' }, state: shown, now: new Date(2026, 6, 21, 12, 20), modalOpen: false, appActive: true }).reason).toBe('cadence');
	});

	it('manual command bypasses time gates but not a second modal', () => {
		const make = (modalOpen: boolean) => new ReviewScheduler({ getSettings: () => ({ ...settings, paused: true }), getState: () => EMPTY_SCHEDULER_STATE, saveState: async () => undefined, isModalOpen: () => modalOpen, isAppActive: () => false, showAutomaticExercise: async () => false });
		expect(make(false).canStartManualExercise()).toBe(true);
		expect(make(true).canStartManualExercise()).toBe(false);
	});
});

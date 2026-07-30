import { EMA_ALPHA } from '../domain/constants';
import type { TranslationAttempt, TranslationQuestion } from '../domain/types';
import type { SelectionStatistics } from '../questions/types';
import {
	DEFAULT_STATISTICS_PERIOD,
	type AttemptDrilldown,
	type DailyScorePoint,
	type StatisticsFilter,
	type StatisticsPeriod,
	type StatisticsRankingItem,
	type StatisticsSnapshot,
} from './types';

interface MutableAggregate {
	id: string;
	label: string;
	attemptCount: number;
	errorCount: number;
	scoreTotal: number;
	emaScore?: number;
}

export function buildStatisticsSnapshot(
	attempts: readonly TranslationAttempt[],
	filter: Partial<StatisticsFilter> = {},
): StatisticsSnapshot {
	const period = filter.period ?? DEFAULT_STATISTICS_PERIOD;
	const now = filter.now ?? new Date();
	const selected = filterAttemptsByPeriod(attempts, period, now);
	const topics = new Map<string, MutableAggregate>();
	const words = new Map<string, MutableAggregate>();
	const daily = new Map<string, TranslationAttempt[]>();

	for (const attempt of selected) {
		const day = utcDay(attempt.timestamp);
		if (day) push(daily, day, attempt);
		for (const topic of attempt.evaluation.grammar.topicScores) {
			addScore(topics, topic.topicId, topic.topicId, topic.score);
		}
		for (const word of attempt.evaluation.vocabulary.itemScores) {
			addScore(words, word.canonicalKey, word.displayTerm || word.canonicalKey, word.score);
		}
		for (const error of attempt.evaluation.errors) {
			if (error.topicId) addError(topics, error.topicId, error.topicId);
			if (error.vocabularyKey) addError(words, error.vocabularyKey, error.vocabularyKey);
		}
	}

	const topicRankings = toRankingItems(topics);
	const wordRankings = toRankingItems(words);
	return {
		period,
		generatedAt: now.toISOString(),
		attemptCount: selected.length,
		empty: selected.length === 0,
		dailyScores: buildDailyScores(daily),
		topicDistribution: topicRankings.map((item) => ({ ...item, attempts: item.attemptCount })),
		wordRankings,
		topicRankings,
		easiestWords: ranked(wordRankings, 'high'),
		hardestWords: ranked(wordRankings, 'low'),
		easiestTopics: ranked(topicRankings, 'high'),
		hardestTopics: ranked(topicRankings, 'low'),
		attempts: selected,
	};
}

export function filterAttemptsByPeriod(attempts: readonly TranslationAttempt[], period: StatisticsPeriod = DEFAULT_STATISTICS_PERIOD, now = new Date()): TranslationAttempt[] {
	const cutoff = period === 'all' ? Number.NEGATIVE_INFINITY : now.getTime() - period * 86_400_000;
	return attempts
		.filter((attempt) => {
			const time = validTime(attempt.timestamp);
			return Number.isFinite(time) && time >= cutoff;
		})
		.slice()
		.sort(compareAttempts);
}

/** Converts aggregate data to the selector's 0..1 weakness and coverage maps. */
export function selectionStatisticsFromSnapshot(snapshot: StatisticsSnapshot): SelectionStatistics {
	return {
		topicWeakness: weaknessMap(snapshot.topicRankings),
		vocabularyWeakness: weaknessMap(snapshot.wordRankings),
		topicCoverage: coverageMap(snapshot.topicRankings),
		vocabularyCoverage: coverageMap(snapshot.wordRankings),
	};
}

export function drilldownByTopic(source: readonly TranslationAttempt[], questions: ReadonlyMap<string, TranslationQuestion>, topicId: string): AttemptDrilldown[] {
	return drilldown(source, questions, (attempt) =>
		attempt.evaluation.grammar.topicScores.some((score) => score.topicId === topicId) ||
		attempt.evaluation.errors.some((error) => error.topicId === topicId),
	);
}

export function drilldownByWord(source: readonly TranslationAttempt[], questions: ReadonlyMap<string, TranslationQuestion>, canonicalKey: string): AttemptDrilldown[] {
	return drilldown(source, questions, (attempt) =>
		attempt.evaluation.vocabulary.itemScores.some((score) => score.canonicalKey === canonicalKey) ||
		attempt.evaluation.errors.some((error) => error.vocabularyKey === canonicalKey),
	);
}

function drilldown(source: readonly TranslationAttempt[], questions: ReadonlyMap<string, TranslationQuestion>, include: (attempt: TranslationAttempt) => boolean): AttemptDrilldown[] {
	return source.filter(include).slice().sort(compareAttempts).map((attempt) => ({ attempt, question: questions.get(attempt.questionId) }));
}

function buildDailyScores(days: ReadonlyMap<string, readonly TranslationAttempt[]>): DailyScorePoint[] {
	return [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, attempts]) => ({
		date,
		attempts: attempts.length,
		overall: mean(attempts.map((item) => item.evaluation.overallScore)),
		meaning: mean(attempts.map((item) => item.evaluation.meaning.score)),
		grammar: mean(attempts.map((item) => item.evaluation.grammar.score)),
		naturalness: mean(attempts.map((item) => item.evaluation.naturalness.score)),
		vocabulary: mean(attempts.map((item) => item.evaluation.vocabulary.score)),
	}));
}

function addScore(target: Map<string, MutableAggregate>, id: string, label: string, score: number): void {
	if (!Number.isFinite(score)) return;
	const current = aggregateFor(target, id, label);
	current.attemptCount += 1;
	current.scoreTotal += score;
	current.emaScore = current.emaScore === undefined ? score : EMA_ALPHA * score + (1 - EMA_ALPHA) * current.emaScore;
}

function addError(target: Map<string, MutableAggregate>, id: string, label: string): void {
	aggregateFor(target, id, label).errorCount += 1;
}

function aggregateFor(target: Map<string, MutableAggregate>, id: string, label: string): MutableAggregate {
	let aggregate = target.get(id);
	if (!aggregate) {
		aggregate = { id, label, attemptCount: 0, errorCount: 0, scoreTotal: 0 };
		target.set(id, aggregate);
	} else if (aggregate.label === aggregate.id && label !== id) {
		aggregate.label = label;
	}
	return aggregate;
}

function toRankingItems(items: ReadonlyMap<string, MutableAggregate>): StatisticsRankingItem[] {
	return [...items.values()].filter((item) => item.attemptCount > 0).map((item) => ({
		id: item.id,
		label: item.label,
		attemptCount: item.attemptCount,
		errorCount: item.errorCount,
		averageScore: item.scoreTotal / item.attemptCount,
		emaScore: item.emaScore ?? 0,
	})).sort(stableItemOrder);
}

function ranked(items: readonly StatisticsRankingItem[], direction: 'high' | 'low'): StatisticsRankingItem[] {
	return items.slice().sort((left, right) => {
		const delta = direction === 'high' ? right.emaScore - left.emaScore : left.emaScore - right.emaScore;
		return delta || stableItemOrder(left, right);
	}).slice(0, 10);
}

function weaknessMap(items: readonly StatisticsRankingItem[]): Map<string, number> {
	return new Map(items.map((item) => [item.id, clamp(1 - item.emaScore / 100)]));
}

function coverageMap(items: readonly StatisticsRankingItem[]): Map<string, number> {
	const maximum = Math.max(0, ...items.map((item) => item.attemptCount));
	return new Map(items.map((item) => [item.id, maximum ? item.attemptCount / maximum : 0]));
}

function stableItemOrder(left: StatisticsRankingItem, right: StatisticsRankingItem): number {
	return left.id.localeCompare(right.id) || left.label.localeCompare(right.label);
}

function compareAttempts(left: TranslationAttempt, right: TranslationAttempt): number {
	return validTime(left.timestamp) - validTime(right.timestamp) || left.id.localeCompare(right.id);
}

function validTime(value: string): number { const time = new Date(value).getTime(); return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time; }
function utcDay(value: string): string | undefined { const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10); }
function mean(values: readonly number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function push<T>(map: Map<string, T[]>, key: string, value: T): void { const values = map.get(key); if (values) values.push(value); else map.set(key, [value]); }

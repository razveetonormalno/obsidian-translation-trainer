import type { TranslationAttempt, TranslationQuestion } from '../domain/types';
import type { SelectionStatistics } from '../questions/types';

export type StatisticsPeriod = 7 | 30 | 90 | 'all';

export const DEFAULT_STATISTICS_PERIOD: StatisticsPeriod = 30;

export interface StatisticsFilter {
	period: StatisticsPeriod;
	now?: Date;
}

export interface DailyScorePoint {
	date: string;
	attempts: number;
	overall: number;
	meaning: number;
	grammar: number;
	naturalness: number;
	vocabulary: number;
}

/** An aggregate used for both grammar topics and vocabulary items. */
export interface StatisticsRankingItem {
	id: string;
	label: string;
	attemptCount: number;
	errorCount: number;
	averageScore: number;
	emaScore: number;
}

export interface TopicDistributionItem extends StatisticsRankingItem {
	/** Number of attempts that contain a score for this topic. */
	attempts: number;
}

export interface AttemptDrilldown {
	attempt: TranslationAttempt;
	question?: TranslationQuestion;
}

/** Serializable view-model for Statistics View. Scores are in the 0..100 range. */
export interface StatisticsSnapshot {
	period: StatisticsPeriod;
	generatedAt: string;
	attemptCount: number;
	empty: boolean;
	dailyScores: DailyScorePoint[];
	topicDistribution: TopicDistributionItem[];
	wordRankings: StatisticsRankingItem[];
	topicRankings: StatisticsRankingItem[];
	easiestWords: StatisticsRankingItem[];
	hardestWords: StatisticsRankingItem[];
	easiestTopics: StatisticsRankingItem[];
	hardestTopics: StatisticsRankingItem[];
	/** Attempts after the selected date filter, sorted chronologically. */
	attempts: TranslationAttempt[];
}

export interface StatisticsSource {
	attempts: TranslationAttempt[];
	questions: ReadonlyMap<string, TranslationQuestion>;
}

export interface StatisticsResult {
	snapshot: StatisticsSnapshot;
	source: StatisticsSource;
}

export type SelectionStatisticsSnapshot = Required<SelectionStatistics>;

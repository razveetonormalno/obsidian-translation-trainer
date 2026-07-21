import { CURRENT_DATA_SCHEMA_VERSION } from '../domain/constants';
import type { QuestionProgress } from '../domain/types';
import { DEFAULT_SETTINGS, mergeSettings, type TranslationTrainerSettings } from '../settings';

export interface SchedulerState {
	lastAutomaticShownAt?: string;
	lastExerciseShownAt?: string;
	lastAutomaticCheckAt?: string;
	automaticShownDay?: string;
	automaticShownCount: number;
}

/** Rebuildable values only; attempts JSONL remains the statistical source of truth. */
export interface StatisticsCache {
	lastRebuiltAt?: string;
	attemptCount: number;
	questionCount: number;
}

export interface PluginData {
	schemaVersion: number;
	settings: TranslationTrainerSettings;
	questionProgress: Record<string, QuestionProgress>;
	scheduler: SchedulerState;
	statisticsCache: StatisticsCache;
}

export const EMPTY_SCHEDULER_STATE: SchedulerState = {
	automaticShownCount: 0,
};

export const EMPTY_STATISTICS_CACHE: StatisticsCache = {
	attemptCount: 0,
	questionCount: 0,
};

export function createDefaultPluginData(): PluginData {
	return {
		schemaVersion: CURRENT_DATA_SCHEMA_VERSION,
		settings: { ...DEFAULT_SETTINGS },
		questionProgress: {},
		scheduler: { ...EMPTY_SCHEDULER_STATE },
		statisticsCache: { ...EMPTY_STATISTICS_CACHE },
	};
}

/** Migration is deliberately idempotent: calling it repeatedly returns schema v1. */
export function migratePluginData(raw: unknown): PluginData {
	const defaults = createDefaultPluginData();
	if (!isRecord(raw)) return defaults;
	return {
		schemaVersion: CURRENT_DATA_SCHEMA_VERSION,
		settings: mergeSettings(raw.settings ?? raw),
		questionProgress: sanitizeProgressMap(raw.questionProgress),
		scheduler: sanitizeScheduler(raw.scheduler),
		statisticsCache: sanitizeStatisticsCache(raw.statisticsCache),
	};
}

/** Minimal contract implemented by Obsidian Plugin; convenient for unit tests too. */
export interface PluginDataPersistence {
	loadData(): Promise<unknown>;
	saveData(data: PluginData): Promise<void>;
}

export class PluginDataStore {
	constructor(private readonly persistence: PluginDataPersistence) {}

	async load(): Promise<PluginData> {
		return migratePluginData(await this.persistence.loadData());
	}

	async save(data: PluginData): Promise<void> {
		await this.persistence.saveData(migratePluginData(data));
	}
}

function sanitizeProgressMap(value: unknown): Record<string, QuestionProgress> {
	if (!isRecord(value)) return {};
	const result: Record<string, QuestionProgress> = {};
	for (const [questionId, progress] of Object.entries(value)) {
		if (isQuestionProgress(progress)) result[questionId] = { ...progress };
	}
	return result;
}

function isQuestionProgress(value: unknown): value is QuestionProgress {
	if (!isRecord(value)) return false;
	return isReviewStatus(value.status) && typeof value.dueAt === 'string' &&
		typeof value.intervalMinutes === 'number' && typeof value.successStreak === 'number' &&
		typeof value.successfulReviews === 'number' && typeof value.lapses === 'number';
}

function sanitizeScheduler(value: unknown): SchedulerState {
	if (!isRecord(value)) return { ...EMPTY_SCHEDULER_STATE };
	return {
		lastAutomaticShownAt: optionalString(value.lastAutomaticShownAt),
		lastExerciseShownAt: optionalString(value.lastExerciseShownAt),
		lastAutomaticCheckAt: optionalString(value.lastAutomaticCheckAt),
		automaticShownDay: optionalString(value.automaticShownDay),
		automaticShownCount: nonNegativeInteger(value.automaticShownCount),
	};
}

function sanitizeStatisticsCache(value: unknown): StatisticsCache {
	if (!isRecord(value)) return { ...EMPTY_STATISTICS_CACHE };
	return {
		lastRebuiltAt: optionalString(value.lastRebuiltAt),
		attemptCount: nonNegativeInteger(value.attemptCount),
		questionCount: nonNegativeInteger(value.questionCount),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function nonNegativeInteger(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function isReviewStatus(value: unknown): boolean {
	return value === 'new' || value === 'learning' || value === 'review' || value === 'suspended' || value === 'archived';
}

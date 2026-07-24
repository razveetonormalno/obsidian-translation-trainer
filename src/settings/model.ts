import type { CefrLevel } from '../domain/types';

export type SchedulerMode = 'active' | 'background';

export const MIN_EXERCISE_MODAL_WIDTH = 520;
export const MAX_EXERCISE_MODAL_WIDTH = 1200;

export interface TranslationTrainerSettings {
	vocabularyPath: string;
	vocabularySection: string;
	cefrLevel: CefrLevel;
	endpoint: string;
	model: string;
	timeoutMs: number;
	schedulerMode: SchedulerMode;
	cadenceMinutes: number;
	minimumIntervalMinutes: number;
	quietHoursStart: string;
	quietHoursEnd: string;
	dailyAutomaticLimit: number;
	exerciseModalWidth: number;
	paused: boolean;
}

export const DEFAULT_SETTINGS: Readonly<TranslationTrainerSettings> = {
	vocabularyPath: '',
	vocabularySection: '',
	cefrLevel: 'B1',
	endpoint: 'http://127.0.0.1:8080/v1',
	model: 'qwen3-8b',
	timeoutMs: 120_000,
	schedulerMode: 'active',
	cadenceMinutes: 30,
	minimumIntervalMinutes: 20,
	quietHoursStart: '23:00',
	quietHoursEnd: '09:00',
	dailyAutomaticLimit: 10,
	exerciseModalWidth: 760,
	paused: false,
};

export function mergeSettings(value: unknown): TranslationTrainerSettings {
	if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
	const candidate = value as Partial<TranslationTrainerSettings>;
	return {
		vocabularyPath: markdownPathOr(candidate.vocabularyPath, DEFAULT_SETTINGS.vocabularyPath),
		vocabularySection: stringOr(candidate.vocabularySection, DEFAULT_SETTINGS.vocabularySection),
		cefrLevel: isCefrLevel(candidate.cefrLevel) ? candidate.cefrLevel : DEFAULT_SETTINGS.cefrLevel,
		endpoint: stringOr(candidate.endpoint, DEFAULT_SETTINGS.endpoint),
		model: stringOr(candidate.model, DEFAULT_SETTINGS.model),
		timeoutMs: positiveIntegerOr(candidate.timeoutMs, DEFAULT_SETTINGS.timeoutMs),
		schedulerMode: candidate.schedulerMode === 'background' ? 'background' : 'active',
		cadenceMinutes: positiveIntegerOr(candidate.cadenceMinutes, DEFAULT_SETTINGS.cadenceMinutes),
		minimumIntervalMinutes: positiveIntegerOr(candidate.minimumIntervalMinutes, DEFAULT_SETTINGS.minimumIntervalMinutes),
		quietHoursStart: timeOr(candidate.quietHoursStart, DEFAULT_SETTINGS.quietHoursStart),
		quietHoursEnd: timeOr(candidate.quietHoursEnd, DEFAULT_SETTINGS.quietHoursEnd),
		dailyAutomaticLimit: positiveIntegerOr(candidate.dailyAutomaticLimit, DEFAULT_SETTINGS.dailyAutomaticLimit),
		exerciseModalWidth: boundedIntegerOr(candidate.exerciseModalWidth, DEFAULT_SETTINGS.exerciseModalWidth, MIN_EXERCISE_MODAL_WIDTH, MAX_EXERCISE_MODAL_WIDTH),
		paused: typeof candidate.paused === 'boolean' ? candidate.paused : DEFAULT_SETTINGS.paused,
	};
}

export function isVocabularyConfigured(settings: Pick<TranslationTrainerSettings, 'vocabularyPath'>): boolean {
	return settings.vocabularyPath.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function markdownPathOr(value: unknown, fallback: string): string {
	const path = typeof value === 'string' ? value.trim() : fallback;
	if (!path) return '';
	return /\.[^/]+$/u.test(path) ? path : `${path}.md`;
}

function positiveIntegerOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function boundedIntegerOr(value: unknown, fallback: number, minimum: number, maximum: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function timeOr(value: unknown, fallback: string): string {
	return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function isCefrLevel(value: unknown): value is CefrLevel {
	return value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1';
}

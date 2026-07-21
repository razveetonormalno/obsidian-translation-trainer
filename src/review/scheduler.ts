import type { TranslationTrainerSettings } from '../settings';
import type { SchedulerState } from '../storage';

const MINUTE = 60_000;

export type AutomaticGateReason =
	| 'ready'
	| 'paused'
	| 'modal-open'
	| 'inactive'
	| 'quiet-hours'
	| 'daily-limit'
	| 'cadence'
	| 'minimum-interval';

export interface AutomaticGateInput {
	settings: Pick<TranslationTrainerSettings, 'paused' | 'schedulerMode' | 'cadenceMinutes' | 'minimumIntervalMinutes' | 'quietHoursStart' | 'quietHoursEnd' | 'dailyAutomaticLimit'>;
	state: SchedulerState;
	now: Date;
	modalOpen: boolean;
	appActive: boolean;
}

export interface AutomaticGateResult {
	reason: AutomaticGateReason;
	state: SchedulerState;
}

export interface SchedulerDependencies {
	getSettings(): TranslationTrainerSettings;
	getState(): SchedulerState;
	saveState(state: SchedulerState): Promise<void>;
	isModalOpen(): boolean;
	isAppActive(): boolean;
	/** Return true only when an automatic exercise was actually displayed. */
	showAutomaticExercise(): Promise<boolean>;
	now?: () => Date;
}

export interface SchedulerCheckResult {
	reason: AutomaticGateReason;
	shown: boolean;
}

/**
 * Side-effect boundary for automatic scheduling. The host calls check() once a
 * minute via registerInterval; this class deliberately owns no UI or timers.
 */
export class ReviewScheduler {
	constructor(private readonly dependencies: SchedulerDependencies) {}

	async check(): Promise<SchedulerCheckResult> {
		const now = this.dependencies.now?.() ?? new Date();
		const gate = evaluateAutomaticGate({
			settings: this.dependencies.getSettings(),
			state: this.dependencies.getState(),
			now,
			modalOpen: this.dependencies.isModalOpen(),
			appActive: this.dependencies.isAppActive(),
		});
		if (gate.reason !== 'ready') {
			await this.dependencies.saveState(gate.state);
			return { reason: gate.reason, shown: false };
		}

		const shown = await this.dependencies.showAutomaticExercise();
		const state = shown ? markAutomaticShown(gate.state, now) : gate.state;
		await this.dependencies.saveState(state);
		return { reason: 'ready', shown };
	}

	/** Manual command bypasses all time gates but never allows a second modal. */
	canStartManualExercise(): boolean {
		return !this.dependencies.isModalOpen();
	}
}

export function evaluateAutomaticGate(input: AutomaticGateInput): AutomaticGateResult {
	const now = input.now;
	let state = resetDailyCount(input.state, now);
	state = { ...state, lastAutomaticCheckAt: now.toISOString() };
	if (input.settings.paused) return { reason: 'paused', state };
	if (input.modalOpen) return { reason: 'modal-open', state };
	if (input.settings.schedulerMode === 'active' && !input.appActive) return { reason: 'inactive', state };
	if (isQuietHours(now, input.settings.quietHoursStart, input.settings.quietHoursEnd)) return { reason: 'quiet-hours', state };
	if (state.automaticShownCount >= input.settings.dailyAutomaticLimit) return { reason: 'daily-limit', state };
	if (!elapsedAtLeast(state.lastAutomaticShownAt, now, input.settings.cadenceMinutes)) return { reason: 'cadence', state };
	if (!elapsedAtLeast(state.lastExerciseShownAt ?? state.lastAutomaticShownAt, now, input.settings.minimumIntervalMinutes)) return { reason: 'minimum-interval', state };
	return { reason: 'ready', state };
}

export function markAutomaticShown(state: SchedulerState, now = new Date()): SchedulerState {
	const reset = resetDailyCount(state, now);
	return {
		...reset,
		lastAutomaticShownAt: now.toISOString(),
		lastExerciseShownAt: now.toISOString(),
		automaticShownDay: localDayKey(now),
		automaticShownCount: reset.automaticShownCount + 1,
	};
}

/** Records a manually displayed exercise for the minimum interval gate only. */
export function markExerciseShown(state: SchedulerState, now = new Date()): SchedulerState {
	return { ...state, lastExerciseShownAt: now.toISOString() };
}

export function isQuietHours(now: Date, start: string, end: string): boolean {
	const startMinutes = parseTime(start);
	const endMinutes = parseTime(end);
	if (startMinutes === undefined || endMinutes === undefined || startMinutes === endMinutes) return false;
	const current = now.getHours() * 60 + now.getMinutes();
	return startMinutes < endMinutes
		? current >= startMinutes && current < endMinutes
		: current >= startMinutes || current < endMinutes;
}

export function localDayKey(now: Date): string {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

function resetDailyCount(state: SchedulerState, now: Date): SchedulerState {
	return state.automaticShownDay === localDayKey(now)
		? { ...state }
		: { ...state, automaticShownDay: localDayKey(now), automaticShownCount: 0 };
}

function elapsedAtLeast(timestamp: string | undefined, now: Date, minutes: number): boolean {
	if (!timestamp) return true;
	const prior = Date.parse(timestamp);
	return !Number.isFinite(prior) || now.getTime() - prior >= minutes * MINUTE;
}

function parseTime(value: string): number | undefined {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return undefined;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : undefined;
}

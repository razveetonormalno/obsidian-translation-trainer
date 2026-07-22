import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_EXERCISE_MODAL_WIDTH, mergeSettings, MIN_EXERCISE_MODAL_WIDTH } from '../src/settings/model';

describe('settings', () => {
	it('keeps a valid exercise window width', () => {
		expect(mergeSettings({ exerciseModalWidth: 980 }).exerciseModalWidth).toBe(980);
	});

	it('falls back for widths outside the supported range', () => {
		expect(mergeSettings({ exerciseModalWidth: MIN_EXERCISE_MODAL_WIDTH - 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
		expect(mergeSettings({ exerciseModalWidth: MAX_EXERCISE_MODAL_WIDTH + 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
	});
});

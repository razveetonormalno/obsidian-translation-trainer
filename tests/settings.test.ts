import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_EXERCISE_MODAL_WIDTH, mergeSettings, MIN_EXERCISE_MODAL_WIDTH } from '../src/settings/model';
import { ApiKeyStore } from '../src/settings/secrets';

describe('settings', () => {
	it('keeps a valid exercise window width', () => {
		expect(mergeSettings({ exerciseModalWidth: 980 }).exerciseModalWidth).toBe(980);
	});

	it('falls back for widths outside the supported range', () => {
		expect(mergeSettings({ exerciseModalWidth: MIN_EXERCISE_MODAL_WIDTH - 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
		expect(mergeSettings({ exerciseModalWidth: MAX_EXERCISE_MODAL_WIDTH + 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
	});

	it('repairs a synchronized vocabulary path without the markdown extension', () => {
		expect(mergeSettings({ vocabularyPath: 'Study/English/Interesting Words' }).vocabularyPath)
			.toBe('Study/English/Interesting Words.md');
	});
});

describe('API key storage compatibility', () => {
	it('does not crash startup when SecretStorage is unavailable', () => {
		const store = new ApiKeyStore({} as never);
		expect(store.get()).toBeNull();
		expect(() => store.set('secret')).toThrow('SecretStorage failed');
	});

	it('uses SecretStorage when the runtime provides it', () => {
		let saved = '';
		const store = new ApiKeyStore({
			secretStorage: {
				getSecret: () => saved || null,
				setSecret: (_id: string, value: string) => { saved = value; },
			},
		} as never);
		store.set('secret');
		expect(store.get()).toBe('secret');
	});
});

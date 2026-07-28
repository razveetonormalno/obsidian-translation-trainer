import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	isVocabularyConfigured,
	MAX_EXERCISE_MODAL_WIDTH,
	mergeSettings,
	MIN_EXERCISE_MODAL_WIDTH,
	SUGGESTED_MODELS,
} from '../src/settings/model';
import { ApiKeyStore } from '../src/settings/secrets';
import { DeviceLlmSettingsStore, settingsForVault } from '../src/settings/device';
import { rankMarkdownNotePaths } from '../src/settings/note-suggestions';

describe('settings', () => {
	it('keeps a valid exercise window width', () => {
		expect(mergeSettings({ exerciseModalWidth: 980 }).exerciseModalWidth).toBe(980);
	});

	it('offers common models while keeping qwen as the default', () => {
		expect(SUGGESTED_MODELS).toEqual([
			'qwen3-8b',
			'gemma-3-12b-it',
			'gpt-5.4-mini',
			'gpt-5.6-luna',
			'gpt-5.6-terra',
		]);
		expect(DEFAULT_SETTINGS.model).toBe('qwen3-8b');
		expect(mergeSettings({ model: 'custom-model' }).model).toBe('custom-model');
	});

	it('falls back for widths outside the supported range', () => {
		expect(mergeSettings({ exerciseModalWidth: MIN_EXERCISE_MODAL_WIDTH - 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
		expect(mergeSettings({ exerciseModalWidth: MAX_EXERCISE_MODAL_WIDTH + 1 }).exerciseModalWidth).toBe(DEFAULT_SETTINGS.exerciseModalWidth);
	});

	it('repairs a synchronized vocabulary path without the markdown extension', () => {
		expect(mergeSettings({ vocabularyPath: 'Study/English/Interesting Words' }).vocabularyPath)
			.toBe('Study/English/Interesting Words.md');
	});

	it('starts with no vocabulary note and preserves an explicit empty selection', () => {
		expect(DEFAULT_SETTINGS.vocabularyPath).toBe('');
		expect(mergeSettings({}).vocabularyPath).toBe('');
		expect(mergeSettings({ vocabularyPath: '   ' }).vocabularyPath).toBe('');
		expect(isVocabularyConfigured(mergeSettings({}))).toBe(false);
		expect(isVocabularyConfigured(mergeSettings({ vocabularyPath: 'Words.md' }))).toBe(true);
	});

	it('ranks matching Markdown notes while the user types', () => {
		const paths = [
			'Projects/Meeting notes.md',
			'Study/English/Interesting Words.md',
			'Study/English/Grammar.md',
		];
		expect(rankMarkdownNotePaths(paths, 'interesting')).toEqual([
			'Study/English/Interesting Words.md',
		]);
		expect(rankMarkdownNotePaths(paths, 'int wrd')).toEqual([
			'Study/English/Interesting Words.md',
		]);
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

describe('device-specific model settings', () => {
	it('seeds each device once and keeps its own connection settings', () => {
		const values = new Map<string, unknown>();
		const app = {
			loadLocalStorage: (key: string) => values.get(key) ?? null,
			saveLocalStorage: (key: string, value: unknown) => { values.set(key, value); },
		};
		const store = new DeviceLlmSettingsStore(app);
		const first = store.load({ ...DEFAULT_SETTINGS, endpoint: 'http://windows:8080/v1', model: 'windows-model' });
		expect(first).toMatchObject({ endpoint: 'http://windows:8080/v1', model: 'windows-model' });

		store.save({ endpoint: 'https://phone.example/v1', model: 'phone-model', timeoutMs: 45_000 });
		const reloaded = store.load({ ...DEFAULT_SETTINGS, endpoint: 'http://macbook:8080/v1', model: 'mac-model' });
		expect(reloaded).toEqual({ endpoint: 'https://phone.example/v1', model: 'phone-model', timeoutMs: 45_000 });
	});

	it('keeps device connection values out of synchronized plugin data', () => {
		const runtime = { ...DEFAULT_SETTINGS, endpoint: 'https://phone.example/v1', model: 'phone-model', timeoutMs: 45_000 };
		const persisted = settingsForVault(runtime, { endpoint: 'http://migration-default:8080/v1', model: 'fallback-model', timeoutMs: 120_000 });
		expect(persisted).toMatchObject({ endpoint: 'http://migration-default:8080/v1', model: 'fallback-model', timeoutMs: 120_000 });
	});
});

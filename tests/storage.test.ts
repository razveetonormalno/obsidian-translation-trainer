import { describe, expect, it } from 'vitest';
import { JsonlStore } from '../src/storage/jsonl';
import { createDefaultPluginData, migratePluginData, PluginDataStore } from '../src/storage/model';
import { TranslationTrainerFileStore } from '../src/storage/repository';

class MemoryAdapter {
	readonly files = new Map<string, string>();
	readonly directories = new Set<string>();
	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.directories.has(path); }
	async mkdir(path: string): Promise<void> { this.directories.add(path); }
	async append(path: string, text: string): Promise<void> { await Promise.resolve(); this.files.set(path, `${this.files.get(path) ?? ''}${text}`); }
	async read(path: string): Promise<string> { return this.files.get(path) ?? ''; }
	async write(path: string, text: string): Promise<void> { this.files.set(path, text); }
}

describe('plugin-data migration', () => {
	it('creates a clean installation without a preselected vocabulary note', () => {
		const data = createDefaultPluginData();
		expect(data.settings.vocabularyPath).toBe('');
		expect(data.questionProgress).toEqual({});
		expect(data.scheduler.automaticShownCount).toBe(0);
	});

	it('is idempotent and sanitizes invalid persisted fields', async () => {
		const raw = { settings: { level: 'B1', timeoutMs: -1 }, questionProgress: { good: { status: 'review', dueAt: 'x', intervalMinutes: 1, successStreak: 1, successfulReviews: 1, lapses: 0 }, bad: { status: 'nope' } }, scheduler: { automaticShownCount: -1 }, statisticsCache: { attemptCount: 2.3 } };
		const migrated = migratePluginData(raw);
		expect(migrated.questionProgress).toHaveProperty('good');
		expect(migrated.questionProgress).not.toHaveProperty('bad');
		expect(migrated.scheduler.automaticShownCount).toBe(0);
		expect(migratePluginData(migrated)).toEqual(migrated);
		let saved = createDefaultPluginData();
		const store = new PluginDataStore({ loadData: async () => raw, saveData: async (value) => { saved = value; } });
		await store.save(await store.load());
		expect(saved.schemaVersion).toBe(1);
	});
});

describe('JsonlStore', () => {
	it('skips corrupt lines independently and serializes concurrent appends', async () => {
		const adapter = new MemoryAdapter();
		const diagnostics: number[] = [];
		const store = new JsonlStore(adapter as never, () => diagnostics.push(1));
		await store.ensureDirectory('.translation-trainer/attempts');
		await Promise.all(Array.from({ length: 20 }, (_, index) => store.append('records.jsonl', { index })));
		adapter.files.set('records.jsonl', `${adapter.files.get('records.jsonl')}not json\n{"index":"bad"}\n`);
		const records = await store.readValidLines('records.jsonl', (value): value is { index: number } => typeof value === 'object' && value !== null && typeof (value as { index?: unknown }).index === 'number');
		expect(records.map((item) => item.index)).toEqual(Array.from({ length: 20 }, (_, index) => index));
		expect(diagnostics).toHaveLength(2);
	});
});

describe('starter bank updates', () => {
	it('installs once and replaces only the starter bank after a version bump', async () => {
		const adapter = new MemoryAdapter();
		const store = new TranslationTrainerFileStore(adapter as never);
		const starterPath = store.questionBankPath('starter');
		const importedPath = store.questionBankPath('imported');
		adapter.files.set(importedPath, '{"id":"imported"}\n');

		expect(await store.initializeStarterBank('{"id":"starter-v1"}', 1)).toBe(true);
		expect(adapter.files.get(starterPath)).toBe('{"id":"starter-v1"}\n');
		expect(await store.initializeStarterBank('{"id":"changed-without-bump"}', 1)).toBe(false);
		expect(adapter.files.get(starterPath)).toBe('{"id":"starter-v1"}\n');

		expect(await store.initializeStarterBank('{"id":"starter-v2"}', 2)).toBe(true);
		expect(adapter.files.get(starterPath)).toBe('{"id":"starter-v2"}\n');
		expect(adapter.files.get(importedPath)).toBe('{"id":"imported"}\n');
		expect(JSON.parse(adapter.files.get(store.starterBankVersionPath()) ?? '')).toEqual({ version: 2 });
	});

	it('upgrades a legacy bank that has no version marker', async () => {
		const adapter = new MemoryAdapter();
		const store = new TranslationTrainerFileStore(adapter as never);
		adapter.files.set(store.questionBankPath('starter'), '{"id":"legacy"}\n');

		expect(await store.initializeStarterBank('{"id":"bundled"}', 1)).toBe(true);
		expect(adapter.files.get(store.questionBankPath('starter'))).toBe('{"id":"bundled"}\n');
	});
});

import { describe, expect, it } from 'vitest';
import { JsonlStore } from '../src/storage/jsonl';
import { createDefaultPluginData, migratePluginData, PluginDataStore } from '../src/storage/model';

class MemoryAdapter {
	readonly files = new Map<string, string>();
	readonly directories = new Set<string>();
	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.directories.has(path); }
	async mkdir(path: string): Promise<void> { this.directories.add(path); }
	async append(path: string, text: string): Promise<void> { await Promise.resolve(); this.files.set(path, `${this.files.get(path) ?? ''}${text}`); }
	async read(path: string): Promise<string> { return this.files.get(path) ?? ''; }
}

describe('plugin-data migration', () => {
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

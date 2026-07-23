import { describe, expect, it } from 'vitest';
import { DiagnosticLog } from '../src/diagnostics/log';
import { formatErrorDiagnostics } from '../src/diagnostics/format';
import { DIAGNOSTIC_LOG_PATH } from '../src/domain/constants';
import { LlmError } from '../src/llm/errors';

class MemoryAdapter {
	readonly files = new Map<string, string>();
	readonly directories = new Set<string>();
	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.directories.has(path); }
	async mkdir(path: string): Promise<void> { this.directories.add(path); }
	async read(path: string): Promise<string> { return this.files.get(path) ?? ''; }
	async write(path: string, text: string): Promise<void> { this.files.set(path, text); }
}

describe('diagnostic formatting', () => {
	it('includes the HTTP response while redacting credentials and URLs', () => {
		const error = new LlmError(
			'http',
			'Сервер модели вернул ошибку 400.',
			'POST /chat/completions: HTTP 400 at https://api.openai.com/v1',
			'{"error":"bad request","api_key":"sk-secret-value"}',
		);
		const details = formatErrorDiagnostics(error);
		expect(details).toContain('Код: http');
		expect(details).toContain('POST /chat/completions: HTTP 400');
		expect(details).toContain('bad request');
		expect(details).not.toContain('api.openai.com');
		expect(details).not.toContain('sk-secret-value');
	});
});

describe('DiagnosticLog', () => {
	it('keeps only records from the last 24 hours', async () => {
		const adapter = new MemoryAdapter();
		let now = Date.parse('2026-07-22T12:00:00.000Z');
		adapter.files.set(DIAGNOSTIC_LOG_PATH, [
			JSON.stringify({ timestamp: '2026-07-21T11:59:59.000Z', context: 'old', details: 'old' }),
			JSON.stringify({ timestamp: '2026-07-21T12:00:00.000Z', context: 'recent', details: 'recent' }),
			'damaged',
		].join('\n'));
		const log = new DiagnosticLog(adapter as never, () => now);

		await log.initialize();
		expect(await log.readText()).toContain('recent');
		expect(await log.readText()).not.toContain('old');

		await log.append(new Error('network failed'), 'Проверка подключения');
		expect(await log.readText()).toContain('network failed');

		now += 24 * 60 * 60 * 1_000 + 1;
		await log.prune();
		expect(await log.readText()).toBe('');
	});
});

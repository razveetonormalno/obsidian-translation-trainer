import type { DataAdapter } from 'obsidian';
import {
	DIAGNOSTIC_LOG_DIRECTORY,
	DIAGNOSTIC_LOG_PATH,
	DIAGNOSTIC_LOG_RETENTION_MS,
	SERVICE_DIRECTORY,
} from '../domain/constants';
import { formatErrorDiagnostics, sanitizeDiagnosticText } from './format';

interface DiagnosticLogRecord {
	timestamp: string;
	context: string;
	details: string;
}

export class DiagnosticLog {
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly adapter: DataAdapter,
		private readonly now: () => number = Date.now,
	) {}

	async initialize(): Promise<void> {
		await this.ensureStorage();
		await this.prune();
	}

	append(error: unknown, context: string): Promise<void> {
		return this.enqueue(async () => {
			await this.ensureStorage();
			const records = await this.readRecords();
			records.push({
				timestamp: new Date(this.now()).toISOString(),
				context: sanitizeDiagnosticText(context).slice(0, 500),
				details: formatErrorDiagnostics(error),
			});
			await this.writeRecords(this.recent(records));
		});
	}

	prune(): Promise<void> {
		return this.enqueue(async () => {
			await this.ensureStorage();
			const records = await this.readRecords();
			const recent = this.recent(records);
			if (recent.length !== records.length) await this.writeRecords(recent);
		});
	}

	readText(): Promise<string> {
		return this.enqueue(async () => {
			await this.ensureStorage();
			const records = this.recent(await this.readRecords());
			await this.writeRecords(records);
			return records.map((record) => JSON.stringify(record)).join('\n');
		});
	}

	private enqueue<T>(action: () => Promise<T>): Promise<T> {
		const operation = this.tail.then(action);
		this.tail = operation.then(() => undefined, () => undefined);
		return operation;
	}

	private async readRecords(): Promise<DiagnosticLogRecord[]> {
		if (!(await this.adapter.exists(DIAGNOSTIC_LOG_PATH))) return [];
		const text = await this.adapter.read(DIAGNOSTIC_LOG_PATH);
		const records: DiagnosticLogRecord[] = [];
		for (const line of text.split(/\r?\n/u)) {
			if (!line.trim()) continue;
			try {
				const value: unknown = JSON.parse(line);
				if (isDiagnosticLogRecord(value)) records.push(value);
			} catch {
				// A damaged diagnostic line is disposable and omitted during compaction.
			}
		}
		return records;
	}

	private recent(records: DiagnosticLogRecord[]): DiagnosticLogRecord[] {
		const threshold = this.now() - DIAGNOSTIC_LOG_RETENTION_MS;
		return records.filter((record) => {
			const timestamp = Date.parse(record.timestamp);
			return Number.isFinite(timestamp) && timestamp >= threshold;
		});
	}

	private async writeRecords(records: DiagnosticLogRecord[]): Promise<void> {
		const text = records.map((record) => JSON.stringify(record)).join('\n');
		await this.adapter.write(DIAGNOSTIC_LOG_PATH, text ? `${text}\n` : '');
	}

	private async ensureDirectory(path: string): Promise<void> {
		if (await this.adapter.exists(path)) return;
		try {
			await this.adapter.mkdir(path);
		} catch (error) {
			if (!(await this.adapter.exists(path))) throw error;
		}
	}

	private async ensureStorage(): Promise<void> {
		await this.ensureDirectory(SERVICE_DIRECTORY);
		await this.ensureDirectory(DIAGNOSTIC_LOG_DIRECTORY);
		if (!(await this.adapter.exists(DIAGNOSTIC_LOG_PATH))) {
			await this.adapter.write(DIAGNOSTIC_LOG_PATH, '');
		}
	}
}

function isDiagnosticLogRecord(value: unknown): value is DiagnosticLogRecord {
	return typeof value === 'object' && value !== null &&
		typeof (value as Partial<DiagnosticLogRecord>).timestamp === 'string' &&
		typeof (value as Partial<DiagnosticLogRecord>).context === 'string' &&
		typeof (value as Partial<DiagnosticLogRecord>).details === 'string';
}

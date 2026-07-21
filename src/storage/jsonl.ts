import type { DataAdapter } from 'obsidian';

export interface StorageDiagnostic {
	path: string;
	message: string;
	line?: number;
}

export type StorageDiagnosticReporter = (diagnostic: StorageDiagnostic) => void;

/** Serializes append operations so concurrent writes cannot interleave JSON lines. */
export class JsonlStore {
	private appendTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly adapter: DataAdapter,
		private readonly report: StorageDiagnosticReporter = () => undefined,
	) {}

	async ensureDirectory(path: string): Promise<void> {
		if (await this.adapter.exists(path)) return;
		try {
			await this.adapter.mkdir(path);
		} catch (error) {
			if (!(await this.adapter.exists(path))) throw error;
		}
	}

	append<T>(path: string, record: T): Promise<void> {
		const operation = this.appendTail.then(async () => {
			await this.adapter.append(path, `${JSON.stringify(record)}\n`);
		});
		this.appendTail = operation.catch(() => undefined);
		return operation;
	}

	async readValidLines<T>(path: string, guard: (value: unknown) => value is T): Promise<T[]> {
		if (!(await this.adapter.exists(path))) return [];
		const text = await this.adapter.read(path);
		const values: T[] = [];
		for (const [index, line] of text.split(/\r?\n/).entries()) {
			if (line.trim().length === 0) continue;
			try {
				const parsed: unknown = JSON.parse(line);
				if (guard(parsed)) values.push(parsed);
				else this.report({ path, line: index + 1, message: 'Строка JSONL не соответствует ожидаемой схеме.' });
			} catch {
				this.report({ path, line: index + 1, message: 'Повреждённая строка JSONL пропущена.' });
			}
		}
		return values;
	}
}

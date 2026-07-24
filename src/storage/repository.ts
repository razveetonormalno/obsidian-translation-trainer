import type { DataAdapter } from 'obsidian';
import { ATTEMPTS_DIRECTORY, QUESTION_BANK_DIRECTORY, SERVICE_DIRECTORY } from '../domain/constants';
import type { TranslationAttempt, TranslationQuestion } from '../domain/types';
import { JsonlStore, type StorageDiagnosticReporter } from './jsonl';

export type QuestionBankName = 'starter' | 'imported' | 'generated';

export class TranslationTrainerFileStore {
	private readonly jsonl: JsonlStore;
	private readonly report: StorageDiagnosticReporter;

	constructor(private readonly adapter: DataAdapter, report?: StorageDiagnosticReporter) {
		this.report = report ?? (() => undefined);
		this.jsonl = new JsonlStore(adapter, this.report);
	}

	async ensureServiceDirectories(): Promise<void> {
		await this.jsonl.ensureDirectory(SERVICE_DIRECTORY);
		await this.jsonl.ensureDirectory(QUESTION_BANK_DIRECTORY);
		await this.jsonl.ensureDirectory(ATTEMPTS_DIRECTORY);
	}

	async appendQuestion(bank: QuestionBankName, question: TranslationQuestion): Promise<void> {
		await this.ensureServiceDirectories();
		return this.jsonl.append(this.questionBankPath(bank), question);
	}

	async readQuestions(bank: QuestionBankName): Promise<TranslationQuestion[]> {
		return this.jsonl.readValidLines(this.questionBankPath(bank), isTranslationQuestion);
	}

	/**
	 * Installs or upgrades the bundled starter bank. Its version marker lives beside
	 * the device-local bank so synchronized plugin settings cannot skip an upgrade.
	 */
	async initializeStarterBank(serializedJsonl: string, version: number): Promise<boolean> {
		await this.ensureServiceDirectories();
		const path = this.questionBankPath('starter');
		const installedVersion = await this.readStarterBankVersion();
		if (await this.adapter.exists(path) && installedVersion >= version) return false;
		await this.adapter.write(path, serializedJsonl.endsWith('\n') ? serializedJsonl : `${serializedJsonl}\n`);
		await this.adapter.write(this.starterBankVersionPath(), `${JSON.stringify({ version })}\n`);
		return true;
	}

	async appendAttempt(attempt: TranslationAttempt): Promise<void> {
		await this.ensureServiceDirectories();
		return this.jsonl.append(this.attemptPath(attempt.timestamp), attempt);
	}

	async readAttempts(month: string): Promise<TranslationAttempt[]> {
		return this.jsonl.readValidLines(`${ATTEMPTS_DIRECTORY}/${month}.jsonl`, isTranslationAttempt);
	}

	async listAttemptMonths(): Promise<string[]> {
		if (!(await this.adapter.exists(ATTEMPTS_DIRECTORY))) return [];
		const listed = await this.adapter.list(ATTEMPTS_DIRECTORY);
		return listed.files
			.map((path) => path.match(/\/(\d{4}-\d{2})\.jsonl$/)?.[1])
			.filter((month): month is string => month !== undefined)
			.sort();
	}

	questionBankPath(bank: QuestionBankName): string {
		return `${QUESTION_BANK_DIRECTORY}/${bank}.jsonl`;
	}

	starterBankVersionPath(): string {
		return `${QUESTION_BANK_DIRECTORY}/starter.version.json`;
	}

	attemptPath(timestamp: string): string {
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) throw new Error('Неверная дата попытки.');
		return `${ATTEMPTS_DIRECTORY}/${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}.jsonl`;
	}

	private async readStarterBankVersion(): Promise<number> {
		const path = this.starterBankVersionPath();
		if (!(await this.adapter.exists(path))) return 0;
		try {
			const parsed: unknown = JSON.parse(await this.adapter.read(path));
			if (isRecord(parsed) && typeof parsed.version === 'number' &&
				Number.isInteger(parsed.version) && parsed.version >= 0) {
				return parsed.version;
			}
		} catch {
			// The diagnostic below covers malformed JSON and an invalid marker shape.
		}
		this.report({ path, message: 'Маркер версии встроенного банка повреждён; банк будет обновлён.' });
		return 0;
	}
}

function isTranslationQuestion(value: unknown): value is TranslationQuestion {
	if (!isRecord(value)) return false;
	return typeof value.id === 'string' && typeof value.sourceRu === 'string' &&
		Array.isArray(value.referenceAnswers) && Array.isArray(value.targetVocabulary) &&
		Array.isArray(value.topics) && Array.isArray(value.expectedFeatures) &&
		typeof value.level === 'string' && typeof value.difficulty === 'number' &&
		typeof value.createdAt === 'string';
}

function isTranslationAttempt(value: unknown): value is TranslationAttempt {
	if (!isRecord(value)) return false;
	return typeof value.id === 'string' && typeof value.questionId === 'string' &&
		typeof value.timestamp === 'string' && typeof value.userAnswer === 'string' &&
		isRecord(value.evaluation) && typeof value.hintUsed === 'boolean' &&
		typeof value.responseTimeMs === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

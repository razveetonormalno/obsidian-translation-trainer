import type { TranslationQuestion } from '../domain/types';
import type { QuestionBankName, TranslationTrainerFileStore } from '../storage/repository';
import { deduplicateQuestions } from './dedupe';
import type { QuestionBankSnapshot } from './types';

export class QuestionBankService {
	constructor(private readonly store: TranslationTrainerFileStore) {}

	async initializeStarterBank(serializedJsonl: string): Promise<boolean> {
		return this.store.initializeStarterBank(serializedJsonl);
	}

	async load(): Promise<QuestionBankSnapshot> {
		const [starter, imported, generated] = await Promise.all([
			this.store.readQuestions('starter'),
			this.store.readQuestions('imported'),
			this.store.readQuestions('generated'),
		]);
		return { starter, imported, generated, questions: deduplicateQuestions([...starter, ...imported, ...generated]) };
	}

	async append(bank: QuestionBankName, question: TranslationQuestion): Promise<void> {
		await this.store.appendQuestion(bank, question);
	}
}

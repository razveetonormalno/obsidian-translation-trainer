import starterBank from '../../assets/starter-bank.jsonl';
import type { TranslationQuestion } from '../domain/types';
import type { TranslationTrainerFileStore } from '../storage/repository';
import { QuestionBankService } from './bank';
import { QuestionGenerator } from './generator';
import { QuestionImportService } from './import';
import { QuestionSelector } from './selector';
import type {
	GeneratedQuestion,
	GenerationContext,
	ImportResult,
	NextQuestionRequest,
	NextQuestionResult,
	QuestionBankSnapshot,
	QuestionGenerationDependencies,
	QuestionSelection,
	QuestionSelectionRequest,
	QuestionValidator,
} from './types';

export interface QuestionServiceDependencies extends Omit<QuestionGenerationDependencies, 'persist'> {
	store: TranslationTrainerFileStore;
	validateQuestion: QuestionValidator;
	starterBankJsonl?: string;
}

/** High-level question API used by commands and UI; it owns no Obsidian UI state. */
export class QuestionService {
	private readonly bank: QuestionBankService;
	private readonly importer: QuestionImportService;
	private readonly selector = new QuestionSelector();
	private readonly generator: QuestionGenerator;
	private readonly starterBankJsonl: string;

	constructor(dependencies: QuestionServiceDependencies) {
		this.bank = new QuestionBankService(dependencies.store);
		this.importer = new QuestionImportService(this.bank, dependencies.validateQuestion);
		this.generator = new QuestionGenerator({
			provider: dependencies.provider,
			topics: dependencies.topics,
			persist: (question) => this.bank.append('generated', question),
		});
		this.starterBankJsonl = dependencies.starterBankJsonl ?? starterBank;
	}

	async initialize(): Promise<boolean> { return this.bank.initializeStarterBank(this.starterBankJsonl); }
	async loadBanks(): Promise<QuestionBankSnapshot> { return this.bank.load(); }
	async importJsonl(serializedJsonl: string): Promise<ImportResult> { return this.importer.importJsonl(serializedJsonl); }
	async generate(context: GenerationContext): Promise<GeneratedQuestion> { return this.generator.generate(context); }

	async selectNext(request: QuestionSelectionRequest): Promise<QuestionSelection> {
		return this.selector.select((await this.bank.load()).questions, request);
	}

	/** Returns a usable bank question, or generates one only after the bank has no eligible candidate. */
	async next(request: NextQuestionRequest): Promise<NextQuestionResult> {
		const selection = await this.selectNext(request);
		if (selection.question) return { question: selection.question, source: 'bank', selection };
		const generated = await this.generate({
			...request.generation,
			level: request.level,
			vocabulary: request.vocabulary,
			statistics: request.statistics,
			recentQuestionsToAvoid: request.generation.recentQuestionsToAvoid ?? request.recentQuestionIds ?? [],
		});
		return { question: generated.question, source: 'generated' };
	}

	async allQuestions(): Promise<TranslationQuestion[]> { return (await this.bank.load()).questions; }
}

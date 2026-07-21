import type {
	CefrLevel,
	GrammarTopic,
	LlmProvider,
	QuestionProgress,
	TranslationQuestion,
	VocabularyEntry,
} from '../domain/types';

export type QuestionValidator = (value: unknown) => value is TranslationQuestion;

export interface ImportDiagnostic {
	line: number;
	reason: string;
}

export interface ImportResult {
	accepted: number;
	skipped: number;
	diagnostics: ImportDiagnostic[];
}

export interface QuestionBankSnapshot {
	starter: TranslationQuestion[];
	imported: TranslationQuestion[];
	generated: TranslationQuestion[];
	questions: TranslationQuestion[];
}

/** Scores and coverage are normalized to 0..1 by the statistics layer. */
export interface SelectionStatistics {
	topicWeakness?: ReadonlyMap<string, number>;
	vocabularyWeakness?: ReadonlyMap<string, number>;
	topicCoverage?: ReadonlyMap<string, number>;
	vocabularyCoverage?: ReadonlyMap<string, number>;
}

export interface QuestionSelectionRequest {
	level: CefrLevel;
	vocabulary: readonly VocabularyEntry[];
	progress: Readonly<Record<string, QuestionProgress>>;
	statistics?: SelectionStatistics;
	now?: Date;
	recentQuestionIds?: readonly string[];
	/** Manual commands may use a least-recently-shown review before its due date. */
	allowEarlyReview?: boolean;
}

export interface QuestionSelection {
	question?: TranslationQuestion;
	reason: 'due-review' | 'weakness' | 'new-bank' | 'least-recently-shown' | 'none';
	priority: number;
}

export interface NextQuestionRequest extends QuestionSelectionRequest {
	generation: Omit<GenerationContext, 'level' | 'vocabulary' | 'statistics' | 'recentQuestionsToAvoid'> & {
		recentQuestionsToAvoid?: readonly string[];
	};
}

export interface NextQuestionResult {
	question: TranslationQuestion;
	source: 'bank' | 'generated';
	selection?: QuestionSelection;
}

export interface GenerationContext {
	level: CefrLevel;
	vocabulary: readonly VocabularyEntry[];
	statistics?: SelectionStatistics;
	recentQuestionsToAvoid: readonly string[];
	desiredDifficulty?: number;
}

export interface GeneratedQuestion {
	question: TranslationQuestion;
	provider: string;
	model: string;
}

export interface QuestionGenerationDependencies {
	provider: LlmProvider;
	persist(question: TranslationQuestion): Promise<void>;
	topics: readonly GrammarTopic[];
}

export { QuestionBankService } from './bank';
export { deduplicateQuestions, normalizedQuestionKey } from './dedupe';
export { QuestionGenerator } from './generator';
export { QuestionImportService } from './import';
export { QuestionSelector, questionPriority } from './selector';
export { QuestionService } from './service';
export type {
	GeneratedQuestion,
	GenerationContext,
	ImportDiagnostic,
	ImportResult,
	NextQuestionRequest,
	NextQuestionResult,
	QuestionBankSnapshot,
	QuestionGenerationDependencies,
	QuestionSelection,
	QuestionSelectionRequest,
	QuestionValidator,
	SelectionStatistics,
} from './types';

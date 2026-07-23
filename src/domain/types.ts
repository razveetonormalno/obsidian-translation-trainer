export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export type ReviewStatus =
	| 'new'
	| 'learning'
	| 'review'
	| 'suspended'
	| 'archived';

export type ErrorSeverity = 'minor' | 'major' | 'critical';

export type EvaluationStatus =
	| 'correct'
	| 'minor-error'
	| 'major-error'
	| 'not-demonstrated';

export interface VocabularyEntry {
	displayTerm: string;
	canonicalKey: string;
	translation: string;
	context: string[];
	sourcePath: string;
}

export interface GrammarTopic {
	id: string;
	level: CefrLevel;
	title: string;
	shortDescription: string;
	generationHints: string[];
	evaluationRules: string[];
	examples: string[];
}

export interface ExpectedFeature {
	topicId: string;
	description: string;
	required: boolean;
	acceptedVariants: string[];
}

export type QuestionSource =
	| 'starter'
	| 'imported'
	| 'local-llm'
	| 'cloud-llm';

export interface TranslationQuestion {
	schemaVersion: number;
	id: string;
	sourceRu: string;
	referenceAnswers: string[];
	targetVocabulary: string[];
	level: CefrLevel;
	topics: string[];
	difficulty: number;
	generationSource: QuestionSource;
	expectedFeatures: ExpectedFeature[];
	createdAt: string;
	generationPromptVersion: number;
}

export interface QuestionProgress {
	status: ReviewStatus;
	dueAt: string;
	snoozedUntil?: string;
	lastShownAt?: string;
	lastReviewedAt?: string;
	intervalMinutes: number;
	successStreak: number;
	successfulReviews: number;
	lapses: number;
	lastScore?: number;
}

export interface CriterionEvaluation {
	score: number;
	explanationRu: string;
}

export interface GrammarTopicScore {
	topicId: string;
	score: number;
	status: EvaluationStatus;
	evidence: string;
	explanationRu: string;
}

export interface GrammarEvaluation extends CriterionEvaluation {
	topicScores: GrammarTopicScore[];
}

export interface VocabularyItemScore {
	canonicalKey: string;
	displayTerm: string;
	score: number;
	status: EvaluationStatus;
	evidence: string;
	explanationRu: string;
}

export interface VocabularyEvaluation extends CriterionEvaluation {
	itemScores: VocabularyItemScore[];
}

export interface TranslationError {
	fragment: string;
	category: 'meaning' | 'grammar' | 'naturalness' | 'vocabulary';
	topicId: string | null;
	vocabularyKey: string | null;
	severity: ErrorSeverity;
	explanationRu: string;
	replacement: string | null;
}

export interface TranslationEvaluation {
	meaning: CriterionEvaluation;
	grammar: GrammarEvaluation;
	naturalness: CriterionEvaluation;
	vocabulary: VocabularyEvaluation;
	overallScore: number;
	isAcceptable: boolean;
	confidence: number;
	correctedTranslation: string;
	alternativeTranslations: string[];
	errors: TranslationError[];
	summaryRu: string;
}

export interface TranslationAttempt {
	schemaVersion: number;
	id: string;
	questionId: string;
	timestamp: string;
	userAnswer: string;
	evaluation: TranslationEvaluation;
	hintUsed: boolean;
	responseTimeMs: number;
	provider: string;
	model: string;
	promptVersion: number;
	llmLatencyMs: number;
}

export interface QuestionGenerationRequest {
	level: CefrLevel;
	targetVocabulary: VocabularyEntry[];
	targetTopics: GrammarTopic[];
	weakTopics: string[];
	recentQuestionsToAvoid: string[];
	desiredDifficulty: number;
}

export interface EvaluationRequest {
	question: TranslationQuestion;
	userAnswer: string;
	allowedTopics: GrammarTopic[];
}

export interface FollowUpMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface FollowUpRequest {
	question: TranslationQuestion;
	userAnswer: string;
	evaluation: TranslationEvaluation;
	history: FollowUpMessage[];
	userQuestion: string;
}

export interface ConnectionTestResult {
	model: string;
	latencyMs: number;
	jsonSchemaSupported: boolean;
	chatCompletionSupported: boolean;
}

export interface LlmRequestMetadata {
	provider: string;
	model: string;
	promptVersion: number;
	latencyMs: number;
}

export interface LlmResult<T> {
	data: T;
	metadata: LlmRequestMetadata;
}

export interface LlmProvider {
	listModels(): Promise<string[]>;
	testConnection(): Promise<ConnectionTestResult>;
	generateQuestion(
		request: QuestionGenerationRequest,
	): Promise<LlmResult<TranslationQuestion>>;
	evaluateAnswer(
		request: EvaluationRequest,
	): Promise<LlmResult<TranslationEvaluation>>;
	answerFollowUp(
		request: FollowUpRequest,
	): Promise<LlmResult<string>>;
}

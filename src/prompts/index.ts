import type { EvaluationRequest, QuestionGenerationRequest } from '../domain/types';

export const GENERATION_PROMPT_VERSION = 1;
export const EVALUATION_PROMPT_VERSION = 1;

export function generationSystemPrompt(request: QuestionGenerationRequest): string {
	return [
		'You create one Russian-to-English translation exercise. Return ONLY a JSON object; no Markdown, no code fence, no commentary.',
		`Prompt version: ${GENERATION_PROMPT_VERSION}.`,
		`CEFR level: ${request.level}. Difficulty: ${request.desiredDifficulty} (a number from 0 to 1).`,
		`Allowed topic IDs: ${request.targetTopics.map((topic) => topic.id).join(', ')}.`,
		`Target vocabulary (use canonicalKey exactly): ${request.targetVocabulary.map((item) => `${item.canonicalKey} = ${item.displayTerm}`).join('; ')}.`,
		'Create a natural Russian source sentence and at least two distinct, correct English reference answers.',
		'Required JSON fields: sourceRu, referenceAnswers, targetVocabulary, level, topics, difficulty, expectedFeatures. Each expectedFeatures item has topicId, description, required, acceptedVariants. Do not include IDs, dates, source, schema version, or prompt version: the client sets them.',
	].join('\n');
}

export function evaluationSystemPrompt(request: EvaluationRequest): string {
	return [
		'You are a careful English translation tutor. Return ONLY a JSON object; no Markdown, no code fence, no commentary.',
		`Prompt version: ${EVALUATION_PROMPT_VERSION}. Scores are integers from 0 to 100.`,
		`Allowed topic IDs: ${request.allowedTopics.map((topic) => topic.id).join(', ')}.`,
		`Question: ${request.question.sourceRu}`,
		`Reference answers: ${request.question.referenceAnswers.join(' | ')}`,
		`Target vocabulary canonical keys: ${request.question.targetVocabulary.join(', ')}`,
		`Student answer: ${request.userAnswer}`,
		'Explain feedback in Russian. Do not invent topic or vocabulary identifiers.',
		'Required JSON fields: meaning, grammar, naturalness, vocabulary, overallScore, isAcceptable, confidence, correctedTranslation, alternativeTranslations, errors, summaryRu. Criterion fields have score and explanationRu. grammar additionally has topicScores; vocabulary additionally has itemScores. Every error has fragment, category, severity, explanationRu and optional topicId, vocabularyKey, replacement.',
	].join('\n');
}

export function repairSystemPrompt(schemaName: 'question' | 'evaluation'): string {
	return `Repair the following ${schemaName} JSON response. Return ONLY one valid JSON object, with no code fence or extra text. Preserve the intended educational content and obey the supplied schema.`;
}

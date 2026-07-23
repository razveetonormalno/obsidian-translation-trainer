import type { EvaluationRequest, FollowUpRequest, QuestionGenerationRequest } from '../domain/types';

export const GENERATION_PROMPT_VERSION = 1;
export const EVALUATION_PROMPT_VERSION = 2;
export const FOLLOW_UP_PROMPT_VERSION = 1;

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
		'Required JSON fields: meaning, grammar, naturalness, vocabulary, overallScore, isAcceptable, confidence, correctedTranslation, alternativeTranslations, errors, summaryRu. Criterion fields have score and explanationRu. grammar additionally has topicScores; vocabulary additionally has itemScores. Every error has fragment, category, topicId, vocabularyKey, severity, explanationRu, replacement. Use null for topicId, vocabularyKey, or replacement when it does not apply.',
	].join('\n');
}

export function followUpSystemPrompt(request: FollowUpRequest): string {
	return [
		'You are continuing a conversation as a careful English translation tutor.',
		`Prompt version: ${FOLLOW_UP_PROMPT_VERSION}.`,
		'Answer in Russian unless the student explicitly asks for another language.',
		'Be concise, concrete, and educational. Discuss only the supplied exercise and language-learning questions related to it.',
		`Russian source: ${request.question.sourceRu}`,
		`Reference answers: ${request.question.referenceAnswers.join(' | ')}`,
		`Student answer: ${request.userAnswer}`,
		`Corrected translation: ${request.evaluation.correctedTranslation}`,
		`Evaluation summary: ${request.evaluation.summaryRu}`,
		`Errors: ${request.evaluation.errors.map(error => `${error.fragment}: ${error.explanationRu}${error.replacement ? ` -> ${error.replacement}` : ''}`).join(' | ') || 'none'}`,
		'Do not return JSON, Markdown code fences, or hidden reasoning. Return only the tutor response.',
	].join('\n');
}

export function repairSystemPrompt(schemaName: 'question' | 'evaluation'): string {
	return `Repair the following ${schemaName} JSON response. Return ONLY one valid JSON object, with no code fence or extra text. Preserve the intended educational content and obey the supplied schema.`;
}

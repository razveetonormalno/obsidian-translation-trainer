import type { TranslationAttempt, TranslationEvaluation, TranslationQuestion } from '../src/domain/types';

export function evaluation(overrides: Partial<TranslationEvaluation> = {}): TranslationEvaluation {
	return {
		meaning: { score: 80, explanationRu: 'ok' },
		grammar: { score: 80, explanationRu: 'ok', topicScores: [{ topicId: 'present-perfect', score: 80, status: 'correct', evidence: '', explanationRu: 'ok' }] },
		naturalness: { score: 80, explanationRu: 'ok' },
		vocabulary: { score: 80, explanationRu: 'ok', itemScores: [{ canonicalKey: 'purpose', displayTerm: 'Purpose', score: 80, status: 'correct', evidence: '', explanationRu: 'ok' }] },
		overallScore: 80, isAcceptable: true, confidence: 90, correctedTranslation: 'Correct.', alternativeTranslations: ['Correct one.', 'Correct two.'], errors: [], summaryRu: 'ok',
		...overrides,
	};
}

export function question(overrides: Partial<TranslationQuestion> = {}): TranslationQuestion {
	return {
		schemaVersion: 1, id: 'q-1', sourceRu: 'Я нашёл цель.', referenceAnswers: ['I found the purpose.', 'I discovered the purpose.'], targetVocabulary: ['purpose'], level: 'B1', topics: ['present-perfect'], difficulty: .5, generationSource: 'starter', expectedFeatures: [{ topicId: 'present-perfect', description: 'Use Present Perfect', required: true, acceptedVariants: ['have found'] }], createdAt: '2026-01-01T00:00:00.000Z', generationPromptVersion: 1,
		...overrides,
	};
}

export function attempt(id: string, timestamp: string, score = 80, topicId = 'present-perfect', word = 'purpose'): TranslationAttempt {
	const result = evaluation({
		meaning: { score, explanationRu: 'ok' },
		grammar: { score, explanationRu: 'ok', topicScores: [{ topicId, score, status: 'correct', evidence: '', explanationRu: 'ok' }] },
		naturalness: { score, explanationRu: 'ok' },
		vocabulary: { score, explanationRu: 'ok', itemScores: [{ canonicalKey: word, displayTerm: word, score, status: 'correct', evidence: '', explanationRu: 'ok' }] }, overallScore: score,
	});
	return { schemaVersion: 1, id, questionId: `q-${id}`, timestamp, userAnswer: 'answer', evaluation: result, hintUsed: false, responseTimeMs: 1000, provider: 'local', model: 'test', promptVersion: 1, llmLatencyMs: 10 };
}

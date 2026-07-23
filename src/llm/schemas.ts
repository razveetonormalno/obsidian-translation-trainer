import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import type { TranslationEvaluation, TranslationQuestion } from '../domain/types';

const ajv = new Ajv({ allErrors: true, strict: true });
const score = { type: 'integer', minimum: 0, maximum: 100 } as const;
const status = { type: 'string', enum: ['correct', 'minor-error', 'major-error', 'not-demonstrated'] } as const;
const severity = { type: 'string', enum: ['minor', 'major', 'critical'] } as const;

export function questionValidator(topicIds: readonly string[], vocabularyKeys: readonly string[]): ValidateFunction<TranslationQuestion> {
	const schema: JSONSchemaType<TranslationQuestion> = {
		type: 'object', additionalProperties: false, required: ['schemaVersion', 'id', 'sourceRu', 'referenceAnswers', 'targetVocabulary', 'level', 'topics', 'difficulty', 'generationSource', 'expectedFeatures', 'createdAt', 'generationPromptVersion'],
		properties: {
			schemaVersion: { type: 'integer', minimum: 1 }, id: { type: 'string', minLength: 1 }, sourceRu: { type: 'string', minLength: 1 },
			referenceAnswers: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
			targetVocabulary: { type: 'array', minItems: 1, items: { type: 'string', enum: [...vocabularyKeys] } },
			level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] }, topics: { type: 'array', minItems: 1, items: { type: 'string', enum: [...topicIds] } },
			difficulty: { type: 'number', minimum: 0, maximum: 1 }, generationSource: { type: 'string', enum: ['starter', 'imported', 'local-llm', 'cloud-llm'] },
			expectedFeatures: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topicId', 'description', 'required', 'acceptedVariants'], properties: { topicId: { type: 'string', enum: [...topicIds] }, description: { type: 'string', minLength: 1 }, required: { type: 'boolean' }, acceptedVariants: { type: 'array', items: { type: 'string' } } } } },
			createdAt: { type: 'string', minLength: 1 }, generationPromptVersion: { type: 'integer', minimum: 1 },
		},
	};
	return ajv.compile(schema);
}

/** Validator for an LLM-generated question before immutable metadata is assigned locally. */
export function generatedQuestionValidator(topicIds: readonly string[], vocabularyKeys: readonly string[]): ValidateFunction<Partial<TranslationQuestion>> {
	const schema = {
		type: 'object', additionalProperties: false, required: ['sourceRu', 'referenceAnswers', 'targetVocabulary', 'level', 'topics', 'difficulty', 'expectedFeatures'],
		properties: {
			sourceRu: { type: 'string', minLength: 1 },
			referenceAnswers: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } }, targetVocabulary: { type: 'array', minItems: 1, items: { type: 'string', enum: [...vocabularyKeys] } },
			level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] }, topics: { type: 'array', minItems: 1, items: { type: 'string', enum: [...topicIds] } }, difficulty: { type: 'number', minimum: 0, maximum: 1 },
			expectedFeatures: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topicId', 'description', 'required', 'acceptedVariants'], properties: { topicId: { type: 'string', enum: [...topicIds] }, description: { type: 'string', minLength: 1 }, required: { type: 'boolean' }, acceptedVariants: { type: 'array', items: { type: 'string' } } } } },
		},
	} as unknown as JSONSchemaType<Partial<TranslationQuestion>>;
	return ajv.compile(schema);
}

export function evaluationValidator(topicIds: readonly string[], vocabularyKeys: readonly string[]): ValidateFunction<TranslationEvaluation> {
	const criterion = { type: 'object', additionalProperties: false, required: ['score', 'explanationRu'], properties: { score, explanationRu: { type: 'string' } } } as const;
	const schema = {
		type: 'object', additionalProperties: false, required: ['meaning', 'grammar', 'naturalness', 'vocabulary', 'overallScore', 'isAcceptable', 'confidence', 'correctedTranslation', 'alternativeTranslations', 'errors', 'summaryRu'],
		properties: {
			meaning: criterion, naturalness: criterion,
			grammar: { type: 'object', additionalProperties: false, required: ['score', 'explanationRu', 'topicScores'], properties: { score, explanationRu: { type: 'string' }, topicScores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topicId', 'score', 'status', 'evidence', 'explanationRu'], properties: { topicId: { type: 'string', enum: [...topicIds] }, score, status, evidence: { type: 'string' }, explanationRu: { type: 'string' } } } } } },
			vocabulary: { type: 'object', additionalProperties: false, required: ['score', 'explanationRu', 'itemScores'], properties: { score, explanationRu: { type: 'string' }, itemScores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['canonicalKey', 'displayTerm', 'score', 'status', 'evidence', 'explanationRu'], properties: { canonicalKey: { type: 'string', enum: [...vocabularyKeys] }, displayTerm: { type: 'string' }, score, status, evidence: { type: 'string' }, explanationRu: { type: 'string' } } } } } },
			overallScore: score, isAcceptable: { type: 'boolean' }, confidence: score, correctedTranslation: { type: 'string' }, alternativeTranslations: { type: 'array', items: { type: 'string' } },
			errors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fragment', 'category', 'topicId', 'vocabularyKey', 'severity', 'explanationRu', 'replacement'], properties: { fragment: { type: 'string' }, category: { type: 'string', enum: ['meaning', 'grammar', 'naturalness', 'vocabulary'] }, topicId: { type: ['string', 'null'], enum: [...topicIds, null] }, vocabularyKey: { type: ['string', 'null'], enum: [...vocabularyKeys, null] }, severity, explanationRu: { type: 'string' }, replacement: { type: ['string', 'null'] } } } },
			summaryRu: { type: 'string' },
		},
	} as unknown as JSONSchemaType<TranslationEvaluation>;
	return ajv.compile(schema);
}

export function validatorDiagnostics(validator: ValidateFunction): string {
	return ajv.errorsText(validator.errors, { separator: '; ' });
}

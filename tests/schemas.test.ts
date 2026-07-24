import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluationValidator, generatedQuestionValidator, questionValidator } from '../src/llm/schemas';
import { GRAMMAR_TOPICS } from '../src/curriculum/topics';
import { STARTER_BANK_VERSION } from '../src/domain/constants';
import type { TranslationQuestion } from '../src/domain/types';
import { parseVocabularyMarkdown } from '../src/vocabulary/parser';
import { evaluation, question } from './helpers';

const topics = ['present-perfect'];
const words = ['purpose'];

describe('strict LLM schemas', () => {
	it('validates all 30 bundled questions against the current vocabulary and curriculum', () => {
		const fixture = readFileSync(new URL('./fixtures/interesting-words.md', import.meta.url), 'utf8');
		const vocabulary = parseVocabularyMarkdown(fixture, 'Study/English/Interesting Words.md');
		const validate = questionValidator(
			GRAMMAR_TOPICS.map((topic) => topic.id),
			vocabulary.map((entry) => entry.canonicalKey),
		);
		const lines = readFileSync(new URL('../assets/starter-bank.jsonl', import.meta.url), 'utf8').trim().split(/\r?\n/u);
		const questions = lines.map((line) => JSON.parse(line) as TranslationQuestion);
		expect(lines).toHaveLength(30);
		expect(new Set(questions.map((item) => item.id)).size).toBe(30);
		expect(new Set(questions.flatMap((item) => item.targetVocabulary)).size).toBeGreaterThanOrEqual(40);
		for (const item of questions) expect(validate(item), JSON.stringify(validate.errors)).toBe(true);
	});

	it('ships the corrected starter bank as version 2', () => {
		const questions = readStarterQuestions();
		const byId = new Map(questions.map((item) => [item.id, item]));
		const answers = (id: string): string => byId.get(id)?.referenceAnswers.join(' ').toLowerCase() ?? '';

		expect(STARTER_BANK_VERSION).toBe(2);
		expect(answers('starter-b1-003')).toContain('corresponding');
		expect(answers('starter-b1-006')).not.toContain('conditional term');
		expect(answers('starter-b1-012')).not.toContain('cull your jacket');
		expect(answers('starter-b1-021')).toContain('threat denial');
		expect(answers('starter-b1-025')).toContain('yearning');
		expect(answers('starter-b1-029')).not.toContain('food is filthy');
	});

	it('accepts valid immutable and generated questions', () => {
		expect(questionValidator(topics, words)(question())).toBe(true);
		const generated = { ...question() } as Record<string, unknown>;
		delete generated.id; delete generated.schemaVersion; delete generated.createdAt; delete generated.generationSource; delete generated.generationPromptVersion;
		expect(generatedQuestionValidator(topics, words)(generated)).toBe(true);
	});

	it('uses OpenAI-compatible strict schemas at every object level', () => {
		expectStrictObjectSchema(generatedQuestionValidator(topics, words).schema);
		expectStrictObjectSchema(evaluationValidator(topics, words).schema);
	});

	it('rejects unknown topics/words, out-of-range difficulty and additional properties', () => {
		const validator = questionValidator(topics, words);
		expect(validator(question({ topics: ['unknown'] }))).toBe(false);
		expect(validator(question({ targetVocabulary: ['unknown'] }))).toBe(false);
		expect(validator(question({ difficulty: 1.01 }))).toBe(false);
		expect(validator({ ...question(), unwanted: true })).toBe(false);
	});

	it('validates nested evaluation topic and vocabulary keys', () => {
		const validator = evaluationValidator(topics, words);
		expect(validator(evaluation())).toBe(true);
		expect(validator(evaluation({ grammar: { score: 80, explanationRu: '', topicScores: [{ topicId: 'unknown', score: 80, status: 'correct', evidence: '', explanationRu: '' }] } }))).toBe(false);
		expect(validator(evaluation({ vocabulary: { score: 80, explanationRu: '', itemScores: [{ canonicalKey: 'unknown', displayTerm: '', score: 80, status: 'correct', evidence: '', explanationRu: '' }] } }))).toBe(false);
		const error = { fragment: 'x', category: 'grammar' as const, topicId: null, vocabularyKey: null, severity: 'minor' as const, explanationRu: 'x', replacement: null };
		expect(validator(evaluation({ errors: [error] }))).toBe(true);
		const missingNullableField = { ...error } as Partial<typeof error>;
		delete missingNullableField.topicId;
		expect(validator(evaluation({ errors: [missingNullableField as never] }))).toBe(false);
	});
});

function readStarterQuestions(): TranslationQuestion[] {
	return readFileSync(new URL('../assets/starter-bank.jsonl', import.meta.url), 'utf8')
		.trim()
		.split(/\r?\n/u)
		.map((line) => JSON.parse(line) as TranslationQuestion);
}

function expectStrictObjectSchema(value: unknown): void {
	if (!isRecord(value)) return;
	if (value.type === 'object') {
		expect(value.additionalProperties).toBe(false);
		const properties = isRecord(value.properties) ? value.properties : {};
		expect(new Set(Array.isArray(value.required) ? value.required : [])).toEqual(new Set(Object.keys(properties)));
		for (const property of Object.values(properties)) expectStrictObjectSchema(property);
	}
	if (value.type === 'array') expectStrictObjectSchema(value.items);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

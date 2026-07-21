import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluationValidator, generatedQuestionValidator, questionValidator } from '../src/llm/schemas';
import { GRAMMAR_TOPICS } from '../src/curriculum/topics';
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
		expect(lines).toHaveLength(30);
		for (const line of lines) expect(validate(JSON.parse(line) as unknown), JSON.stringify(validate.errors)).toBe(true);
	});
	it('accepts valid immutable and generated questions', () => {
		expect(questionValidator(topics, words)(question())).toBe(true);
		const generated = { ...question() } as Record<string, unknown>;
		delete generated.id; delete generated.schemaVersion; delete generated.createdAt; delete generated.generationSource; delete generated.generationPromptVersion;
		expect(generatedQuestionValidator(topics, words)(generated)).toBe(true);
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
	});
});

import { describe, expect, it } from 'vitest';
import { temperatureForModel } from '../src/llm/model-parameters';

describe('temperatureForModel', () => {
	it.each([
		'gpt-5.4-mini',
		'gpt-5.6-luna',
		'gpt-5.6-terra',
		'chatgpt-4o-latest',
		'openai/gpt-5.4-mini',
		' OPENAI/GPT-5.6-TERRA ',
	])('uses the only supported temperature for %s', model => {
		expect(temperatureForModel(model)).toBe(1);
	});

	it.each([
		'qwen3-8b',
		'gemma-3-12b-it',
		'custom-model',
	])('keeps the lower temperature for %s', model => {
		expect(temperatureForModel(model)).toBe(0.2);
	});
});

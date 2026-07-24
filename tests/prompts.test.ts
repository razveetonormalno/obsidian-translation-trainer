import { describe, expect, it } from 'vitest';
import { followUpSystemPrompt } from '../src/prompts';
import { evaluation, question } from './helpers';

describe('follow-up prompt', () => {
	it('contains the evaluated exercise context without embedding chat history', () => {
		const prompt = followUpSystemPrompt({
			question: question({ sourceRu: 'Исходная фраза' }),
			userAnswer: 'Student wording',
			evaluation: evaluation({ correctedTranslation: 'Corrected wording', summaryRu: 'Краткое объяснение' }),
			history: [{ role: 'user', content: 'Earlier private follow-up' }],
			userQuestion: 'Why?',
		});

		expect(prompt).toContain('Исходная фраза');
		expect(prompt).toContain('Student wording');
		expect(prompt).toContain('Corrected wording');
		expect(prompt).toContain('Markdown');
		expect(prompt).not.toContain('Earlier private follow-up');
	});
});

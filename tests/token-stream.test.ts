import { describe, expect, it } from 'vitest';
import { TokenStreamModel } from '../src/ui/token-stream';

describe('token stream model', () => {
	it('grows like a token stream and revises earlier words', () => {
		const model = new TokenStreamModel();
		for (let index = 0; index < 4; index += 1) model.advance();
		const before = model.advance();
		const after = model.advance();

		expect(after).toHaveLength(before.length + 1);
		expect(after.at(-1)?.isNew).toBe(true);
		expect(after.some(token => token.isRevised && token.id !== after.at(-1)?.id)).toBe(true);
	});

	it('keeps a bounded paragraph during long requests', () => {
		const model = new TokenStreamModel();
		let frame = model.advance();
		for (let index = 0; index < 100; index += 1) frame = model.advance();
		expect(frame).toHaveLength(36);
	});

	it('uses language-like tokens without Russian words', () => {
		const model = new TokenStreamModel();
		let frame = model.advance();
		for (let index = 0; index < 24; index += 1) frame = model.advance();
		const text = frame.map(token => token.text).join(' ');
		expect(text).not.toMatch(/[А-Яа-яЁё]/u);
		expect(text).toMatch(/[æœøšžčëöüû]/iu);
		expect(text).toMatch(/[,.]/u);
	});
});

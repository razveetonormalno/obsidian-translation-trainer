import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

describe('plugin styles', () => {
	it('allows users to select and copy all rendered plugin text', () => {
		const css = readFileSync(resolve(cwd(), 'styles.css'), 'utf8');
		expect(css).toContain('.translation-trainer-modal, .translation-trainer-modal *, .translation-trainer-loading, .translation-trainer-loading *, .translation-trainer-statistics, .translation-trainer-statistics *, .translation-trainer-diagnostics, .translation-trainer-diagnostics * { -webkit-user-select: text; user-select: text; }');
	});
});

import type { QuestionBankService } from './bank';
import { normalizedQuestionKey } from './dedupe';
import type { ImportResult, QuestionValidator } from './types';

export class QuestionImportService {
	constructor(private readonly bank: QuestionBankService, private readonly validate: QuestionValidator) {}

	async importJsonl(serializedJsonl: string): Promise<ImportResult> {
		const existing = await this.bank.load();
		const seen = new Set(existing.questions.map(normalizedQuestionKey));
		const diagnostics: ImportResult['diagnostics'] = [];
		let accepted = 0;
		const lines = serializedJsonl.replace(/^\uFEFF/u, '').split(/\r?\n/u);
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index]?.trim() ?? '';
			if (!line) continue;
			let value: unknown;
			try { value = JSON.parse(line); } catch { diagnostics.push({ line: index + 1, reason: 'Некорректный JSON.' }); continue; }
			if (!this.validate(value)) { diagnostics.push({ line: index + 1, reason: 'Строка не соответствует схеме вопроса.' }); continue; }
			const question = value;
			const key = normalizedQuestionKey(question);
			if (seen.has(key)) { diagnostics.push({ line: index + 1, reason: 'Дубликат вопроса.' }); continue; }
			await this.bank.append('imported', question);
			seen.add(key);
			accepted += 1;
		}
		return { accepted, skipped: diagnostics.length, diagnostics };
	}
}

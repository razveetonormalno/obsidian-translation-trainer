import { Notice } from 'obsidian';
import type { VocabularyAddition, VocabularyAdditionResult } from '../domain/types';
import { enhanceButtonMotion } from './button-motion';
import type { ErrorReporter } from './error-reporter';

type AddVocabulary = (additions: readonly VocabularyAddition[]) => Promise<VocabularyAdditionResult>;

export class VocabularyEntryEditor {
	private rows: VocabularyAddition[] = [emptyRow()];
	private saving = false;
	private status?: string;
	private diagnostic?: string;

	constructor(
		private readonly addVocabulary: AddVocabulary,
		private readonly reporter: ErrorReporter,
	) {}

	render(parent: HTMLElement): void {
		const panel = parent.createDiv({ cls: 'translation-trainer-vocabulary-editor' });
		this.renderPanel(panel);
	}

	private renderPanel(panel: HTMLElement): void {
		panel.empty();
		panel.createEl('h3', { text: 'Добавить слова в заметку', cls: 'translation-trainer-card-title' });
		const rows = panel.createDiv({ cls: 'translation-trainer-vocabulary-entry-rows' });
		this.rows.forEach((row, index) => this.renderRow(rows, row, index));

		const controls = panel.createDiv({ cls: 'translation-trainer-vocabulary-entry-controls' });
		const addRow = enhanceButtonMotion(controls.createEl('button', { text: 'Добавить строку' }));
		addRow.disabled = this.saving;
		addRow.addEventListener('click', () => {
			this.rows.push(emptyRow());
			this.status = undefined;
			this.renderPanel(panel);
			panel.querySelectorAll<HTMLInputElement>('.translation-trainer-vocabulary-entry-row input')
				.item(this.rows.length * 2 - 2)
				.focus();
		});

		const save = enhanceButtonMotion(controls.createEl('button', {
			text: this.saving ? 'Добавляем…' : 'Добавить в заметку',
			cls: 'mod-cta',
		}));
		const updateSaveState = (): void => {
			save.disabled = this.saving || !hasCompleteRows(this.rows) || hasPartialRows(this.rows);
		};
		updateSaveState();
		panel.querySelectorAll<HTMLInputElement>('.translation-trainer-vocabulary-entry-row input')
			.forEach((input) => input.addEventListener('input', updateSaveState));
		save.addEventListener('click', () => void this.save(panel));

		if (this.status) panel.createEl('p', { text: this.status, cls: 'translation-trainer-vocabulary-entry-status' });
		if (this.diagnostic) {
			const details = panel.createEl('details', { cls: 'translation-trainer-diagnostics' });
			details.createEl('summary', { text: 'Технические детали' });
			details.createEl('pre', { text: this.diagnostic });
		}
	}

	private renderRow(parent: HTMLElement, row: VocabularyAddition, index: number): void {
		const rowEl = parent.createDiv({ cls: 'translation-trainer-vocabulary-entry-row' });
		const english = rowEl.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'Слово на английском',
				'aria-label': `Английское слово ${index + 1}`,
			},
		});
		english.value = row.displayTerm;
		english.disabled = this.saving;
		english.addEventListener('input', () => {
			row.displayTerm = english.value;
			this.status = undefined;
		});

		const russian = rowEl.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'Перевод на русский',
				'aria-label': `Русский перевод ${index + 1}`,
			},
		});
		russian.value = row.translation;
		russian.disabled = this.saving;
		russian.addEventListener('input', () => {
			row.translation = russian.value;
			this.status = undefined;
		});
	}

	private async save(panel: HTMLElement): Promise<void> {
		if (this.saving) return;
		const additions = this.rows.filter((row) => row.displayTerm.trim() || row.translation.trim());
		if (!additions.length) {
			new Notice('Введите хотя бы одно слово и перевод.');
			return;
		}
		if (hasPartialRows(additions)) {
			new Notice('Для каждой строки заполните слово и перевод.');
			return;
		}

		this.saving = true;
		this.status = undefined;
		this.diagnostic = undefined;
		this.renderPanel(panel);
		try {
			const result = await this.addVocabulary(additions);
			this.rows = [emptyRow()];
			this.status = resultMessage(result);
			new Notice(this.status);
		} catch (error) {
			this.reporter.report(error, 'Не удалось добавить слова в заметку.');
			this.diagnostic = this.reporter.diagnostics(error);
		} finally {
			this.saving = false;
			if (panel.isConnected) this.renderPanel(panel);
		}
	}
}

function emptyRow(): VocabularyAddition {
	return { displayTerm: '', translation: '' };
}

function hasCompleteRows(rows: readonly VocabularyAddition[]): boolean {
	return rows.some((row) => Boolean(row.displayTerm.trim() && row.translation.trim()));
}

function hasPartialRows(rows: readonly VocabularyAddition[]): boolean {
	return rows.some((row) => Boolean(row.displayTerm.trim()) !== Boolean(row.translation.trim()));
}

function resultMessage(result: VocabularyAdditionResult): string {
	const added = result.added.length ? `Добавлено слов: ${result.added.length}.` : 'Новых слов не добавлено.';
	if (!result.skippedDuplicates.length) return added;
	return `${added} Уже были в заметке: ${result.skippedDuplicates.join(', ')}.`;
}

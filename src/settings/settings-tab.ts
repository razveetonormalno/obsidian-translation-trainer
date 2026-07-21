import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { CefrLevel } from '../domain/types';
import type { SchedulerMode, TranslationTrainerSettings } from './model';
import { ErrorReporter } from '../ui/error-reporter';

export interface SettingsTabActions {
	settings(): TranslationTrainerSettings;
	update(patch: Partial<TranslationTrainerSettings>): Promise<void>;
	setApiKey(value: string): Promise<void>;
	hasApiKey(): Promise<boolean>;
	testConnection(): Promise<{ model: string; latencyMs: number }>;
	importQuestionBank(): Promise<void>;
	reindexVocabulary(): Promise<{ count: number }>;
	getVocabularyDiagnostics(): Promise<readonly { displayTerm: string; translation: string }[]>;
	startExercise(): Promise<void>;
	openStatistics(): Promise<void>;
	togglePause(): Promise<void>;
}

export class TranslationTrainerSettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly actions: SettingsTabActions, private readonly reporter: ErrorReporter) { super(app, plugin); }

	display(): void {
		const { containerEl } = this; containerEl.empty();
		const settings = this.actions.settings();
		new Setting(containerEl).setName('Настройки').setHeading();
		new Setting(containerEl).setName('Расписание').setHeading();
		this.text('Интервал проверки', 'Как часто автоматически предлагать перевод.', settings.cadenceMinutes, async value => this.updateNumber('cadenceMinutes', value));
		this.text('Минимальный интервал', 'Минимальное время между автоматическими окнами, в минутах.', settings.minimumIntervalMinutes, async value => this.updateNumber('minimumIntervalMinutes', value));
		this.text('Начало тихих часов', 'Например, 23:00.', settings.quietHoursStart, async value => this.updateText('quietHoursStart', value));
		this.text('Конец тихих часов', 'Например, 09:00.', settings.quietHoursEnd, async value => this.updateText('quietHoursEnd', value));
		this.text('Дневной лимит', 'Максимум автоматических заданий в день.', settings.dailyAutomaticLimit, async value => this.updateNumber('dailyAutomaticLimit', value));
		new Setting(containerEl).setName('Режим показа').setDesc('Active показывает задания только при активном Obsidian.').addDropdown(dropdown => dropdown.addOption('active', 'Только активный').addOption('background', 'В фоне').setValue(settings.schedulerMode).onChange(value => this.run(() => this.actions.update({ schedulerMode: value as SchedulerMode }))));

		new Setting(containerEl).setName('Словарь и уровень').setHeading();
		this.text('Файл со словами', 'Путь внутри vault.', settings.vocabularyPath, value => this.updateText('vocabularyPath', value));
		this.text('Раздел заметки', 'Оставьте пустым, чтобы читать всю заметку.', settings.vocabularySection, value => this.updateText('vocabularySection', value));
		new Setting(containerEl).setName('Уровень английского').setDesc('Шкала уровней владения языком.').addDropdown(dropdown => { for (const level of ['A1', 'A2', 'B1', 'B2', 'C1'] as const) dropdown.addOption(level, level); dropdown.setValue(settings.cefrLevel).onChange(value => this.run(() => this.actions.update({ cefrLevel: value as CefrLevel }))); });

		new Setting(containerEl).setName('Языковая модель').setHeading();
		this.text('Endpoint', 'OpenAI-compatible URL, например http://127.0.0.1:8080/v1.', settings.endpoint, value => this.updateText('endpoint', value));
		this.text('Модель', 'Имя модели на выбранном endpoint.', settings.model, value => this.updateText('model', value));
		this.text('Timeout', 'Время ожидания ответа в миллисекундах.', settings.timeoutMs, async value => this.updateNumber('timeoutMs', value));
		new Setting(containerEl).setName('API secret').setDesc('Хранится только в защищённом хранилище Obsidian.').addText(text => { text.inputEl.type = 'password'; text.setPlaceholder('Оставьте пустым, чтобы не менять'); text.onChange(value => { if (value) void this.run(async () => { await this.actions.setApiKey(value); text.setValue(''); }); }); });
		void this.actions.hasApiKey().then(has => containerEl.createEl('p', { text: has ? 'API secret задан.' : 'API secret не задан.', cls: 'setting-item-description' })).catch(() => undefined);

		new Setting(containerEl).setName('Действия').setHeading();
		this.button('Проверить подключение', 'Проверить endpoint и модель.', async () => { const result = await this.actions.testConnection(); new Notice(`Подключение работает: ${result.model}, ${result.latencyMs} мс.`); });
		this.button('Импортировать открытый JSONL', 'Откройте JSONL-файл в Obsidian и импортируйте валидные вопросы без дубликатов.', () => this.actions.importQuestionBank());
		this.button('Переиндексировать слова', 'Повторно прочитать заметку со словами.', async () => { const result = await this.actions.reindexVocabulary(); new Notice(`Найдено слов: ${result.count}.`); });
		this.button('Показать слова', 'Диагностика распознанных записей.', async () => { const items = await this.actions.getVocabularyDiagnostics(); const list = containerEl.querySelector('.translation-trainer-diagnostics') ?? containerEl.createDiv({ cls: 'translation-trainer-diagnostics' }); list.empty(); list.createEl('p', { text: `Распознано: ${items.length}` }); const ul = list.createEl('ul'); for (const item of items.slice(0, 100)) ul.createEl('li', { text: `${item.displayTerm} — ${item.translation}` }); });
		this.button('Начать упражнение', 'Открыть следующее задание прямо сейчас.', () => this.actions.startExercise());
		this.button('Открыть статистику', 'Показать графики и рейтинги.', () => this.actions.openStatistics());
		this.button(settings.paused ? 'Возобновить расписание' : 'Приостановить расписание', 'Временная остановка автоматических заданий.', () => this.actions.togglePause());
	}

	private text(name: string, description: string, value: string | number, update: (value: string) => Promise<void>): void {
		new Setting(this.containerEl).setName(name).setDesc(description).addText(text => text.setValue(String(value)).onChange(next => this.run(() => update(next))));
	}
	private button(name: string, description: string, action: () => Promise<void>): void { new Setting(this.containerEl).setName(name).setDesc(description).addButton(button => button.setButtonText(name).onClick(() => this.run(action))); }
	private async updateText(key: 'vocabularyPath' | 'vocabularySection' | 'quietHoursStart' | 'quietHoursEnd' | 'endpoint' | 'model', value: string): Promise<void> { await this.actions.update({ [key]: value }); }
	private async updateNumber(key: 'cadenceMinutes' | 'minimumIntervalMinutes' | 'dailyAutomaticLimit' | 'timeoutMs', value: string): Promise<void> { const number = Number(value); if (!Number.isInteger(number) || number <= 0) { new Notice('Введите положительное целое число.'); return; } await this.actions.update({ [key]: number }); }
	private async run(action: () => Promise<void>): Promise<void> { try { await action(); } catch (error) { this.reporter.report(error); } }
}

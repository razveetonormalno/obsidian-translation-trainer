import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { CefrLevel } from '../domain/types';
import { MAX_EXERCISE_MODAL_WIDTH, MIN_EXERCISE_MODAL_WIDTH, type SchedulerMode, type TranslationTrainerSettings } from './model';
import { ErrorReporter } from '../ui/error-reporter';

export interface SettingsTabActions {
	settings(): TranslationTrainerSettings;
	update(patch: Partial<TranslationTrainerSettings>): Promise<void>;
	setApiKey(value: string): Promise<void>;
	hasApiKey(): Promise<boolean>;
	testConnection(): Promise<{ model: string; latencyMs: number }>;
	readDiagnosticLog(): Promise<string>;
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

		new Setting(containerEl).setName('Интерфейс').setHeading();
		new Setting(containerEl)
			.setName('Ширина окна упражнения')
			.setDesc('Ширина окна в пикселях. На небольшом экране она автоматически уменьшается.')
			.addSlider(slider => slider
				.setLimits(MIN_EXERCISE_MODAL_WIDTH, MAX_EXERCISE_MODAL_WIDTH, 20)
				.setValue(settings.exerciseModalWidth)
				.setDynamicTooltip()
				.onChange(value => this.run(() => this.actions.update({ exerciseModalWidth: value }))));

		new Setting(containerEl).setName('Словарь и уровень').setHeading();
		this.text('Файл со словами', 'Путь внутри vault.', settings.vocabularyPath, value => this.updateText('vocabularyPath', value));
		this.text('Раздел заметки', 'Оставьте пустым, чтобы читать всю заметку.', settings.vocabularySection, value => this.updateText('vocabularySection', value));
		new Setting(containerEl).setName('Уровень английского').setDesc('Шкала уровней владения языком.').addDropdown(dropdown => { for (const level of ['A1', 'A2', 'B1', 'B2', 'C1'] as const) dropdown.addOption(level, level); dropdown.setValue(settings.cefrLevel).onChange(value => this.run(() => this.actions.update({ cefrLevel: value as CefrLevel }))); });

		new Setting(containerEl).setName('Языковая модель').setDesc('Эти параметры сохраняются отдельно на текущем устройстве и не синхронизируются с vault.').setHeading();
		this.text('Endpoint', 'OpenAI-compatible URL, например http://127.0.0.1:8080/v1.', settings.endpoint, value => this.updateText('endpoint', value));
		this.text('Модель', 'Имя модели на выбранном endpoint.', settings.model, value => this.updateText('model', value));
		this.text('Timeout', 'Время ожидания ответа в миллисекундах.', settings.timeoutMs, async value => this.updateNumber('timeoutMs', value));
		let readApiKey = (): string => '';
		let clearApiKey = (): void => undefined;
		new Setting(containerEl)
			.setName('API secret')
			.setDesc('Хранится в защищённом хранилище текущего устройства и не записывается в vault.')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Вставьте новый API key');
				readApiKey = () => text.getValue();
				clearApiKey = () => { text.setValue(''); };
			})
			.addButton(button => button
				.setButtonText('Сохранить ключ')
				.setCta()
				.onClick(() => this.run(async () => {
					const apiKey = readApiKey().trim();
					if (!apiKey) {
						new Notice('Вставьте API key перед сохранением.');
						return;
					}
					button.setDisabled(true);
					try {
						await this.actions.setApiKey(apiKey);
						clearApiKey();
						secretStatus.setText('API secret задан.');
						new Notice('API key сохранён.');
					} finally {
						button.setDisabled(false);
					}
				})));
		const secretStatus = containerEl.createEl('p', { text: 'Проверяем API secret…', cls: 'setting-item-description' });
		void this.actions.hasApiKey().then(has => secretStatus.setText(has ? 'API secret задан.' : 'API secret не задан.')).catch(() => secretStatus.setText('Не удалось проверить API secret.'));

		new Setting(containerEl).setName('Действия').setHeading();
		new Setting(containerEl)
			.setName('Проверить подключение')
			.setDesc('Проверить endpoint и модель.')
			.addButton(button => button.setButtonText('Проверить подключение').onClick(async () => {
				button.setDisabled(true);
				try {
					const result = await this.actions.testConnection();
					connectionDetails.addClass('is-hidden');
					connectionDetailsText.setText('');
					new Notice(`Подключение работает: ${result.model}, ${result.latencyMs} мс.`);
				} catch (error) {
					this.reporter.report(error, 'Не удалось проверить подключение.');
					connectionDetailsText.setText(this.reporter.diagnostics(error));
					connectionDetails.removeClass('is-hidden');
					connectionDetails.open = true;
				} finally {
					button.setDisabled(false);
				}
			}));
		const connectionDetails = containerEl.createEl('details', { cls: 'translation-trainer-diagnostics' });
		connectionDetails.addClass('is-hidden');
		connectionDetails.createEl('summary', { text: 'Технические детали подключения' });
		const connectionDetailsText = connectionDetails.createEl('pre');
		this.button('Импортировать открытый JSONL', 'Откройте JSONL-файл в Obsidian и импортируйте валидные вопросы без дубликатов.', () => this.actions.importQuestionBank());
		this.button('Переиндексировать слова', 'Повторно прочитать заметку со словами.', async () => { const result = await this.actions.reindexVocabulary(); new Notice(`Найдено слов: ${result.count}.`); });
		this.button('Показать слова', 'Диагностика распознанных записей.', async () => { const items = await this.actions.getVocabularyDiagnostics(); const list = containerEl.querySelector('.translation-trainer-diagnostics') ?? containerEl.createDiv({ cls: 'translation-trainer-diagnostics' }); list.empty(); list.createEl('p', { text: `Распознано: ${items.length}` }); const ul = list.createEl('ul'); for (const item of items.slice(0, 100)) ul.createEl('li', { text: `${item.displayTerm} — ${item.translation}` }); });
		this.button('Начать упражнение', 'Открыть следующее задание прямо сейчас.', () => this.actions.startExercise());
		this.button('Открыть статистику', 'Показать графики и рейтинги.', () => this.actions.openStatistics());
		this.button(settings.paused ? 'Возобновить расписание' : 'Приостановить расписание', 'Временная остановка автоматических заданий.', () => this.actions.togglePause());

		new Setting(containerEl)
			.setName('Журнал ошибок')
			.setDesc('Локальный журнал хранится 24 часа без ключей API и полных запросов.')
			.addButton(button => button.setButtonText('Показать журнал').onClick(async () => {
				button.setDisabled(true);
				try {
					const text = await this.actions.readDiagnosticLog();
					logText.setText(text || 'Журнал пуст.');
					logDetails.removeClass('is-hidden');
					logDetails.open = true;
				} catch (error) {
					this.reporter.report(error, 'Не удалось прочитать журнал ошибок.');
				} finally {
					button.setDisabled(false);
				}
			}));
		const logDetails = containerEl.createEl('details', { cls: 'translation-trainer-diagnostics' });
		logDetails.addClass('is-hidden');
		logDetails.createEl('summary', { text: 'Журнал ошибок за 24 часа' });
		const logText = logDetails.createEl('pre');
	}

	private text(name: string, description: string, value: string | number, update: (value: string) => Promise<void>): void {
		new Setting(this.containerEl).setName(name).setDesc(description).addText(text => text.setValue(String(value)).onChange(next => this.run(() => update(next))));
	}
	private button(name: string, description: string, action: () => Promise<void>): void { new Setting(this.containerEl).setName(name).setDesc(description).addButton(button => button.setButtonText(name).onClick(() => this.run(action))); }
	private async updateText(key: 'vocabularyPath' | 'vocabularySection' | 'quietHoursStart' | 'quietHoursEnd' | 'endpoint' | 'model', value: string): Promise<void> { await this.actions.update({ [key]: value }); }
	private async updateNumber(key: 'cadenceMinutes' | 'minimumIntervalMinutes' | 'dailyAutomaticLimit' | 'timeoutMs', value: string): Promise<void> { const number = Number(value); if (!Number.isInteger(number) || number <= 0) { new Notice('Введите положительное целое число.'); return; } await this.actions.update({ [key]: number }); }
	private async run(action: () => Promise<void>): Promise<void> { try { await action(); } catch (error) { this.reporter.report(error); } }
}

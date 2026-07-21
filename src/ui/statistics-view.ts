import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { AttemptDrilldown, StatisticsPeriod, StatisticsSnapshot } from '../statistics/types';

export const STATISTICS_VIEW_TYPE = 'translation-trainer-statistics';

export interface StatisticsViewActions {
	load(period: StatisticsPeriod): Promise<StatisticsSnapshot>;
	drilldownWord(id: string): AttemptDrilldown[];
	drilldownTopic(id: string): AttemptDrilldown[];
}

export class StatisticsView extends ItemView {
	private period: StatisticsPeriod = 30;
	private snapshot?: StatisticsSnapshot;
	constructor(leaf: WorkspaceLeaf, private readonly actions: StatisticsViewActions) { super(leaf); }
	getViewType(): string { return STATISTICS_VIEW_TYPE; }
	getDisplayText(): string { return 'Статистика переводов'; }
	async onOpen(): Promise<void> { await this.refresh(); }
	async refresh(): Promise<void> { this.snapshot = await this.actions.load(this.period); this.render(); }

	private render(): void {
		const root = this.contentEl; root.empty(); root.addClass('translation-trainer-statistics');
		root.createEl('h2', { text: 'Статистика переводов' });
		const filters = root.createDiv({ cls: 'translation-trainer-filters', attr: { 'aria-label': 'Период статистики' } });
		for (const item of [[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], ['all', 'Всё']] as const) {
			const button = filters.createEl('button', { text: item[1] }); button.toggleClass('is-active', item[0] === this.period);
			button.addEventListener('click', () => { this.period = item[0]; void this.refresh(); });
		}
		const snapshot = this.snapshot;
		if (!snapshot || snapshot.empty) { root.createEl('p', { text: 'За выбранный период ещё нет проверенных переводов.', cls: 'translation-trainer-empty' }); return; }
		root.createEl('p', { text: `Попыток: ${snapshot.attemptCount}` });
		root.createEl('h3', { text: 'Динамика оценок' }); this.renderLineChart(root, snapshot);
		root.createEl('h3', { text: 'Распределение по темам' }); this.renderTopics(root, snapshot);
		this.renderRanking(root, 'Самые лёгкие слова', snapshot.easiestWords, 'word');
		this.renderRanking(root, 'Самые сложные слова', snapshot.hardestWords, 'word');
		this.renderRanking(root, 'Самые лёгкие темы', snapshot.easiestTopics, 'topic');
		this.renderRanking(root, 'Самые сложные темы', snapshot.hardestTopics, 'topic');
	}

	private renderLineChart(root: HTMLElement, snapshot: StatisticsSnapshot): void {
		if (!snapshot.dailyScores.length) { root.createEl('p', { text: 'Недостаточно данных для графика.' }); return; }
		const width = 700, height = 220, pad = 30;
		const svg = root.createSvg('svg', { attr: { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Линейный график оценок' }, cls: 'translation-trainer-chart' });
		const keys = [['overall', '#6c8eef', 'Общий'], ['meaning', '#5aa469', 'Смысл'], ['grammar', '#d99a32', 'Грамматика'], ['naturalness', '#b46ab4', 'Естественность'], ['vocabulary', '#d85b6a', 'Словарь']] as const;
		for (const y of [0, 50, 100]) svg.createSvg('line', { attr: { x1: String(pad), y1: String(height - pad - y * 1.6), x2: String(width - pad), y2: String(height - pad - y * 1.6), stroke: 'var(--background-modifier-border)', 'stroke-width': '1' } });
		for (const [key, color, label] of keys) {
			const points = snapshot.dailyScores.map((point, index) => `${pad + index * ((width - 2 * pad) / Math.max(1, snapshot.dailyScores.length - 1))},${height - pad - point[key] * 1.6}`).join(' ');
			svg.createSvg('polyline', { attr: { points, fill: 'none', stroke: color, 'stroke-width': '2.5' } });
			root.createSpan({ text: label, cls: 'translation-trainer-legend', attr: { style: `--series-color:${color}` } });
		}
		this.accessibleScoreTable(root, snapshot);
	}

	private accessibleScoreTable(root: HTMLElement, snapshot: StatisticsSnapshot): void {
		const table = root.createEl('table', { cls: 'translation-trainer-accessible-table' });
		const head = table.createEl('thead').createEl('tr'); for (const text of ['Дата', 'Общий', 'Смысл', 'Грамматика', 'Естественность', 'Словарь']) head.createEl('th', { text });
		const body = table.createEl('tbody'); for (const point of snapshot.dailyScores) { const row = body.createEl('tr'); for (const value of [point.date, point.overall, point.meaning, point.grammar, point.naturalness, point.vocabulary]) row.createEl('td', { text: String(value) }); }
	}

	private renderTopics(root: HTMLElement, snapshot: StatisticsSnapshot): void {
		if (!snapshot.topicDistribution.length) { root.createEl('p', { text: 'Темы ещё не оценивались.' }); return; }
		const max = Math.max(...snapshot.topicDistribution.map((item) => item.attempts), 1);
		const list = root.createDiv({ cls: 'translation-trainer-topic-bars' });
		for (const item of snapshot.topicDistribution) {
			const button = list.createEl('button', { cls: 'translation-trainer-topic-bar', attr: { 'aria-label': `${item.label}: ${item.attempts} попыток, средний score ${item.averageScore}` } });
			button.createSpan({ text: item.label }); const bar = button.createSpan({ cls: 'translation-trainer-topic-fill' });
			bar.setAttr('style', `width:${item.attempts / max * 100}%;background:${scoreColor(item.averageScore)}`); button.createSpan({ text: `${item.attempts} · ${Math.round(item.averageScore)}` });
			button.addEventListener('click', () => this.showDrilldown(item.label, this.actions.drilldownTopic(item.id)));
		}
	}

	private renderRanking(root: HTMLElement, title: string, items: StatisticsSnapshot['easiestWords'], kind: 'word' | 'topic'): void {
		root.createEl('h3', { text: title });
		if (!items.length) { root.createEl('p', { text: 'Нужно минимум три попытки для рейтинга.' }); return; }
		const table = root.createEl('table', { cls: 'translation-trainer-ranking' });
		const header = table.createEl('thead').createEl('tr'); for (const value of ['Элемент', 'Средний score', 'Попытки']) header.createEl('th', { text: value });
		const body = table.createEl('tbody'); for (const item of items.slice(0, 10)) { const row = body.createEl('tr'); const button = row.createEl('td').createEl('button', { text: item.label }); button.addEventListener('click', () => this.showDrilldown(item.label, kind === 'word' ? this.actions.drilldownWord(item.id) : this.actions.drilldownTopic(item.id))); row.createEl('td', { text: String(Math.round(item.averageScore)) }); row.createEl('td', { text: String(item.attemptCount) }); }
	}

	private showDrilldown(title: string, items: AttemptDrilldown[]): void {
		const root = this.contentEl.querySelector('.translation-trainer-drilldown') ?? this.contentEl.createDiv({ cls: 'translation-trainer-drilldown' }); root.empty(); root.createEl('h3', { text: `Попытки: ${title}` });
		if (!items.length) { root.createEl('p', { text: 'Связанных попыток нет.' }); return; }
		const list = root.createEl('ul'); for (const item of items.slice(-30).reverse()) list.createEl('li', { text: `${item.attempt.timestamp.slice(0, 10)} — ${item.attempt.evaluation.overallScore}/100: ${item.question?.sourceRu ?? item.attempt.questionId}` });
	}
}

function scoreColor(score: number): string { return score >= 80 ? 'var(--color-green)' : score >= 65 ? 'var(--color-yellow)' : 'var(--color-red)'; }

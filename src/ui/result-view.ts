import type { CriterionEvaluation, TranslationError, TranslationEvaluation } from '../domain/types';

const CRITERIA: ReadonlyArray<readonly [string, keyof Pick<TranslationEvaluation, 'meaning' | 'grammar' | 'naturalness' | 'vocabulary'>]> = [
	['Смысл', 'meaning'],
	['Грамматика', 'grammar'],
	['Естественность', 'naturalness'],
	['Словарь', 'vocabulary'],
];

const CATEGORY_LABELS: Record<TranslationError['category'], string> = {
	meaning: 'Смысл',
	grammar: 'Грамматика',
	naturalness: 'Естественность',
	vocabulary: 'Словарь',
};

const SEVERITY_LABELS: Record<TranslationError['severity'], string> = {
	minor: 'Небольшая',
	major: 'Важная',
	critical: 'Критическая',
};

export function renderTranslationResult(parent: HTMLElement, result: TranslationEvaluation, userAnswer: string): void {
	const header = parent.createDiv({ cls: 'translation-trainer-result-header' });
	const score = header.createDiv({ cls: `translation-trainer-overall-score ${scoreTone(result.overallScore)}` });
	score.createSpan({ text: String(result.overallScore), cls: 'translation-trainer-overall-value' });
	score.createSpan({ text: '/100', cls: 'translation-trainer-overall-total' });
	const heading = header.createDiv();
	heading.createEl('h3', { text: result.isAcceptable ? 'Перевод принят' : 'Есть что улучшить' });
	heading.createEl('p', { text: overallCaption(result.overallScore), cls: 'translation-trainer-result-caption' });

	const scores = parent.createDiv({ cls: 'translation-trainer-score-grid', attr: { 'aria-label': 'Оценки по критериям' } });
	for (const [label, key] of CRITERIA) renderCriterion(scores, label, result[key]);

	const explanation = createCard(parent, 'Объяснение', 'translation-trainer-explanation-card');
	explanation.createEl('p', { text: result.summaryRu, cls: 'translation-trainer-card-lead' });
	const details = explanation.createDiv({ cls: 'translation-trainer-criterion-notes' });
	for (const [label, key] of CRITERIA) {
		const text = result[key].explanationRu.trim();
		if (!text) continue;
		const note = details.createDiv({ cls: 'translation-trainer-criterion-note' });
		note.createEl('strong', { text: label });
		note.createSpan({ text });
	}

	const answers = parent.createDiv({ cls: 'translation-trainer-answer-grid' });
	const original = createCard(answers, 'Ваш вариант', 'translation-trainer-user-answer-card');
	original.createEl('p', { text: userAnswer, cls: 'translation-trainer-answer-text' });
	const corrected = createCard(answers, 'Исправленный вариант', 'translation-trainer-corrected-card');
	corrected.createEl('p', { text: result.correctedTranslation, cls: 'translation-trainer-answer-text' });

	if (result.alternativeTranslations.length > 0) {
		const alternatives = createCard(parent, 'Другие хорошие варианты', 'translation-trainer-alternatives-card');
		const list = alternatives.createEl('ul', { cls: 'translation-trainer-alternatives' });
		for (const alternative of result.alternativeTranslations) list.createEl('li', { text: alternative });
	}

	const fixes = createCard(parent, 'Что исправить', 'translation-trainer-fixes-card');
	if (result.errors.length === 0) {
		fixes.createEl('p', { text: 'Существенных ошибок нет — можно двигаться дальше.', cls: 'translation-trainer-success-note' });
		return;
	}
	const list = fixes.createDiv({ cls: 'translation-trainer-error-list' });
	for (const error of result.errors) renderError(list, error);
}

function renderCriterion(parent: HTMLElement, label: string, criterion: CriterionEvaluation): void {
	const item = parent.createDiv({ cls: 'translation-trainer-score-card' });
	const top = item.createDiv({ cls: 'translation-trainer-score-topline' });
	top.createSpan({ text: label });
	top.createEl('strong', { text: String(criterion.score) });
	const track = item.createDiv({ cls: 'translation-trainer-score-track' });
	const fill = track.createDiv({ cls: `translation-trainer-score-fill ${scoreTone(criterion.score)}` });
	fill.style.setProperty('--translation-trainer-score', `${Math.max(0, Math.min(100, criterion.score))}%`);
}

function renderError(parent: HTMLElement, error: TranslationError): void {
	const item = parent.createDiv({ cls: `translation-trainer-error-item is-${error.severity}` });
	const heading = item.createDiv({ cls: 'translation-trainer-error-heading' });
	heading.createSpan({ text: CATEGORY_LABELS[error.category], cls: 'translation-trainer-error-category' });
	heading.createSpan({ text: SEVERITY_LABELS[error.severity], cls: 'translation-trainer-error-severity' });
	item.createEl('p', { text: error.fragment, cls: 'translation-trainer-error-fragment' });
	item.createEl('p', { text: error.explanationRu, cls: 'translation-trainer-error-explanation' });
	if (error.replacement) {
		const replacement = item.createDiv({ cls: 'translation-trainer-replacement' });
		replacement.createSpan({ text: 'Лучше: ' });
		replacement.createEl('strong', { text: error.replacement });
	}
}

function createCard(parent: HTMLElement, title: string, extraClass: string): HTMLDivElement {
	const card = parent.createDiv({ cls: `translation-trainer-result-card ${extraClass}` });
	card.createEl('h4', { text: title, cls: 'translation-trainer-card-title' });
	return card;
}

function scoreTone(score: number): string {
	if (score >= 80) return 'is-good';
	if (score >= 65) return 'is-medium';
	return 'is-low';
}

function overallCaption(score: number): string {
	if (score >= 80) return 'Хорошая работа — смысл и форма переданы уверенно.';
	if (score >= 65) return 'Основа верная, но несколько деталей стоит поправить.';
	return 'Разберите замечания ниже и попробуйте этот материал позже.';
}

import { GENERATE_QUESTION_PROMPT_VERSION, QUESTION_SCHEMA_VERSION } from '../domain/constants';
import type { GrammarTopic, TranslationQuestion, VocabularyEntry } from '../domain/types';
import { curriculumPriority } from '../curriculum/priority';
import { canonicalVocabularyKey } from '../vocabulary/parser';
import type { GeneratedQuestion, GenerationContext, QuestionGenerationDependencies, SelectionStatistics } from './types';

export class QuestionGenerator {
	constructor(private readonly dependencies: QuestionGenerationDependencies) {}

	async generate(context: GenerationContext): Promise<GeneratedQuestion> {
		const targetVocabulary = selectVocabulary(context.vocabulary, context.statistics);
		if (!targetVocabulary.length) throw new Error('Нет слов для генерации задания.');
		const targetTopics = selectTopics(this.dependencies.topics, context.level, context.statistics);
		if (!targetTopics.length) throw new Error(`Нет тем уровня ${context.level} для генерации задания.`);
		const result = await this.dependencies.provider.generateQuestion({
			level: context.level,
			targetVocabulary,
			targetTopics,
			weakTopics: targetTopics.map((topic) => topic.id),
			recentQuestionsToAvoid: [...context.recentQuestionsToAvoid],
			desiredDifficulty: clampDifficulty(context.desiredDifficulty ?? desiredDifficulty(targetVocabulary, context.statistics)),
		});
		const question = normalizeGeneratedQuestion(result.data, context.level, targetVocabulary, targetTopics);
		await this.dependencies.persist(question);
		return { question, provider: result.metadata.provider, model: result.metadata.model };
	}
}

function selectVocabulary(vocabulary: readonly VocabularyEntry[], statistics: SelectionStatistics | undefined): VocabularyEntry[] {
	return [...vocabulary]
		.sort((left, right) => vocabularyPriority(right, statistics) - vocabularyPriority(left, statistics) || left.displayTerm.localeCompare(right.displayTerm))
		.slice(0, Math.min(2, vocabulary.length));
}

function selectTopics(topics: readonly GrammarTopic[], level: GenerationContext['level'], statistics: SelectionStatistics | undefined): GrammarTopic[] {
	return topics.filter((topic) => topic.level === level)
		.sort((left, right) => topicPriority(right, statistics) - topicPriority(left, statistics) || left.id.localeCompare(right.id))
		.slice(0, 2);
}

function vocabularyPriority(vocabulary: VocabularyEntry, statistics: SelectionStatistics | undefined): number {
	const key = vocabulary.canonicalKey;
	const coverage = statistics?.vocabularyCoverage?.get(key);
	return curriculumPriority(statistics?.vocabularyWeakness?.get(key) ?? 0, 0, coverage === undefined ? 0 : 1 - coverage);
}

function topicPriority(topic: GrammarTopic, statistics: SelectionStatistics | undefined): number {
	const coverage = statistics?.topicCoverage?.get(topic.id);
	return curriculumPriority(statistics?.topicWeakness?.get(topic.id) ?? 0, 0, coverage === undefined ? 0 : 1 - coverage);
}

function desiredDifficulty(vocabulary: readonly VocabularyEntry[], statistics: SelectionStatistics | undefined): number {
	const averageWeakness = vocabulary.reduce((sum, item) => sum + (statistics?.vocabularyWeakness?.get(item.canonicalKey) ?? 0), 0) / vocabulary.length;
	return 0.45 + (1 - averageWeakness) * 0.20;
}

function clampDifficulty(value: number): number { return Math.max(0, Math.min(1, value)); }

function normalizeGeneratedQuestion(
	question: TranslationQuestion,
	level: GenerationContext['level'],
	vocabulary: readonly VocabularyEntry[],
	topics: readonly GrammarTopic[],
): TranslationQuestion {
	const allowedVocabulary = new Map(vocabulary.map((entry) => [entry.canonicalKey, entry]));
	const targetVocabulary = question.targetVocabulary
		.map(canonicalVocabularyKey)
		.filter((key) => allowedVocabulary.has(key));
	if (!targetVocabulary.length) throw new Error('LLM вернула задание без выбранной целевой лексики.');
	const allowedTopics = new Set(topics.map((topic) => topic.id));
	const questionTopics = question.topics.filter((topic) => allowedTopics.has(topic));
	if (!questionTopics.length) throw new Error('LLM вернула задание без выбранной грамматической темы.');
	return {
		...question,
		schemaVersion: QUESTION_SCHEMA_VERSION,
		level,
		targetVocabulary,
		topics: questionTopics,
		generationPromptVersion: question.generationPromptVersion || GENERATE_QUESTION_PROMPT_VERSION,
		createdAt: question.createdAt || new Date().toISOString(),
	};
}

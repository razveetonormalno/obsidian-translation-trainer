import type { TranslationAttempt, TranslationQuestion } from '../domain/types';
import type { TranslationTrainerFileStore } from '../storage/repository';
import {
	buildStatisticsSnapshot,
	drilldownByTopic,
	drilldownByWord,
	selectionStatisticsFromSnapshot,
} from './aggregator';
import type { AttemptDrilldown, StatisticsFilter, StatisticsResult, StatisticsSnapshot } from './types';
import type { SelectionStatistics } from '../questions/types';

/** Loads every monthly JSONL source file; aggregates are always rebuilt from attempts. */
export class StatisticsService {
	private source?: StatisticsResult['source'];

	constructor(private readonly store: TranslationTrainerFileStore) {}

	async rebuild(questions: readonly TranslationQuestion[], filter: Partial<StatisticsFilter> = {}): Promise<StatisticsResult> {
		const attempts = await this.loadAllAttempts();
		const questionMap = new Map(questions.map((question) => [question.id, question]));
		const snapshot = buildStatisticsSnapshot(attempts, filter);
		this.source = { attempts, questions: questionMap };
		return { snapshot, source: this.source };
	}

	selectionStatistics(snapshot: StatisticsSnapshot): SelectionStatistics {
		return selectionStatisticsFromSnapshot(snapshot);
	}

	drilldownTopic(topicId: string): AttemptDrilldown[] {
		return this.source ? drilldownByTopic(this.source.attempts, this.source.questions, topicId) : [];
	}

	drilldownWord(canonicalKey: string): AttemptDrilldown[] {
		return this.source ? drilldownByWord(this.source.attempts, this.source.questions, canonicalKey) : [];
	}

	private async loadAllAttempts(): Promise<TranslationAttempt[]> {
		const months = await this.store.listAttemptMonths();
		const loaded = await Promise.all(months.map((month) => this.store.readAttempts(month)));
		return loaded.flat();
	}
}

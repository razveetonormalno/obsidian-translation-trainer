import type { CefrLevel, GrammarTopic } from '../domain/types';

type TopicSeed = Omit<GrammarTopic, 'generationHints' | 'evaluationRules' | 'examples'>;
const seeds = [
	['A1','a1.be.present','Verb be: present','am/is/are in statements, questions and negatives'],
	['A1','a1.present-simple','Present simple','routines, facts and third-person -s'],
	['A1','a1.have-got','Have got','possession and basic descriptions'],
	['A1','a1.there-is-are','There is / there are','existence and quantity'],
	['A1','a1.articles-basic','Articles','a/an/the and no article in familiar contexts'],
	['A1','a1.countability','Countable nouns','plural forms, some/any and basic quantifiers'],
	['A1','a1.can-imperatives','Can and imperatives','ability, permission and instructions'],
	['A1','a1.prepositions-place-time','Basic prepositions','place and time prepositions'],
	['A2','a2.past-simple','Past simple','finished past events and regular/irregular verbs'],
	['A2','a2.past-continuous','Past continuous','an action in progress in the past'],
	['A2','a2.future-plans','Future plans','going to, present continuous and will'],
	['A2','a2.comparatives','Comparatives and superlatives','comparing people, things and places'],
	['A2','a2.adverbs-frequency','Frequency and manner adverbs','word order and common adverbs'],
	['A2','a2.modals-advice','Modals for advice','should, have to, must and need to'],
	['A2','a2.present-perfect-intro','Present perfect introduction','experience and unfinished time'],
	['A2','a2.infinitive-gerund','Infinitive and gerund basics','want to, enjoy -ing and similar patterns'],
	['B1','b1.present-perfect-vs-past','Present perfect vs past simple','experience, results and finished time'],
	['B1','b1.past-perfect','Past perfect','earlier past actions and sequencing'],
	['B1','b1.future-forms','Future forms','predictions, arrangements, intentions and decisions'],
	['B1','b1.first-second-conditional','First and second conditional','real possibilities and hypothetical situations'],
	['B1','b1.passive-voice','Passive voice','processes, news and unknown agents'],
	['B1','b1.relative-clauses','Defining relative clauses','who, which, that and where'],
	['B1','b1.reported-speech','Reported speech','reported statements and questions'],
	['B1','b1.modals-deduction','Modals of possibility','may, might, could and must for deduction'],
	['B1','b1.linkers','Linkers','contrast, reason, result and addition'],
	['B1','b1.verb-patterns','Verb patterns','gerunds and infinitives after common verbs'],
	['B1','b1.quantifiers','Quantifiers','too/enough, few/little and all/most'],
	['B1','b1.questions-tags','Questions and tags','indirect questions and question tags'],
	['B2','b2.mixed-conditionals','Mixed and advanced conditionals','unreal past, present results and wishes'],
	['B2','b2.perfect-modals','Perfect modals','must have, might have and should have'],
	['B2','b2.participle-clauses','Participle clauses','concise cause, time and result clauses'],
	['B2','b2.inversion-emphasis','Inversion and emphasis','negative adverbials and cleft structures'],
	['B2','b2.advanced-passive','Advanced passive','reporting and impersonal passive forms'],
	['B2','b2.discourse-cohesion','Discourse cohesion','reference, substitution and formal linking'],
	['C1','c1.inversion','Advanced inversion','stylistic inversion for emphasis'],
	['C1','c1.nominalisation','Nominalisation','formal noun-based academic expression'],
	['C1','c1.subjunctive','Subjunctive and mandative forms','formal recommendations and hypothetical language'],
	['C1','c1.hedging','Hedging and stance','precise claims, caution and evaluation'],
	['C1','c1.ellipsis-substitution','Ellipsis and substitution','avoiding repetition in fluent discourse'],
	['C1','c1.complex-discourse','Complex discourse markers','nuanced concession, framing and argument']
] as const;

const topicSeeds: TopicSeed[] = seeds.map(([level, id, title, shortDescription]) => ({ level, id, title, shortDescription }));

export const GRAMMAR_TOPICS: readonly GrammarTopic[] = topicSeeds.map((seed) => ({
	...seed,
	generationHints: [seed.shortDescription],
	evaluationRules: [`Assess whether ${seed.shortDescription.toLowerCase()}.`],
	examples: [],
}));

export function topicById(id: string): GrammarTopic | undefined { return GRAMMAR_TOPICS.find((topic) => topic.id === id); }
export function topicsByLevel(level: CefrLevel): GrammarTopic[] { return GRAMMAR_TOPICS.filter((topic) => topic.level === level); }

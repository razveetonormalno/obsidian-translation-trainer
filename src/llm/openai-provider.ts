import { requestUrl } from 'obsidian';
import type { ConnectionTestResult, EvaluationRequest, FollowUpRequest, LlmProvider, LlmResult, QuestionGenerationRequest, TranslationEvaluation, TranslationQuestion } from '../domain/types';
import { EVALUATION_PROMPT_VERSION, FOLLOW_UP_PROMPT_VERSION, GENERATION_PROMPT_VERSION, evaluationSystemPrompt, followUpSystemPrompt, generationSystemPrompt, repairSystemPrompt } from '../prompts';
import { LlmError, sanitizeError } from './errors';
import { evaluationValidator, generatedQuestionValidator, questionValidator, validatorDiagnostics } from './schemas';

export interface OpenAiCompatibleConfig { baseUrl: string; model: string; apiKey?: string; timeoutMs: number; }
type SchemaKind = 'question' | 'evaluation';
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class OpenAiCompatibleProvider implements LlmProvider {
	constructor(private readonly config: OpenAiCompatibleConfig) {}

	async listModels(): Promise<string[]> {
		const body = await this.request('/models', 'GET');
		if (!isRecord(body) || !Array.isArray(body.data)) throw new LlmError('response', 'Сервер вернул некорректный список моделей.', 'GET /models did not contain data[].');
		return body.data.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : []);
	}

	async testConnection(): Promise<ConnectionTestResult> {
		const started = Date.now();
		await this.listModels();
		await this.chat([{ role: 'user', content: 'Reply with OK.' }]);
		const probe = await this.chat([{ role: 'user', content: 'Return a JSON success probe.' }], jsonResponseFormat('connection_probe', { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } }));
		const probeJson = strictJson(probe);
		if (!probeJson || probeJson.ok !== true) throw new LlmError('response', 'Модель не поддерживает строгий JSON-ответ.', 'JSON Schema probe did not contain ok=true.', probe);
		return { model: this.config.model, latencyMs: Date.now() - started, jsonSchemaSupported: true, chatCompletionSupported: true };
	}

	async generateQuestion(request: QuestionGenerationRequest): Promise<LlmResult<TranslationQuestion>> {
		const raw = await this.structured('question', generationSystemPrompt(request), request.targetTopics.map((topic) => topic.id), request.targetVocabulary.map((item) => item.canonicalKey));
		const latencyMs = rawLatency(raw);
		const data = raw as TranslationQuestion;
		const normalized: TranslationQuestion = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), generationSource: this.isLocalEndpoint() ? 'local-llm' : 'cloud-llm', schemaVersion: 1, generationPromptVersion: GENERATION_PROMPT_VERSION };
		const valid = questionValidator(request.targetTopics.map((topic) => topic.id), request.targetVocabulary.map((item) => item.canonicalKey));
		if (!valid(normalized)) throw new LlmError('schema', 'Модель вернула некорректное задание.', validatorDiagnostics(valid));
		return { data: normalized, metadata: this.metadata(GENERATION_PROMPT_VERSION, latencyMs) };
	}

	async evaluateAnswer(request: EvaluationRequest): Promise<LlmResult<TranslationEvaluation>> {
		const raw = await this.structured('evaluation', evaluationSystemPrompt(request), request.allowedTopics.map((topic) => topic.id), request.question.targetVocabulary);
		const latencyMs = rawLatency(raw);
		const data = normalizeEvaluation(raw as TranslationEvaluation);
		return { data, metadata: this.metadata(EVALUATION_PROMPT_VERSION, latencyMs) };
	}

	async answerFollowUp(request: FollowUpRequest): Promise<LlmResult<string>> {
		const question = request.userQuestion.trim();
		if (!question) throw new LlmError('configuration', 'Введите вопрос для уточнения.', 'Follow-up question is empty.');
		const started = Date.now();
		const history: ChatMessage[] = request.history.slice(-12).map(message => ({ role: message.role, content: message.content }));
		const response = (await this.chat([
			{ role: 'system', content: followUpSystemPrompt(request) },
			...history,
			{ role: 'user', content: question.slice(0, 2_000) },
		])).trim();
		if (!response) throw new LlmError('response', 'Модель вернула пустой ответ.', 'Follow-up response was empty.');
		return { data: response, metadata: this.metadata(FOLLOW_UP_PROMPT_VERSION, Date.now() - started) };
	}

	private async structured(kind: SchemaKind, prompt: string, topicIds: string[], vocabularyKeys: string[]): Promise<unknown> {
		const started = Date.now();
		let validator = kind === 'question' ? generatedQuestionValidator(topicIds, vocabularyKeys) : evaluationValidator(topicIds, vocabularyKeys);
		const format = jsonResponseFormat(kind, validator.schema);
		let response = await this.chat([{ role: 'system', content: prompt }, { role: 'user', content: `Produce the ${kind} JSON now.` }], format);
		let parsed = strictJson(response);
		if (parsed !== undefined && validator(parsed) && hasRequestedCoverage(kind, parsed, topicIds, vocabularyKeys)) {
			return withLatency(parsed, Date.now() - started);
		}
		const problem = parsed === undefined
			? 'Response was not a single JSON object.'
			: validator.errors
				? validatorDiagnostics(validator)
				: 'Response did not include every requested topic and vocabulary item exactly once.';
		response = await this.chat([{ role: 'system', content: repairSystemPrompt(kind) }, { role: 'user', content: `Schema violation: ${problem}\nOriginal response:\n${response}` }], format);
		parsed = strictJson(response);
		validator = kind === 'question' ? generatedQuestionValidator(topicIds, vocabularyKeys) : evaluationValidator(topicIds, vocabularyKeys);
		if (parsed === undefined || !validator(parsed) || !hasRequestedCoverage(kind, parsed, topicIds, vocabularyKeys)) {
			throw new LlmError(
				'schema',
				'Модель вернула ответ в неверном формате.',
				parsed === undefined
					? 'Repair response was not strict JSON.'
					: validator.errors
						? validatorDiagnostics(validator)
						: 'Repair response did not cover every requested topic and vocabulary item exactly once.',
				response,
			);
		}
		return withLatency(parsed, Date.now() - started);
	}

	private async chat(messages: ChatMessage[], responseFormat?: Record<string, unknown>): Promise<string> {
		const body = await this.request('/chat/completions', 'POST', { model: this.config.model, messages, temperature: 0.2, ...(responseFormat ? { response_format: responseFormat } : {}) });
		const content = isRecord(body) && Array.isArray(body.choices) && isRecord(body.choices[0]) && isRecord(body.choices[0].message) ? body.choices[0].message.content : undefined;
		if (typeof content !== 'string') throw new LlmError('response', 'Сервер вернул некорректный ответ модели.', 'Missing choices[0].message.content.');
		return content;
	}

	private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
		if (!this.config.baseUrl.trim() || !this.config.model.trim()) throw new LlmError('configuration', 'Укажите endpoint и модель в настройках.', 'baseUrl or model is empty.');
		const url = `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
		const request = requestUrl({ url, method, contentType: 'application/json', body: body === undefined ? undefined : JSON.stringify(body), headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined, throw: false });
		try {
			const response = await timeout(request, this.config.timeoutMs);
			if (response.status < 200 || response.status >= 300) throw new LlmError('http', `Сервер модели вернул ошибку ${response.status}.`, `${method} ${path}: HTTP ${response.status}`, response.text.slice(0, 4_000));
			try { return JSON.parse(response.text) as unknown; } catch { throw new LlmError('response', 'Сервер вернул некорректный JSON.', `${method} ${path}: response JSON parsing failed.`, response.text.slice(0, 4_000)); }
		} catch (error) { throw sanitizeError(error); }
	}

	private metadata(promptVersion: number, latencyMs: number) { return { provider: 'openai-compatible', model: this.config.model, promptVersion, latencyMs }; }
	private isLocalEndpoint(): boolean { return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(this.config.baseUrl); }
}

function strictJson(value: string): Record<string, unknown> | undefined { const candidate = value.trim(); if (!candidate.startsWith('{') || !candidate.endsWith('}')) return undefined; try { const parsed: unknown = JSON.parse(candidate); return isRecord(parsed) ? parsed : undefined; } catch { return undefined; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function withLatency(value: unknown, latencyMs: number): unknown { Object.defineProperty(value as object, '__llmLatencyMs', { value: latencyMs, enumerable: false }); return value; }
function rawLatency(value: unknown): number { return isRecord(value) && typeof value.__llmLatencyMs === 'number' ? value.__llmLatencyMs : 0; }
function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> { return new Promise((resolve, reject) => { const timer = window.setTimeout(() => reject(new LlmError('timeout', 'Превышено время ожидания ответа модели.', `Timeout after ${milliseconds} ms.`)), milliseconds); void promise.then((value) => { window.clearTimeout(timer); resolve(value); }, (error: unknown) => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); }); }); }
function normalizeEvaluation(value: TranslationEvaluation): TranslationEvaluation { const weighted = Math.round(value.meaning.score * .4 + value.grammar.score * .3 + value.naturalness.score * .2 + value.vocabulary.score * .1); const critical = value.errors.some((error) => error.severity === 'critical'); const overallScore = critical || value.meaning.score < 60 ? Math.min(value.overallScore, weighted, 59) : weighted; return { ...value, overallScore, isAcceptable: overallScore >= 65 && !critical && value.grammar.score >= 50 }; }
function jsonResponseFormat(name: string, schema: unknown): Record<string, unknown> { return { type: 'json_schema', json_schema: { name, strict: true, schema } }; }

function hasRequestedCoverage(
	kind: SchemaKind,
	value: Record<string, unknown>,
	topicIds: readonly string[],
	vocabularyKeys: readonly string[],
): boolean {
	if (kind === 'question') {
		return hasExactStrings(value.topics, topicIds) && hasExactStrings(value.targetVocabulary, vocabularyKeys);
	}
	if (!isRecord(value.grammar) || !isRecord(value.vocabulary)) return false;
	const topicScores = Array.isArray(value.grammar.topicScores) ? value.grammar.topicScores : [];
	const itemScores = Array.isArray(value.vocabulary.itemScores) ? value.vocabulary.itemScores : [];
	return hasExactStrings(topicScores.map((item) => isRecord(item) ? item.topicId : undefined), topicIds) &&
		hasExactStrings(itemScores.map((item) => isRecord(item) ? item.canonicalKey : undefined), vocabularyKeys);
}

function hasExactStrings(value: unknown, expected: readonly string[]): boolean {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return false;
	const actual = value as string[];
	return actual.length === expected.length && new Set(actual).size === actual.length &&
		expected.every((item) => actual.includes(item));
}

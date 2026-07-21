export type LlmErrorCode =
	| 'configuration'
	| 'network'
	| 'timeout'
	| 'http'
	| 'response'
	| 'schema';

export class LlmError extends Error {
	readonly name = 'LlmError';
	constructor(
		readonly code: LlmErrorCode,
		readonly userMessage: string,
		readonly diagnostics: string,
		readonly rawResponse?: string,
	) {
		super(userMessage);
	}
}

export function sanitizeError(error: unknown): LlmError {
	if (error instanceof LlmError) return error;
	const details = error instanceof Error ? error.message : String(error);
	return new LlmError('network', 'Не удалось связаться с языковой моделью.', details);
}

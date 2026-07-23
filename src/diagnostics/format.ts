const MAX_DIAGNOSTIC_LENGTH = 8_000;

interface StructuredError {
	name?: unknown;
	code?: unknown;
	userMessage?: unknown;
	diagnostics?: unknown;
	rawResponse?: unknown;
	message?: unknown;
}

export function formatErrorDiagnostics(error: unknown): string {
	const structured = isRecord(error) ? error as StructuredError : undefined;
	const parts: string[] = [];
	addLine(parts, 'Тип', structured?.name);
	addLine(parts, 'Код', structured?.code);
	addLine(parts, 'Сообщение', structured?.userMessage);
	if (typeof structured?.userMessage !== 'string') addLine(parts, 'Сообщение', structured?.message);
	addLine(parts, 'Диагностика', structured?.diagnostics);
	if (typeof structured?.rawResponse === 'string' && structured.rawResponse.trim()) {
		parts.push(`Ответ сервера:\n${structured.rawResponse.trim()}`);
	}
	if (parts.length === 0) {
		const fallback = error instanceof Error ? error.message : String(error);
		parts.push(fallback);
	}
	return sanitizeDiagnosticText(parts.join('\n\n')).slice(0, MAX_DIAGNOSTIC_LENGTH);
}

export function sanitizeDiagnosticText(value: string): string {
	return value
		.replace(/(?:api[_ -]?key|authorization)["']?\s*[:=]\s*["']?[^\s"',;}]+/giu, 'credential: [скрыто]')
		.replace(/\bbearer\s+[a-z0-9._~+/=-]+/giu, 'Bearer [скрыто]')
		.replace(/\bsk-[a-z0-9_-]{8,}\b/giu, '[API key скрыт]')
		.replace(/https?:\/\/[^\s"']+/giu, '[URL скрыт]');
}

function addLine(parts: string[], label: string, value: unknown): void {
	if (typeof value === 'string' && value.trim()) parts.push(`${label}: ${value.trim()}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

import { Notice } from 'obsidian';

/** User-safe error reporting shared by all UI surfaces. */
export class ErrorReporter {
	private readonly recent = new Map<string, number>();

	report(error: unknown, fallback = 'Не удалось выполнить действие.'): void {
		const message = this.userMessage(error, fallback);
		const now = Date.now();
		const previous = this.recent.get(message) ?? 0;
		if (now - previous < 4_000) return;
		this.recent.set(message, now);
		new Notice(message, 6_000);
	}

	diagnostics(error: unknown): string {
		const value = error instanceof Error ? error.message : String(error);
		return value
			.replace(/(?:api[_ -]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, 'credential: [скрыто]')
			.replace(/https?:\/\/[^\s]+/gi, '[URL скрыт]')
			.slice(0, 1_000);
	}

	private userMessage(error: unknown, fallback: string): string {
		if (error && typeof error === 'object' && 'userMessage' in error) {
			const message = (error as { userMessage?: unknown }).userMessage;
			if (typeof message === 'string' && message.trim()) return message;
		}
		return fallback;
	}
}

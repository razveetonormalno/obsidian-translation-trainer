import { Notice } from 'obsidian';
import { formatErrorDiagnostics } from '../diagnostics';

export type ErrorLogSink = (error: unknown, context: string) => Promise<void>;

/** User-safe error reporting shared by all UI surfaces. */
export class ErrorReporter {
	private readonly recent = new Map<string, number>();
	constructor(private readonly log?: ErrorLogSink) {}

	report(error: unknown, fallback = 'Не удалось выполнить действие.'): void {
		void this.log?.(error, fallback).catch(() => undefined);
		const message = this.userMessage(error, fallback);
		const now = Date.now();
		const previous = this.recent.get(message) ?? 0;
		if (now - previous < 4_000) return;
		this.recent.set(message, now);
		new Notice(message, 6_000);
	}

	diagnostics(error: unknown): string {
		return formatErrorDiagnostics(error);
	}

	private userMessage(error: unknown, fallback: string): string {
		if (error && typeof error === 'object' && 'userMessage' in error) {
			const message = (error as { userMessage?: unknown }).userMessage;
			if (typeof message === 'string' && message.trim()) return message;
		}
		return fallback;
	}
}

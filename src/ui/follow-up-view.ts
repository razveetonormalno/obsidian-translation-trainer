import { MarkdownRenderer, type App, type Component } from 'obsidian';
import type { FollowUpMessage } from '../domain/types';
import { enhanceButtonMotion } from './button-motion';
import { createTokenStream, type TokenStreamAnimation } from './token-stream';

export interface FollowUpViewOptions {
	app: App;
	component: Component;
	messages: readonly FollowUpMessage[];
	draft: string;
	loading: boolean;
	diagnostic?: string;
	onDraftChange(value: string): void;
	onSubmit(): void;
}

export function renderFollowUpView(parent: HTMLElement, options: FollowUpViewOptions): TokenStreamAnimation | undefined {
	const section = parent.createDiv({ cls: 'translation-trainer-follow-up' });
	section.createEl('h4', { text: 'Уточнить результат', cls: 'translation-trainer-card-title' });

	if (options.messages.length > 0) {
		const history = section.createDiv({ cls: 'translation-trainer-follow-up-history', attr: { 'aria-live': 'polite' } });
		for (const message of options.messages) {
			const item = history.createDiv({ cls: `translation-trainer-follow-up-message is-${message.role}` });
			item.createSpan({ text: message.role === 'user' ? 'Вы' : 'Преподаватель', cls: 'translation-trainer-follow-up-author' });
			if (message.role === 'assistant') {
				const body = item.createDiv({ cls: 'translation-trainer-follow-up-markdown' });
				void MarkdownRenderer.render(options.app, message.content, body, '', options.component)
					.catch(() => { body.empty(); body.setText(message.content); });
			} else {
				item.createEl('p', { text: message.content });
			}
		}
	}

	const form = section.createEl('form', { cls: 'translation-trainer-follow-up-form' });
	const field = form.createEl('textarea', {
		cls: 'translation-trainer-follow-up-input',
		attr: { placeholder: 'Хотите что-то уточнить?', rows: '2', maxlength: '2000', 'aria-label': 'Вопрос по результату' },
	});
	field.value = options.draft;
	field.disabled = options.loading;
	field.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
		event.preventDefault();
		form.requestSubmit();
	});
	const ask = enhanceButtonMotion(form.createEl('button', { text: options.loading ? 'Отвечаем…' : 'Спросить', attr: { type: 'submit' } }));
	ask.disabled = options.loading || !options.draft.trim();
	field.addEventListener('input', () => { options.onDraftChange(field.value); ask.disabled = options.loading || !field.value.trim(); });
	form.addEventListener('submit', (event) => { event.preventDefault(); options.onSubmit(); });

	let animation: TokenStreamAnimation | undefined;
	if (options.loading) animation = createTokenStream(section, 'Формулируем ответ');
	if (options.diagnostic) {
		const details = section.createEl('details', { cls: 'translation-trainer-diagnostics' });
		details.createEl('summary', { text: 'Технические детали' });
		details.createEl('pre', { text: options.diagnostic });
	}
	return animation;
}

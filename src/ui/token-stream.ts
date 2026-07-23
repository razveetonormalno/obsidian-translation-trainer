const MAX_VISIBLE_TOKENS = 36;

const TOKEN_VARIANTS: readonly (readonly string[])[] = [
	['Væri', 'Særi', 'Næri'],
	['nóthal', 'vóthal', 'sóthal'],
	['elüna', 'orüna', 'ilüna'],
	['šeren,', 'žeren,', 'čeren,'],
	['thalëm', 'valëm', 'salëm'],
	['ærivon', 'œrivon', 'eirivon'],
	['kélith', 'mélith', 'télith'],
	['na', 'va', 'sa'],
	['dröven', 'kröven', 'tröven'],
	['isqara', 'osqara', 'esqara'],
	['velûn', 'selûn', 'nelûn'],
	['morai.', 'sorai.', 'vorai.'],
];

export interface TokenStreamToken {
	id: number;
	text: string;
	isNew: boolean;
	isRevised: boolean;
}

interface MutableToken {
	id: number;
	groupIndex: number;
	variantIndex: number;
}

/** Deterministic visual model: every step appends a token and revises an older one. */
export class TokenStreamModel {
	private readonly tokens: MutableToken[] = [];
	private nextId = 0;
	private stepIndex = 0;

	advance(): readonly TokenStreamToken[] {
		let revisedId: number | undefined;
		if (this.tokens.length >= 4) {
			const revised = this.tokens[(this.stepIndex * 5 + 1) % this.tokens.length];
			if (revised) {
				const variants = TOKEN_VARIANTS[revised.groupIndex] ?? [];
				revised.variantIndex = (revised.variantIndex + 1) % Math.max(1, variants.length);
				revisedId = revised.id;
			}
		}

		const groupIndex = this.nextId % TOKEN_VARIANTS.length;
		const variants = TOKEN_VARIANTS[groupIndex] ?? ['…'];
		const token: MutableToken = {
			id: this.nextId,
			groupIndex,
			variantIndex: Math.floor(this.nextId / TOKEN_VARIANTS.length) % variants.length,
		};
		this.tokens.push(token);
		this.nextId += 1;
		this.stepIndex += 1;
		if (this.tokens.length > MAX_VISIBLE_TOKENS) this.tokens.shift();

		return this.tokens.map(item => ({
			id: item.id,
			text: (TOKEN_VARIANTS[item.groupIndex] ?? ['…'])[item.variantIndex] ?? '…',
			isNew: item.id === token.id,
			isRevised: item.id === revisedId,
		}));
	}
}

export class TokenStreamAnimation {
	private timer?: number;
	private readonly model = new TokenStreamModel();

	constructor(private readonly host: HTMLElement) {}

	start(): void {
		this.stop();
		for (let index = 0; index < 7; index += 1) this.render(this.model.advance());
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		this.timer = window.setInterval(() => this.render(this.model.advance()), 105);
	}

	stop(): void {
		if (this.timer === undefined) return;
		window.clearInterval(this.timer);
		this.timer = undefined;
	}

	private render(tokens: readonly TokenStreamToken[]): void {
		this.host.empty();
		for (const token of tokens) {
			const classes = ['translation-trainer-token'];
			if (token.isNew) classes.push('is-new');
			if (token.isRevised) classes.push('is-revised');
			this.host.createSpan({ text: token.text, cls: classes.join(' ') });
			this.host.appendText(' ');
		}
		this.host.createSpan({ cls: 'translation-trainer-token-cursor' });
	}
}

export function createTokenStream(parent: HTMLElement, label: string): TokenStreamAnimation {
	const panel = parent.createDiv({ cls: 'translation-trainer-token-panel' });
	const heading = panel.createDiv({ cls: 'translation-trainer-token-heading', attr: { 'aria-live': 'polite' } });
	heading.createSpan({ cls: 'translation-trainer-token-indicator' });
	heading.createSpan({ text: label });
	const stream = panel.createEl('p', { cls: 'translation-trainer-token-stream', attr: { 'aria-hidden': 'true' } });
	const animation = new TokenStreamAnimation(stream);
	animation.start();
	return animation;
}

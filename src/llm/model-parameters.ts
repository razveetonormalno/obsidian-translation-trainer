const OPENAI_MODEL_PREFIXES = ['gpt-', 'chatgpt-'] as const;

export function temperatureForModel(model: string): number {
	const normalized = model.trim().toLowerCase();
	const segments = normalized.split('/');
	const modelId = segments[segments.length - 1] ?? normalized;
	return OPENAI_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix)) ? 1 : 0.2;
}

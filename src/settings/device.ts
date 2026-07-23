import type { App } from 'obsidian';
import { mergeSettings, type TranslationTrainerSettings } from './model';

const DEVICE_LLM_SETTINGS_KEY = 'obsidian-translation-trainer-device-llm-v1';

export interface DeviceLlmSettings {
	endpoint: string;
	model: string;
	timeoutMs: number;
}

/** Stores model connection parameters in this Obsidian installation, outside synchronized vault files. */
export class DeviceLlmSettingsStore {
	constructor(private readonly app: Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>) {}

	load(fallback: TranslationTrainerSettings): DeviceLlmSettings {
		const fallbackLlm = pickDeviceLlmSettings(fallback);
		try {
			const stored = this.app.loadLocalStorage(DEVICE_LLM_SETTINGS_KEY) as unknown;
			if (stored !== null) return sanitizeDeviceLlmSettings(stored, fallbackLlm);
			this.save(fallbackLlm);
		} catch {
			// Keep the synchronized fallback when local storage is temporarily unavailable.
		}
		return fallbackLlm;
	}

	save(settings: DeviceLlmSettings | TranslationTrainerSettings): void {
		this.app.saveLocalStorage(DEVICE_LLM_SETTINGS_KEY, {
			version: 1,
			...pickDeviceLlmSettings(settings),
		});
	}
}

export function pickDeviceLlmSettings(settings: DeviceLlmSettings | TranslationTrainerSettings): DeviceLlmSettings {
	return { endpoint: settings.endpoint, model: settings.model, timeoutMs: settings.timeoutMs };
}

/** Prevents local connection parameters from leaking back into synchronized plugin data. */
export function settingsForVault(settings: TranslationTrainerSettings, fallback: DeviceLlmSettings): TranslationTrainerSettings {
	return { ...settings, ...fallback };
}

function sanitizeDeviceLlmSettings(value: unknown, fallback: DeviceLlmSettings): DeviceLlmSettings {
	if (typeof value !== 'object' || value === null) return fallback;
	const merged = mergeSettings({ ...fallback, ...(value as Record<string, unknown>) });
	return pickDeviceLlmSettings(merged);
}

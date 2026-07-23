import type { App } from 'obsidian';
import { API_KEY_SECRET_ID } from '../domain/constants';

interface SecretStorageLike {
	getSecret(id: string): string | null;
	setSecret(id: string, value: string): void;
}

/** Keeps API keys out of plugin data.json and vault files. */
export class ApiKeyStore {
	constructor(private readonly app: App) {}

	get(): string | null {
		try {
			return this.storage()?.getSecret(API_KEY_SECRET_ID) ?? null;
		} catch {
			return null;
		}
	}

	set(apiKey: string): void {
		try {
			const storage = this.storage();
			if (!storage) throw new Error('app.secretStorage is unavailable.');
			storage.setSecret(API_KEY_SECRET_ID, apiKey);
		} catch (error) {
			const details = error instanceof Error ? error.message : String(error);
			throw Object.assign(
				new Error(`SecretStorage failed: ${details}`),
				{ userMessage: 'Защищённое хранилище недоступно. Обновите Obsidian на телефоне.' },
			);
		}
	}

	private storage(): SecretStorageLike | undefined {
		return (this.app as App & { secretStorage?: SecretStorageLike }).secretStorage;
	}
}

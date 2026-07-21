import type { App } from 'obsidian';
import { API_KEY_SECRET_ID } from '../domain/constants';

/** Keeps API keys out of plugin data.json and vault files. */
export class ApiKeyStore {
	constructor(private readonly app: App) {}

	get(): string | null {
		return this.app.secretStorage.getSecret(API_KEY_SECRET_ID);
	}

	set(apiKey: string): void {
		this.app.secretStorage.setSecret(API_KEY_SECRET_ID, apiKey);
	}
}

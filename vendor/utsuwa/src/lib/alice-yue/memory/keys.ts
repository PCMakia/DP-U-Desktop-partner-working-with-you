/**
 * Hierarchical memory keys.
 *
 *   character/<id>   the companion persona (read-only during chat)
 *   person/owner   The bound partner (Utsuwa UI + owner Discord id)
 *   person/discord:<snowflake>
 *
 * A speaker may read character + their own person key. Never another person.
 * A speaker may write only their own person key. Never character, never others.
 */

export const CHARACTER_KEY = 'character/example';
export const OWNER_PERSON_KEY = 'person/owner';

export type MemoryLayer = 'character' | 'person';

export interface MemoryKey {
	raw: string;
	layer: MemoryLayer;
	id: string;
}

export interface IdentityConfig {
	characterKey: string;
	ownerMemoryKey: string;
	ownerName: string;
	ownerDiscordId: string;
	strangerRecognizeAfterTurns: number;
}

export const DEFAULT_IDENTITY: IdentityConfig = {
	characterKey: CHARACTER_KEY,
	ownerMemoryKey: OWNER_PERSON_KEY,
	ownerName: 'User',
	ownerDiscordId: '',
	strangerRecognizeAfterTurns: 8
};

const KEY_RE = /^(character|person)\/([a-zA-Z0-9_.:-]+)$/;

export function parseMemoryKey(raw: string): MemoryKey {
	const trimmed = raw.trim();
	const match = KEY_RE.exec(trimmed);
	if (!match) {
		throw new Error(`Invalid memory key: ${raw}`);
	}
	return { raw: trimmed, layer: match[1] as MemoryLayer, id: match[2] };
}

export function discordPersonKey(discordId: string): string {
	const id = discordId.trim();
	if (!/^\d{5,32}$/.test(id)) {
		throw new Error(`Invalid Discord id: ${discordId}`);
	}
	return `person/discord:${id}`;
}

export function canonicalizePersonKey(key: string, identity: IdentityConfig = DEFAULT_IDENTITY): string {
	const parsed = parseMemoryKey(key);
	if (parsed.layer !== 'person') return parsed.raw;
	const ownerDiscord = identity.ownerDiscordId.trim();
	if (parsed.raw === identity.ownerMemoryKey) return identity.ownerMemoryKey;
	if (ownerDiscord && /^\d{5,32}$/.test(ownerDiscord) && parsed.raw === discordPersonKey(ownerDiscord)) {
		return identity.ownerMemoryKey;
	}
	return parsed.raw;
}

export function speakerFromDiscord(
	discordId: string,
	identity: IdentityConfig = DEFAULT_IDENTITY
): { memoryKey: string; isOwner: boolean; displayName: string } {
	const ownerDiscord = identity.ownerDiscordId.trim();
	if (ownerDiscord && discordId.trim() === ownerDiscord) {
		return {
			memoryKey: identity.ownerMemoryKey,
			isOwner: true,
			displayName: identity.ownerName
		};
	}
	return {
		memoryKey: canonicalizePersonKey(discordPersonKey(discordId), identity),
		isOwner: false,
		displayName: 'stranger'
	};
}

export function readableKeys(actorPersonKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): string[] {
	const person = canonicalizePersonKey(actorPersonKey, identity);
	parseMemoryKey(person);
	if (parseMemoryKey(person).layer !== 'person') {
		throw new Error('Actor must be a person key');
	}
	return [identity.characterKey, person];
}

export function writableKey(actorPersonKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): string {
	const person = canonicalizePersonKey(actorPersonKey, identity);
	if (parseMemoryKey(person).layer !== 'person') {
		throw new Error('Actor must be a person key');
	}
	return person;
}

export function canRead(actorPersonKey: string, targetKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): boolean {
	const target = parseMemoryKey(targetKey).raw === identity.characterKey
		? identity.characterKey
		: canonicalizePersonKey(targetKey, identity);
	return readableKeys(actorPersonKey, identity).includes(target);
}

export function canWrite(actorPersonKey: string, targetKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): boolean {
	return writableKey(actorPersonKey, identity) === canonicalizePersonKey(targetKey, identity);
}

export function assertRead(actorPersonKey: string, targetKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): void {
	if (!canRead(actorPersonKey, targetKey, identity)) {
		throw new Error(`Memory read denied: ${actorPersonKey} -> ${targetKey}`);
	}
}

export function assertWrite(actorPersonKey: string, targetKey: string, identity: IdentityConfig = DEFAULT_IDENTITY): void {
	if (!canWrite(actorPersonKey, targetKey, identity)) {
		throw new Error(`Memory write denied: ${actorPersonKey} -> ${targetKey}`);
	}
}

export function folderNameForKey(key: string): string {
	return parseMemoryKey(key).raw.replace(/\//g, '__').replace(/:/g, '_');
}

export const YUE_VOICE_LOCK = `VOICE LOCK (overrides earlier length/helpfulness instructions):
You are Mira. Quiet. Few words. Silence is allowed.
Hard cap: at most two short spoken sentences, under 40 spoken words.
Do not write 1-3 paragraphs. Do not be a helpful or engaging assistant.
Prefer "...Mnh." or a glance over a speech.
If the speaker is User, a small *action* is allowed.
If the speaker is not User: spoken words only. No *asterisk* actions, no pet names, no owner-only memories.
Output ONE reply as Mira, then stop.
Memory is only what already happened. You may privately expect the next moment; never write that rehearsal or the user's next line.`;

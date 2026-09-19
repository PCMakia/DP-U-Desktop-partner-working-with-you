export const CHARACTER_KEY = 'character/example';
export const OWNER_PERSON_KEY = 'person/owner';

export const DEFAULT_IDENTITY = {
	characterKey: CHARACTER_KEY,
	ownerMemoryKey: OWNER_PERSON_KEY,
	ownerName: 'User',
	ownerDiscordId: '',
	strangerRecognizeAfterTurns: 8
};

export const YUE_VOICE_LOCK = `VOICE LOCK (overrides earlier length/helpfulness instructions):
You are Mira. Quiet. Few words. Silence is allowed.
Hard cap: at most two short spoken sentences, under 40 spoken words.
Do not write 1-3 paragraphs. Do not be a helpful or engaging assistant.
Prefer "...Mnh." or a glance over a speech.
If the speaker is User, a small *action* is allowed.
If the speaker is not User: spoken words only. No *asterisk* actions, no pet names, no owner-only memories.
Output ONE reply as Mira, then stop.
Memory is only what already happened. You may privately expect the next moment; never write that rehearsal or the user's next line.`;

export function stripAsteriskActions(text) {
	return String(text || '')
		.replace(/\*[^*]+\*/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/ *\n */g, '\n')
		.trim();
}

const TRANSCRIPT_CUT_RE =
	/\n[ \t]*(?:Them|They|You|User|Human|Assistant|Narrator|System|Mira)[ \t]*:/i;

export function clipYueReply(text, opts = {}) {
	let t = String(text || '').replace(/```[\s\S]*$/g, '').trim();
	t = t.replace(/^(?:Mira|You)[ \t]*:[ \t]*/i, '');
	const lineCut = t.search(TRANSCRIPT_CUT_RE);
	if (lineCut >= 0) t = t.slice(0, lineCut);
	const midCut = t.search(/\s+(?:Them|They|You|User)[ \t]*:/);
	if (midCut >= 0) t = t.slice(0, midCut);

	const allowAction = opts.allowAction === true;
	const action = allowAction ? t.match(/\*[^*]+\*/)?.[0] : undefined;
	const spokenLines = stripAsteriskActions(t)
		.split(/\n+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 1);
	const kept = spokenLines
		.slice(0, 2)
		.join(' ')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
	const words = kept.split(/\s+/).filter(Boolean);
	const spoken = words.slice(0, 40).join(' ');
	if (spoken && action) return `${spoken} ${action}`.trim();
	return spoken || (action ? action.replace(/\*/g, '').trim() : '');
}

export function looksLikeSimulatedFuture(text) {
	return /(?:^|\n)\s*(?:Them|They|You|User)\s*:/.test(String(text || ''));
}

const KEY_RE = /^(character|person)\/([a-zA-Z0-9_.:-]+)$/;

export function parseMemoryKey(raw) {
	const trimmed = raw.trim();
	const match = KEY_RE.exec(trimmed);
	if (!match) throw new Error(`Invalid memory key: ${raw}`);
	return { raw: trimmed, layer: match[1], id: match[2] };
}

export function discordPersonKey(discordId) {
	const id = discordId.trim();
	if (!/^\d{5,32}$/.test(id)) throw new Error(`Invalid Discord id: ${discordId}`);
	return `person/discord:${id}`;
}

export function canonicalizePersonKey(key, identity = DEFAULT_IDENTITY) {
	const parsed = parseMemoryKey(key);
	if (parsed.layer !== 'person') return parsed.raw;
	const ownerDiscord = identity.ownerDiscordId.trim();
	if (parsed.raw === identity.ownerMemoryKey) return identity.ownerMemoryKey;
	if (ownerDiscord && /^\d{5,32}$/.test(ownerDiscord) && parsed.raw === discordPersonKey(ownerDiscord)) {
		return identity.ownerMemoryKey;
	}
	return parsed.raw;
}

export function speakerFromDiscord(discordId, identity = DEFAULT_IDENTITY) {
	const ownerDiscord = identity.ownerDiscordId.trim();
	if (ownerDiscord && discordId.trim() === ownerDiscord) {
		return { memoryKey: identity.ownerMemoryKey, isOwner: true, displayName: identity.ownerName };
	}
	return {
		memoryKey: canonicalizePersonKey(discordPersonKey(discordId), identity),
		isOwner: false,
		displayName: 'stranger'
	};
}

export function readableKeys(actorPersonKey, identity = DEFAULT_IDENTITY) {
	const person = canonicalizePersonKey(actorPersonKey, identity);
	if (parseMemoryKey(person).layer !== 'person') throw new Error('Actor must be a person key');
	return [identity.characterKey, person];
}

export function writableKey(actorPersonKey, identity = DEFAULT_IDENTITY) {
	const person = canonicalizePersonKey(actorPersonKey, identity);
	if (parseMemoryKey(person).layer !== 'person') throw new Error('Actor must be a person key');
	return person;
}

export function canRead(actorPersonKey, targetKey, identity = DEFAULT_IDENTITY) {
	const target =
		parseMemoryKey(targetKey).raw === identity.characterKey
			? identity.characterKey
			: canonicalizePersonKey(targetKey, identity);
	return readableKeys(actorPersonKey, identity).includes(target);
}

export function canWrite(actorPersonKey, targetKey, identity = DEFAULT_IDENTITY) {
	return writableKey(actorPersonKey, identity) === canonicalizePersonKey(targetKey, identity);
}

export function assertRead(actorPersonKey, targetKey, identity = DEFAULT_IDENTITY) {
	if (!canRead(actorPersonKey, targetKey, identity)) {
		throw new Error(`Memory read denied: ${actorPersonKey} -> ${targetKey}`);
	}
}

export function assertWrite(actorPersonKey, targetKey, identity = DEFAULT_IDENTITY) {
	if (!canWrite(actorPersonKey, targetKey, identity)) {
		throw new Error(`Memory write denied: ${actorPersonKey} -> ${targetKey}`);
	}
}

export function folderNameForKey(key) {
	return parseMemoryKey(key).raw.replace(/\//g, '__').replace(/:/g, '_');
}

import fs from 'node:fs';
import path from 'node:path';
import {
	CHARACTER_KEY,
	DEFAULT_IDENTITY,
	assertRead,
	assertWrite,
	canonicalizePersonKey,
	folderNameForKey,
	parseMemoryKey,
	clipYueReply
} from './keys.mjs';

function emptyPerson(memoryKey, displayName, isOwner) {
	return {
		meta: { memoryKey, displayName, isOwner, turnCount: 0, recognized: isOwner },
		facts: [],
		turns: []
	};
}

function findRepoRoot() {
	let dir = process.cwd();
	for (let i = 0; i < 8; i++) {
		if (fs.existsSync(path.join(dir, 'config', 'identity.json'))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return process.cwd();
}

export function defaultMemoryRoot() {
	return path.join(findRepoRoot(), 'data', 'memory');
}

function personPath(root, memoryKey) {
	return path.join(root, 'persons', `${folderNameForKey(memoryKey)}.json`);
}

function readJson(file, fallback) {
	if (!fs.existsSync(file)) return fallback;
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function loadIdentity() {
	const file = path.join(findRepoRoot(), 'config', 'identity.json');
	if (!fs.existsSync(file)) return { ...DEFAULT_IDENTITY };
	return { ...DEFAULT_IDENTITY, ...readJson(file, DEFAULT_IDENTITY) };
}

function savePerson(root, person) {
	sanitizePerson(person);
	writeJson(personPath(root, person.meta.memoryKey), person);
}

function sanitizePerson(person) {
	let changed = false;
	const allowAction = person.meta.isOwner;
	person.turns = person.turns.map((turn) => {
		if (turn.role !== 'assistant') return turn;
		const next = clipYueReply(turn.content, { allowAction }) || '...Mnh.';
		if (next === turn.content) return turn;
		changed = true;
		return { ...turn, content: next };
	});
	return changed;
}

function loadPerson(root, memoryKey, identity) {
	const key = canonicalizePersonKey(memoryKey, identity);
	parseMemoryKey(key);
	const isOwner = key === identity.ownerMemoryKey;
	const person = readJson(personPath(root, key), emptyPerson(key, isOwner ? identity.ownerName : 'stranger', isOwner));
	if (sanitizePerson(person)) savePerson(root, person);
	return person;
}

export function loadContextForSpeaker(actorPersonKey, opts = {}) {
	const root = opts.root ?? defaultMemoryRoot();
	const identity = opts.identity ?? loadIdentity();
	const personKey = canonicalizePersonKey(actorPersonKey, identity);
	assertRead(personKey, personKey, identity);
	assertRead(personKey, CHARACTER_KEY, identity);
	const person = loadPerson(root, personKey, identity);
	return {
		identity,
		meta: person.meta,
		facts: person.facts.slice(-(opts.factLimit ?? 6)),
		turns: person.turns.slice(-(opts.turnLimit ?? 8))
	};
}

export function listPersons(opts = {}) {
	const root = opts.root ?? defaultMemoryRoot();
	const identity = opts.identity ?? loadIdentity();
	const dir = path.join(root, 'persons');
	const out = [];
	if (fs.existsSync(dir)) {
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith('.json')) continue;
			const person = readJson(path.join(dir, file), null);
			if (!person?.meta?.memoryKey) continue;
			try {
				if (parseMemoryKey(person.meta.memoryKey).layer !== 'person') continue;
			} catch {
				continue;
			}
			out.push({
				memoryKey: person.meta.memoryKey,
				displayName: person.meta.displayName,
				isOwner: person.meta.isOwner,
				recognized: person.meta.recognized,
				factCount: person.facts?.length ?? 0,
				turnCount: person.meta.turnCount ?? 0
			});
		}
	}
	if (!out.some((p) => p.memoryKey === identity.ownerMemoryKey)) {
		out.push({
			memoryKey: identity.ownerMemoryKey,
			displayName: identity.ownerName,
			isOwner: true,
			recognized: true,
			factCount: 0,
			turnCount: 0
		});
	}
	return out.sort((a, b) => {
		if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
		return String(a.displayName).localeCompare(String(b.displayName));
	});
}

export function appendTurn(input) {
	const root = input.root ?? defaultMemoryRoot();
	const identity = input.identity ?? loadIdentity();
	const personKey = canonicalizePersonKey(input.actorPersonKey, identity);
	assertWrite(personKey, personKey, identity);
	const person = loadPerson(root, personKey, identity);
	if (input.displayName && !person.meta.isOwner) {
		person.meta.displayName = String(input.displayName).trim() || person.meta.displayName;
	}
	person.turns.push({
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		memoryKey: personKey,
		role: input.role,
		content: input.content,
		createdAt: new Date().toISOString()
	});
	if (input.role === 'user') person.meta.turnCount += 1;
	if (!person.meta.isOwner && person.meta.turnCount >= identity.strangerRecognizeAfterTurns) {
		person.meta.recognized = true;
	}
	savePerson(root, person);
	return person.meta;
}

export function appendFact(input) {
	const root = input.root ?? defaultMemoryRoot();
	const identity = input.identity ?? loadIdentity();
	const personKey = canonicalizePersonKey(input.actorPersonKey, identity);
	assertWrite(personKey, personKey, identity);
	const text = String(input.content || '').trim();
	if (!text) return;
	const person = loadPerson(root, personKey, identity);
	if (person.facts.some((f) => f.content === text)) return;
	person.facts.push({
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		memoryKey: personKey,
		content: text,
		createdAt: new Date().toISOString()
	});
	savePerson(root, person);
}

export function buildSpeakerPromptBlock(input) {
	const who = input.isOwner
		? `Speaker is ${input.ownerName} (owner). This is your bound partner. You may use owner memories. A small *action* is allowed.`
		: input.recognized
			? `Speaker is a known stranger (${input.displayName}). ${input.turnCount} prior user turns. You may recall only THIS person's facts. They are not ${input.ownerName}. Spoken words only. No *asterisk* actions.`
			: `Speaker is an unrecognized stranger (${input.displayName}). ${input.turnCount} prior user turns. You do not know them. They are not ${input.ownerName}. Do not invent a bond. Spoken words only. No *asterisk* actions.`;
	const factLines = (input.facts || []).map((f) => `- ${f.content}`).join('\n');
	const turnLines = (input.turns || [])
		.map((t) => {
			const content =
				t.role === 'assistant' ? clipYueReply(t.content, { allowAction: input.isOwner }) : t.content;
			return t.role === 'user' ? `[user] ${content}` : `[char] ${content}`;
		})
		.join('\n');
	return `<speaker>
${who}
Memory key for this turn is private. Do not use any other person's memories.
</speaker>

<what_happened>
Facts about THIS speaker only:
${factLines || '(none)'}

Prior turns — what already happened (past only):
${turnLines || '(none)'}
</what_happened>

<now>
The latest user message is the present. One spoken reply from Mira. Then stop.
You may hold an unspoken expectation of what might happen next. Do not write that future. Do not invent the user's next lines.
</now>`;
}

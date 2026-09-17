import fs from 'node:fs';
import path from 'node:path';
import {
	CHARACTER_KEY,
	DEFAULT_IDENTITY,
	assertRead,
	assertWrite,
	canonicalizePersonKey,
	folderNameForKey,
	parseMemoryKey
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

function loadPerson(root, memoryKey, identity) {
	const key = canonicalizePersonKey(memoryKey, identity);
	parseMemoryKey(key);
	const isOwner = key === identity.ownerMemoryKey;
	return readJson(personPath(root, key), emptyPerson(key, isOwner ? identity.ownerName : 'stranger', isOwner));
}

function savePerson(root, person) {
	writeJson(personPath(root, person.meta.memoryKey), person);
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

export function appendTurn(input) {
	const root = input.root ?? defaultMemoryRoot();
	const identity = input.identity ?? loadIdentity();
	const personKey = canonicalizePersonKey(input.actorPersonKey, identity);
	assertWrite(personKey, personKey, identity);
	const person = loadPerson(root, personKey, identity);
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
		? `Speaker is ${input.ownerName} (owner). This is your bound partner. You may use owner memories.`
		: input.recognized
			? `Speaker is a known stranger (${input.displayName}). ${input.turnCount} prior user turns. You may recall only THIS person's facts. They are not ${input.ownerName}.`
			: `Speaker is an unrecognized stranger (${input.displayName}). ${input.turnCount} prior user turns. You do not know them. They are not ${input.ownerName}. Do not invent a bond.`;
	const factLines = (input.facts || []).map((f) => `- ${f.content}`).join('\n');
	const turnLines = (input.turns || [])
		.map((t) => `${t.role === 'user' ? 'Them' : 'You'}: ${t.content}`)
		.join('\n');
	return `<speaker>
${who}
Memory key for this turn is private. Do not use any other person's memories.
</speaker>

<person_memory>
Facts about THIS speaker only:
${factLines || '(none)'}

Recent turns with THIS speaker only:
${turnLines || '(none)'}
</person_memory>`;
}

import fs from 'node:fs';
import path from 'node:path';
import {
	CHARACTER_KEY,
	DEFAULT_IDENTITY,
	type IdentityConfig,
	assertRead,
	assertWrite,
	canonicalizePersonKey,
	folderNameForKey,
	parseMemoryKey
} from './keys.ts';

export interface StoredFact {
	id: string;
	memoryKey: string;
	content: string;
	createdAt: string;
}

export interface StoredTurn {
	id: string;
	memoryKey: string;
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
}

export interface PersonMeta {
	memoryKey: string;
	displayName: string;
	isOwner: boolean;
	turnCount: number;
	recognized: boolean;
}

interface PersonFile {
	meta: PersonMeta;
	facts: StoredFact[];
	turns: StoredTurn[];
}

function emptyPerson(memoryKey: string, displayName: string, isOwner: boolean): PersonFile {
	return {
		meta: { memoryKey, displayName, isOwner, turnCount: 0, recognized: isOwner },
		facts: [],
		turns: []
	};
}

function findRepoRoot(): string {
	let dir = process.cwd();
	for (let i = 0; i < 8; i++) {
		if (fs.existsSync(path.join(dir, 'config', 'identity.json'))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return process.cwd();
}

export function defaultMemoryRoot(): string {
	return path.join(findRepoRoot(), 'data', 'memory');
}

function personPath(root: string, memoryKey: string): string {
	return path.join(root, 'persons', `${folderNameForKey(memoryKey)}.json`);
}

function readJson<T>(file: string, fallback: T): T {
	if (!fs.existsSync(file)) return fallback;
	return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function loadIdentity(root = defaultMemoryRoot()): IdentityConfig {
	const file = path.join(findRepoRoot(), 'config', 'identity.json');
	if (!fs.existsSync(file)) return { ...DEFAULT_IDENTITY };
	return { ...DEFAULT_IDENTITY, ...readJson(file, DEFAULT_IDENTITY) };
}

function loadPerson(root: string, memoryKey: string, identity: IdentityConfig): PersonFile {
	const key = canonicalizePersonKey(memoryKey, identity);
	parseMemoryKey(key);
	const isOwner = key === identity.ownerMemoryKey;
	return readJson(personPath(root, key), emptyPerson(key, isOwner ? identity.ownerName : 'stranger', isOwner));
}

function savePerson(root: string, person: PersonFile): void {
	writeJson(personPath(root, person.meta.memoryKey), person);
}

export function loadContextForSpeaker(
	actorPersonKey: string,
	opts?: { root?: string; identity?: IdentityConfig; turnLimit?: number; factLimit?: number }
): { identity: IdentityConfig; meta: PersonMeta; facts: StoredFact[]; turns: StoredTurn[] } {
	const root = opts?.root ?? defaultMemoryRoot();
	const identity = opts?.identity ?? loadIdentity(root);
	const personKey = canonicalizePersonKey(actorPersonKey, identity);
	assertRead(personKey, personKey, identity);
	assertRead(personKey, CHARACTER_KEY, identity);
	const person = loadPerson(root, personKey, identity);
	const turnLimit = opts?.turnLimit ?? 8;
	const factLimit = opts?.factLimit ?? 6;
	return {
		identity,
		meta: person.meta,
		facts: person.facts.slice(-factLimit),
		turns: person.turns.slice(-turnLimit)
	};
}

export interface PersonOverview {
	memoryKey: string;
	displayName: string;
	isOwner: boolean;
	recognized: boolean;
	factCount: number;
	turnCount: number;
}

export function listPersons(opts?: {
	root?: string;
	identity?: IdentityConfig;
}): PersonOverview[] {
	const root = opts?.root ?? defaultMemoryRoot();
	const identity = opts?.identity ?? loadIdentity(root);
	const dir = path.join(root, 'persons');
	const out: PersonOverview[] = [];
	if (fs.existsSync(dir)) {
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith('.json')) continue;
			const person = readJson<PersonFile | null>(path.join(dir, file), null);
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
		return a.displayName.localeCompare(b.displayName);
	});
}

export function listFactsForMonitor(
	memoryKey: string,
	opts?: { root?: string; identity?: IdentityConfig }
): StoredFact[] {
	const root = opts?.root ?? defaultMemoryRoot();
	const identity = opts?.identity ?? loadIdentity(root);
	const personKey = canonicalizePersonKey(memoryKey, identity);
	if (parseMemoryKey(personKey).layer !== 'person') {
		throw new Error('Monitor facts are person-only');
	}
	return loadPerson(root, personKey, identity).facts;
}

export function personCorpus(
	memoryKey: string,
	opts?: { root?: string; identity?: IdentityConfig }
): string {
	const root = opts?.root ?? defaultMemoryRoot();
	const identity = opts?.identity ?? loadIdentity(root);
	const personKey = canonicalizePersonKey(memoryKey, identity);
	const person = loadPerson(root, personKey, identity);
	return [...person.facts.map((f) => f.content), ...person.turns.map((t) => t.content)].join('\n');
}

export function appendTurn(input: {
	actorPersonKey: string;
	role: 'user' | 'assistant';
	content: string;
	displayName?: string;
	root?: string;
	identity?: IdentityConfig;
}): PersonMeta {
	const root = input.root ?? defaultMemoryRoot();
	const identity = input.identity ?? loadIdentity(root);
	const personKey = canonicalizePersonKey(input.actorPersonKey, identity);
	assertWrite(personKey, personKey, identity);
	const person = loadPerson(root, personKey, identity);
	if (input.displayName && !person.meta.isOwner) {
		person.meta.displayName = input.displayName.trim() || person.meta.displayName;
	}
	person.turns.push({
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		memoryKey: personKey,
		role: input.role,
		content: input.content,
		createdAt: new Date().toISOString()
	});
	if (input.role === 'user') person.meta.turnCount += 1;
	if (
		!person.meta.isOwner &&
		person.meta.turnCount >= identity.strangerRecognizeAfterTurns
	) {
		person.meta.recognized = true;
	}
	savePerson(root, person);
	return person.meta;
}

export function appendFact(input: {
	actorPersonKey: string;
	content: string;
	root?: string;
	identity?: IdentityConfig;
}): void {
	const root = input.root ?? defaultMemoryRoot();
	const identity = input.identity ?? loadIdentity(root);
	const personKey = canonicalizePersonKey(input.actorPersonKey, identity);
	assertWrite(personKey, personKey, identity);
	const text = input.content.trim();
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

export function buildSpeakerPromptBlock(input: {
	isOwner: boolean;
	ownerName: string;
	displayName: string;
	recognized: boolean;
	turnCount: number;
	facts: StoredFact[];
	turns: StoredTurn[];
}): string {
	const who = input.isOwner
		? `Speaker is ${input.ownerName} (owner). This is your bound partner. You may use owner memories.`
		: input.recognized
			? `Speaker is a known stranger (${input.displayName}). ${input.turnCount} prior user turns. You may recall only THIS person's facts. They are not ${input.ownerName}.`
			: `Speaker is an unrecognized stranger (${input.displayName}). ${input.turnCount} prior user turns. You do not know them. They are not ${input.ownerName}. Do not invent a bond.`;

	const factLines = input.facts.map((f) => `- ${f.content}`).join('\n');
	const turnLines = input.turns
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

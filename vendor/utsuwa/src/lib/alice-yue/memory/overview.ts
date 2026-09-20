import type { Fact } from '$lib/types/memory';
import { OWNER_PERSON_KEY } from './keys.ts';

export interface StoredFact {
	id: string;
	memoryKey: string;
	content: string;
	createdAt: string;
}

export interface PersonOverview {
	memoryKey: string;
	displayName: string;
	isOwner: boolean;
	recognized: boolean;
	factCount: number;
	turnCount: number;
}

const GENERIC_NAMES = new Set([
	'stranger',
	'user',
	'mira',
	'dpu',
	'they',
	'them',
	'honey',
	'him',
	'her',
	'someone'
]);

export interface MentionLink {
	source: string;
	target: string;
	reason: 'mention';
}

export interface IdentityCluster extends PersonOverview {
	kind: 'identity';
	id: string;
}

export const identityColors = {
	owner: '#fbbf24',
	recognized: '#00b2ff',
	stranger: '#94a3b8'
} as const;

export function identityColor(person: Pick<PersonOverview, 'isOwner' | 'recognized'>): string {
	if (person.isOwner) return identityColors.owner;
	if (person.recognized) return identityColors.recognized;
	return identityColors.stranger;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isGenericDisplayName(displayName: string): boolean {
	return GENERIC_NAMES.has(displayName.trim().toLowerCase());
}

export function mentionsName(corpus: string, displayName: string): boolean {
	const name = displayName.trim();
	if (name.length < 2 || isGenericDisplayName(name)) return false;
	const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}(?:[^\\p{L}\\p{N}_]|$)`, 'iu');
	return pattern.test(corpus);
}

export function mentionsPersonKey(corpus: string, memoryKey: string): boolean {
	const snowflake = memoryKey.split(':')[1];
	if (snowflake && /^\d{5,32}$/.test(snowflake) && corpus.includes(snowflake)) return true;
	return corpus.includes(memoryKey);
}

export function buildMentionLinks(
	people: Array<{ memoryKey: string; displayName: string; corpus: string }>
): MentionLink[] {
	const seen = new Set<string>();
	const links: MentionLink[] = [];
	for (const speaker of people) {
		for (const other of people) {
			if (speaker.memoryKey === other.memoryKey) continue;
			const named = mentionsName(speaker.corpus, other.displayName);
			const keyed = mentionsPersonKey(speaker.corpus, other.memoryKey);
			if (!named && !keyed) continue;
			const id = `${speaker.memoryKey}->${other.memoryKey}`;
			if (seen.has(id)) continue;
			seen.add(id);
			links.push({ source: speaker.memoryKey, target: other.memoryKey, reason: 'mention' });
		}
	}
	return links;
}

export function mergeOverviewClusters(
	diskPersons: PersonOverview[],
	idbFacts: Array<{ memoryKey?: string }>,
	ownerName = 'User'
): PersonOverview[] {
	const map = new Map(diskPersons.map((p) => [p.memoryKey, { ...p }]));
	const counts = new Map<string, number>();
	for (const fact of idbFacts) {
		const key = fact.memoryKey || OWNER_PERSON_KEY;
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	for (const [key, count] of counts) {
		const existing = map.get(key);
		if (existing) {
			existing.factCount = Math.max(existing.factCount, count);
			continue;
		}
		map.set(key, {
			memoryKey: key,
			displayName: key === OWNER_PERSON_KEY ? ownerName : key.replace(/^person\//, ''),
			isOwner: key === OWNER_PERSON_KEY,
			recognized: key === OWNER_PERSON_KEY,
			factCount: count,
			turnCount: 0
		});
	}
	return [...map.values()].sort((a, b) => {
		if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
		return a.displayName.localeCompare(b.displayName);
	});
}

export function toIdentityNodes(persons: PersonOverview[]): IdentityCluster[] {
	return persons.map((person) => ({
		...person,
		kind: 'identity',
		id: person.memoryKey
	}));
}

export function syntheticFactId(diskId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < diskId.length; i++) {
		hash ^= diskId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return 2_000_000_000 + (hash >>> 0) % 100_000_000;
}

export function mergePersonFacts(idbFacts: Fact[], diskFacts: StoredFact[]): Fact[] {
	const seen = new Set(
		idbFacts.map((fact) => fact.content.trim().toLowerCase()).filter(Boolean)
	);
	const extra: Fact[] = [];
	for (const fact of diskFacts) {
		const key = fact.content.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		extra.push({
			id: syntheticFactId(fact.id),
			content: fact.content,
			category: 'user',
			importance: 40,
			confidence: 1,
			referenceCount: 0,
			createdAt: new Date(fact.createdAt),
			memoryKey: fact.memoryKey
		});
	}
	return [...idbFacts, ...extra];
}

export function unionMentionLinks(a: MentionLink[], b: MentionLink[]): MentionLink[] {
	const seen = new Set(a.map((link) => `${link.source}->${link.target}`));
	const out = [...a];
	for (const link of b) {
		const id = `${link.source}->${link.target}`;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push(link);
	}
	return out;
}

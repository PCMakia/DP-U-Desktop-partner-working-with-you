import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_PERSON_KEY } from './keys.ts';
import {
	buildMentionLinks,
	mergeOverviewClusters,
	mergePersonFacts,
	mentionsName
} from './overview.ts';

test('mentions a real display name and ignores generic stranger', () => {
	assert.equal(mentionsName('Kai said hello to User yesterday', 'User'), true);
	assert.equal(mentionsName('Kai said hello to User yesterday', 'stranger'), false);
	assert.equal(mentionsName('I love you', 'Kai'), false);
});

test('people are linked only by explicit mention, never shared phrasing', () => {
	const links = buildMentionLinks([
		{
			memoryKey: OWNER_PERSON_KEY,
			displayName: 'User',
			corpus: 'I love you. Waited for Mira.'
		},
		{
			memoryKey: 'person/discord:222222222222222222',
			displayName: 'Kai',
			corpus: 'I love you. User told me about the hideout.'
		}
	]);
	assert.equal(links.length, 1);
	assert.deepEqual(links[0], {
		source: 'person/discord:222222222222222222',
		target: OWNER_PERSON_KEY,
		reason: 'mention'
	});
});

test('overview merges IndexedDB-only speakers without dropping disk people', () => {
	const merged = mergeOverviewClusters(
		[
			{
				memoryKey: 'person/discord:222222222222222222',
				displayName: 'Kai',
				isOwner: false,
				recognized: true,
				factCount: 3,
				turnCount: 9
			}
		],
		[{ memoryKey: OWNER_PERSON_KEY }, { memoryKey: OWNER_PERSON_KEY }]
	);
	assert.equal(merged.some((p) => p.memoryKey === OWNER_PERSON_KEY && p.factCount === 2), true);
	assert.equal(merged.some((p) => p.displayName === 'Kai' && p.factCount === 3), true);
});

test('drill-in keeps disk facts that IndexedDB does not have', () => {
	const merged = mergePersonFacts(
		[
			{
				id: 1,
				content: 'User hates licorice',
				category: 'user',
				importance: 80,
				confidence: 1,
				referenceCount: 2,
				createdAt: new Date('2026-01-01')
			}
		],
		[
			{
				id: 'disk-1',
				memoryKey: OWNER_PERSON_KEY,
				content: 'User hates licorice',
				createdAt: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'disk-2',
				memoryKey: OWNER_PERSON_KEY,
				content: 'Kai likes fishing',
				createdAt: '2026-01-02T00:00:00.000Z'
			}
		]
	);
	assert.equal(merged.length, 2);
	assert.equal(merged.some((f) => f.content === 'Kai likes fishing'), true);
});

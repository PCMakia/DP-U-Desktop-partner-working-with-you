import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OWNER_PERSON_KEY } from './keys.ts';
import { appendFact, appendTurn, listPersons, loadContextForSpeaker } from './store.ts';

test('person facts never leak across keys', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-mem-'));
	const identity = {
		characterKey: 'character/example',
		ownerMemoryKey: OWNER_PERSON_KEY,
		ownerName: 'User',
		ownerDiscordId: '111111111111111111',
		strangerRecognizeAfterTurns: 8
	};

	appendFact({
		actorPersonKey: OWNER_PERSON_KEY,
		content: 'User hates licorice',
		root,
		identity
	});
	appendFact({
		actorPersonKey: 'person/discord:222222222222222222',
		content: 'Kai likes fishing',
		root,
		identity
	});

	const owner = loadContextForSpeaker(OWNER_PERSON_KEY, { root, identity });
	const other = loadContextForSpeaker('person/discord:222222222222222222', { root, identity });

	assert.equal(owner.facts.some((f) => f.content.includes('licorice')), true);
	assert.equal(owner.facts.some((f) => f.content.includes('fishing')), false);
	assert.equal(other.facts.some((f) => f.content.includes('fishing')), true);
	assert.equal(other.facts.some((f) => f.content.includes('licorice')), false);
});

test('stranger becomes recognized after enough turns', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-mem-'));
	const identity = {
		characterKey: 'character/example',
		ownerMemoryKey: OWNER_PERSON_KEY,
		ownerName: 'User',
		ownerDiscordId: '',
		strangerRecognizeAfterTurns: 2
	};
	const key = 'person/discord:333333333333333333';
	appendTurn({ actorPersonKey: key, role: 'user', content: 'hi', root, identity });
	let meta = appendTurn({ actorPersonKey: key, role: 'assistant', content: '...', root, identity });
	assert.equal(meta.recognized, false);
	meta = appendTurn({ actorPersonKey: key, role: 'user', content: 'hello again', root, identity });
	assert.equal(meta.recognized, true);
});

test('listPersons includes every speaker file and persists Discord display names', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-mem-'));
	const identity = {
		characterKey: 'character/example',
		ownerMemoryKey: OWNER_PERSON_KEY,
		ownerName: 'User',
		ownerDiscordId: '',
		strangerRecognizeAfterTurns: 8
	};
	appendTurn({
		actorPersonKey: 'person/discord:222222222222222222',
		role: 'user',
		content: 'User is in the other channel',
		displayName: 'Kai',
		root,
		identity
	});
	const people = listPersons({ root, identity });
	assert.equal(people.some((p) => p.isOwner && p.memoryKey === OWNER_PERSON_KEY), true);
	const kai = people.find((p) => p.memoryKey === 'person/discord:222222222222222222');
	assert.equal(kai?.displayName, 'Kai');
	assert.equal(kai?.factCount, 0);
	assert.equal(kai?.turnCount, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	CHARACTER_KEY,
	OWNER_PERSON_KEY,
	assertRead,
	assertWrite,
	canRead,
	canWrite,
	canonicalizePersonKey,
	discordPersonKey,
	readableKeys,
	speakerFromDiscord,
	stripAsteriskActions
} from './keys.ts';

const identity = {
	characterKey: CHARACTER_KEY,
	ownerMemoryKey: OWNER_PERSON_KEY,
	ownerName: 'User',
	ownerDiscordId: '111111111111111111',
	strangerRecognizeAfterTurns: 8
};

test('owner Discord id aliases onto person/owner', () => {
	const speaker = speakerFromDiscord('111111111111111111', identity);
	assert.equal(speaker.memoryKey, OWNER_PERSON_KEY);
	assert.equal(speaker.isOwner, true);
	assert.equal(
		canonicalizePersonKey(discordPersonKey('111111111111111111'), identity),
		OWNER_PERSON_KEY
	);
});

test('other Discord ids stay on their own person key', () => {
	const speaker = speakerFromDiscord('222222222222222222', identity);
	assert.equal(speaker.memoryKey, 'person/discord:222222222222222222');
	assert.equal(speaker.isOwner, false);
	assert.equal(speaker.displayName, 'stranger');
});

test('strips asterisk actions for stranger-facing replies', () => {
	assert.equal(stripAsteriskActions('...Mira. *A cold glance.* ...State your purpose.'), '...Mira. ...State your purpose.');
	assert.equal(stripAsteriskActions('*She looks away.*'), '');
});

test('a person can read character + self and nothing else', () => {
	const seirosh = OWNER_PERSON_KEY;
	const other = 'person/discord:222222222222222222';
	assert.deepEqual(readableKeys(seirosh, identity), [CHARACTER_KEY, seirosh]);
	assert.equal(canRead(seirosh, CHARACTER_KEY, identity), true);
	assert.equal(canRead(seirosh, seirosh, identity), true);
	assert.equal(canRead(seirosh, other, identity), false);
	assert.equal(canRead(other, seirosh, identity), false);
	assert.throws(() => assertRead(other, seirosh, identity));
});

test('nobody can write the character layer or another person', () => {
	assert.equal(canWrite(OWNER_PERSON_KEY, CHARACTER_KEY, identity), false);
	assert.equal(canWrite(OWNER_PERSON_KEY, OWNER_PERSON_KEY, identity), true);
	assert.equal(canWrite(OWNER_PERSON_KEY, 'person/discord:222222222222222222', identity), false);
	assert.throws(() => assertWrite('person/discord:222222222222222222', OWNER_PERSON_KEY, identity));
});

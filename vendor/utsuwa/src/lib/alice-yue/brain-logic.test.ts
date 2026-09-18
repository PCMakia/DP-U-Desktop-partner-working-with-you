import test from 'node:test';
import assert from 'node:assert/strict';

import {
	parseBrainAction,
	isLoopbackAddress,
	looksLikeAliceYueLlama,
	llamaHealthUrls
} from './brain-logic.ts';

test('parses wake and park only', () => {
	assert.equal(parseBrainAction('wake'), 'wake');
	assert.equal(parseBrainAction('park'), 'park');
	assert.equal(parseBrainAction('rm'), null);
});

test('allows loopback clients only', () => {
	assert.equal(isLoopbackAddress('127.0.0.1'), true);
	assert.equal(isLoopbackAddress('::1'), true);
	assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
	assert.equal(isLoopbackAddress('8.8.8.8'), false);
});

test('detects the local Eclipse endpoint', () => {
	assert.equal(looksLikeAliceYueLlama('http://127.0.0.1:8081/v1'), true);
	assert.equal(looksLikeAliceYueLlama('http://localhost:8081/v1/'), true);
	assert.equal(looksLikeAliceYueLlama('https://api.openai.com/v1'), false);
});

test('health URLs strip /v1', () => {
	assert.deepEqual(llamaHealthUrls('http://127.0.0.1:8081/v1'), [
		'http://127.0.0.1:8081/health',
		'http://127.0.0.1:8081/v1/models'
	]);
});

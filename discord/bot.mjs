import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IDENTITY, YUE_VOICE_LOCK, speakerFromDiscord, stripAsteriskActions } from '../src/memory/keys.mjs';
import {
	appendTurn,
	buildSpeakerPromptBlock,
	loadContextForSpeaker
} from '../src/memory/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const generatedPromptPath = path.join(repoRoot, 'characters', '.generated-character.txt');
const llamaUrl = process.env.LLAMA_URL || 'http://127.0.0.1:8081/v1/chat/completions';
const token = process.env.DISCORD_BOT_TOKEN || '';
const ownerId = process.env.OWNER_DISCORD_ID || '';

if (!token) {
	console.error('Set DISCORD_BOT_TOKEN in the repo .env');
	process.exit(1);
}

function loadIdentity() {
	const file = path.join(repoRoot, 'config', 'identity.json');
	const identity = {
		...DEFAULT_IDENTITY,
		...(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {})
	};
	if (ownerId) identity.ownerDiscordId = ownerId;
	return identity;
}

function stripJsonFence(text) {
	return text.replace(/```json[\s\S]*?```/gi, '').replace(/\{[^{}]*"mood_change"[\s\S]*\}\s*$/m, '').trim();
}

async function askLlama(system, user) {
	const res = await fetch(llamaUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'eclipse',
			temperature: 0.7,
			max_tokens: 256,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			]
		})
	});
	if (!res.ok) {
		throw new Error(`llama.cpp ${res.status} ${await res.text()}`);
	}
	const data = await res.json();
	return String(data.choices?.[0]?.message?.content || '').trim();
}

function shouldReply(message, clientId) {
	if (message.author.bot) return false;
	if (!message.guild) return true;
	if (message.mentions.users.has(clientId)) return true;
	if (message.reference?.messageId && message.mentions.repliedUser?.id === clientId) return true;
	return false;
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent
	],
	partials: [Partials.Channel]
});

client.on('ready', () => {
	console.log(`Discord front is on as ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
	if (!client.user || !shouldReply(message, client.user.id)) return;

	const identity = loadIdentity();
	const speaker = speakerFromDiscord(message.author.id, identity);
	speaker.displayName = message.member?.displayName || message.author.globalName || message.author.username;

	try {
		await message.channel.sendTyping();
		const memoryRoot = path.join(repoRoot, 'data', 'memory');
		const mem = loadContextForSpeaker(speaker.memoryKey, {
			root: memoryRoot,
			identity,
			turnLimit: 8,
			factLimit: 6
		});
		const persona = fs.existsSync(generatedPromptPath)
			? fs.readFileSync(generatedPromptPath, 'utf8')
			: 'You are Mira.';
		const system = [
			persona,
			buildSpeakerPromptBlock({
				isOwner: speaker.isOwner,
				ownerName: identity.ownerName,
				displayName: speaker.displayName,
				recognized: mem.meta.recognized,
				turnCount: mem.meta.turnCount,
				facts: mem.facts,
				turns: mem.turns
			}),
			`<voice_lock>\n${YUE_VOICE_LOCK}\n</voice_lock>`
		].join('\n\n');

		const raw = await askLlama(system, message.content.replace(/<@!?(\d+)>/g, '').trim() || '...');
		let reply = stripJsonFence(raw) || '...Mnh.';
		if (!speaker.isOwner) {
			reply = stripAsteriskActions(reply) || '...Mnh.';
		}
		appendTurn({
			actorPersonKey: speaker.memoryKey,
			role: 'user',
			content: message.content,
			displayName: speaker.displayName,
			root: memoryRoot,
			identity
		});
		appendTurn({
			actorPersonKey: speaker.memoryKey,
			role: 'assistant',
			content: reply,
			root: memoryRoot,
			identity
		});

		const chunks = reply.match(/[\s\S]{1,1800}/g) || [reply];
		for (const chunk of chunks) await message.reply(chunk);
	} catch (error) {
		console.error(error);
		await message.reply('...Something is wrong. Wait.').catch(() => {});
	}
});

await client.login(token);

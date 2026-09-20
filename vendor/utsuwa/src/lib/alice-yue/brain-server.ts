import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { llamaHealthUrls, type BrainAction } from './brain-logic';

export function aliceYueRoot(): string {
	return process.env.DPU_ROOT || resolve(process.cwd(), '..', '..');
}

export async function probeLlama(baseUrl = 'http://127.0.0.1:8081/v1'): Promise<boolean> {
	for (const url of llamaHealthUrls(baseUrl)) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(800) });
			if (res.ok) return true;
		} catch {
			// try the next probe URL
		}
	}
	return false;
}

export function spawnBrainScript(action: BrainAction, discord = false): void {
	const scriptName = action === 'park' ? '11-park-brain.ps1' : '12-wake-brain.ps1';
	const script = resolve(aliceYueRoot(), 'scripts', scriptName);
	if (!existsSync(script)) {
		throw new Error(`Missing ${script}. Set DPU_ROOT or start Utsuwa via scripts/07-utsuwa-ui.ps1`);
	}

	const args = ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', script];
	if (action === 'wake' && discord) args.push('-Discord');

	const child = spawn('powershell.exe', args, {
		detached: true,
		stdio: 'ignore',
		windowsHide: false
	});
	child.unref();
}

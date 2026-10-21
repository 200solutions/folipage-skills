#!/usr/bin/env node
/**
 * Is this skill the newest version folipage offers? The skill runs it first
 * thing (SKILL.md, "First: version check"). It compares `metadata.version` in
 * this skill's SKILL.md with what folipage reports (GET /api/v1/skills/:name)
 * and prints one line for the agent:
 *
 *   OK …                the installed version is current
 *   UPDATE AVAILABLE …  folipage has a different version; recommend the download
 *   CHECK SKIPPED …     no answer (offline, folipage down, …); carry on
 *
 * It never stops the work: it always exits 0. No dependencies, Node.js 18+.
 * The same file is in every folipage skill; keep the copies identical.
 */
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const DEFAULT_URL = "https://app.folipage.com";

/** A value of the skill's folipage.env (put there when it was downloaded from folipage), if any. */
async function fromSkillEnv(name) {
	try {
		const text = await readFile(new URL("folipage.env", ROOT), "utf8");
		const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
		return line ? line.slice(name.length + 1).trim() : null;
	} catch {
		return null;
	}
}

async function main() {
	const skillMd = await readFile(new URL("SKILL.md", ROOT), "utf8");
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd)?.[1] ?? "";
	const name = /^name:\s*(\S+)\s*$/m.exec(front)?.[1];
	const installed = /^\s+version:\s*["']?([^"'\s]+)["']?\s*$/m.exec(front)?.[1];
	if (!name || !installed) {
		console.log("CHECK SKIPPED: SKILL.md has no name or metadata.version. Carry on.");
		return;
	}

	const base = (process.env.FOLIPAGE_URL || (await fromSkillEnv("FOLIPAGE_URL")) || DEFAULT_URL)
		.trim()
		.replace(/\/+$/, "");
	let latest;
	try {
		const res = await fetch(`${base}/api/v1/skills/${encodeURIComponent(name)}`, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		latest = await res.json();
	} catch (error) {
		console.log(
			`CHECK SKIPPED: could not ask ${base} for the current version of ${name} (${error.message}). Carry on with ${installed}.`,
		);
		return;
	}

	if (latest.version === installed) {
		console.log(`OK: ${name} ${installed} is the current version.`);
		return;
	}
	console.log(
		[
			`UPDATE AVAILABLE: ${name} ${installed} is installed, folipage offers ${latest.version}.`,
			`Recommend the user to download the new version (it comes with their API key inside) and replace this skill's folder with it: ${latest.download}`,
			"Then carry on with the installed version, unless the user wants to update first.",
		].join("\n"),
	);
}

main().catch((error) => {
	console.log(`CHECK SKIPPED: ${error.message}. Carry on.`);
});

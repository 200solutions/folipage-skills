#!/usr/bin/env node
/**
 * Voiceover for videos: OpenAI text-to-speech per segment, laid onto the video with ffmpeg.
 *
 *   node voiceover.mjs voices                                   the voices to choose from
 *   node voiceover.mjs languages                                the languages the voice speaks
 *   node voiceover.mjs say "<text>" [--out sample.wav]          one sample, to try a voice
 *   node voiceover.mjs synth <segments.json> [--out <dir>]      a WAV per segment and <dir>/durations.json
 *   node voiceover.mjs mix <video> <timeline.json> [--audio <dir>] [--out <file.mp4>]
 *   node voiceover.mjs transcribe <video> [--out timeline.json] [--source-lang en] [--lang de]
 *   node voiceover.mjs frames <video> [--every 2] [--out frames]
 *
 * Voice (say, synth; the segments file may set them too, the options win):
 *   --lang de       the language of the voice, required (or "language" in the file); any code from `languages`,
 *                   with a region if it matters: pt-BR, en-GB, es-MX, fr-CA
 *   --voice marin   --model gpt-4o-mini-tts   --instructions "…"
 * Mix:
 *   --original 0     volume of the video's own sound, 0–1 (0 drops it)
 *   --gap 0.3        seconds of quiet after a segment before the next one may start
 *   --max-tempo 1    a segment that does not fit is sped up to this factor before the picture is frozen
 *   --subs srt       srt (.srt and .vtt next to the video), embed (also a subtitle track), none
 *
 * Who speaks, from the environment or from a .env file in this or a parent directory:
 *   FOLIPAGE_TOKEN   a folipage API key (Profil › API › Nový klíč, "Čtení i úpravy"): the voice comes from
 *                    folipage and the organization's AI credits pay for it — no OpenAI key needed
 *   FOLIPAGE_ORG     which organization pays, by name, slug or id (only when the token sees several)
 *   FOLIPAGE_URL     the folipage console, https://app.folipage.com unless it runs elsewhere
 *   OPENAI_API_KEY   without a folipage token: straight to OpenAI on your own key
 * Needs Node.js 20+ and ffmpeg with ffprobe on PATH.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.openai.com/v1";
const FOLIPAGE = "https://app.folipage.com";
const DEFAULTS = { model: "gpt-4o-mini-tts", voice: "marin", gap: 0.3, maxTempo: 1, original: 0, subs: "srt" };

const VOICES = [
	["marin", "natural, higher voice — recommended"],
	["cedar", "natural, lower voice — recommended"],
	["coral", "warm, higher voice"],
	["sage", "calm, higher voice"],
	["nova", "bright, higher voice"],
	["shimmer", "soft, higher voice"],
	["ash", "clear, lower voice"],
	["ballad", "soft, lower voice"],
	["verse", "expressive, lower voice"],
	["onyx", "deep, lower voice"],
	["echo", "even, lower voice"],
	["fable", "lively, lower voice"],
	["alloy", "neutral, middle voice"],
];

/**
 * The languages OpenAI's speech and transcription models support (the Whisper
 * list), by ISO 639-1 code, with the ISO 639-2/T code for the MP4 subtitle
 * track's language tag. Others may work too, with a weaker accent.
 */
const LANGUAGES = {
	af: "afr", ar: "ara", az: "aze", be: "bel", bg: "bul", bs: "bos", ca: "cat", cs: "ces", cy: "cym", da: "dan",
	de: "deu", el: "ell", en: "eng", es: "spa", et: "est", fa: "fas", fi: "fin", fr: "fra", gl: "glg", he: "heb",
	hi: "hin", hr: "hrv", hu: "hun", hy: "hye", id: "ind", is: "isl", it: "ita", ja: "jpn", kk: "kaz", kn: "kan",
	ko: "kor", lt: "lit", lv: "lav", mi: "mri", mk: "mkd", mr: "mar", ms: "msa", ne: "nep", nl: "nld", no: "nor",
	pl: "pol", pt: "por", ro: "ron", ru: "rus", sk: "slk", sl: "slv", sr: "srp", sv: "swe", sw: "swa", ta: "tam",
	th: "tha", tl: "tgl", tr: "tur", uk: "ukr", ur: "urd", vi: "vie", zh: "zho",
};

/** Where a language's stress falls, for the languages a foreign accent most often gets wrong. */
const STRESS = {
	cs: "Stress the first syllable of each word, as Czech does, and keep the long vowels long.",
	sk: "Stress the first syllable of each word, as Slovak does, and keep the long vowels long.",
	hu: "Stress the first syllable of each word, as Hungarian does, and keep the long vowels long.",
	pl: "Stress the second-to-last syllable of each word, as Polish does.",
	fi: "Stress the first syllable of each word, as Finnish does, and keep the long vowels and double consonants long.",
};

/** Whisper limit for one upload. */
const MAX_UPLOAD = 25 * 1024 * 1024;

/* ------------------------------------------------------------------ setup */

function fail(message, code = 1) {
	console.error(`voiceover: ${message}`);
	process.exit(code);
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
		else args._.push(a);
	}
	return args;
}

function readJson(file) {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		fail(`Cannot read ${file}: ${error.message}`);
	}
}

/** Runs a tool and returns its stdout; a failure ends with the tail of its stderr. */
function tool(cmd, args) {
	const out = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	if (out.error?.code === "ENOENT") fail(`${cmd} is not installed. Install ffmpeg (macOS: brew install ffmpeg, Debian/Ubuntu: apt install ffmpeg).`, 2);
	if (out.status !== 0) throw new Error(`${cmd} failed:\n${(out.stderr || "").trim().split("\n").slice(-12).join("\n")}`);
	return out.stdout;
}

const ffmpeg = (args) => tool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

function duration(file) {
	const value = Number(tool("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
	if (!Number.isFinite(value)) throw new Error(`ffprobe cannot tell how long ${file} is.`);
	return value;
}

function hasAudio(file) {
	return tool("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]).trim() !== "";
}

function frameRate(file) {
	const [num, den] = tool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", file])
		.trim()
		.split("/")
		.map(Number);
	const fps = den ? num / den : num;
	return Number.isFinite(fps) && fps > 1 && fps <= 120 ? Math.round(fps) : 30;
}

/**
 * folipage.env next to SKILL.md: a skill downloaded from folipage carries the
 * user's API key there (FOLIPAGE_TOKEN, FOLIPAGE_URL, FOLIPAGE_ORG).
 */
const SKILL_ENV = join(dirname(dirname(fileURLToPath(import.meta.url))), "folipage.env");

/**
 * A variable from the environment, else from the nearest .env up the tree,
 * else from the skill's own folipage.env. Secrets in them are never printed.
 */
function setting(name) {
	if (process.env[name]?.trim()) return process.env[name].trim();
	const pattern = new RegExp(`^\\s*(export\\s+)?${name}\\s*=`);
	const fromFile = (file) => {
		if (!existsSync(file)) return undefined;
		const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => pattern.test(l));
		return line ? line.split("=").slice(1).join("=").trim().replace(/^(['"])(.*)\1$/, "$2") || undefined : undefined;
	};
	let dir = process.cwd();
	for (let i = 0; i < 8; i++) {
		const value = fromFile(join(dir, ".env"));
		if (value) return value;
		const up = dirname(dir);
		if (up === dir) break;
		dir = up;
	}
	return fromFile(SKILL_ENV);
}

/**
 * Who speaks: folipage with an API token (the organization's credits pay, no
 * OpenAI key needed), else OpenAI with the user's own key. Decided once.
 */
let chosen;
function backend() {
	if (chosen) return chosen;
	const token = setting("FOLIPAGE_TOKEN");
	if (token) {
		if (!/^folipage_pat_/.test(token)) fail("FOLIPAGE_TOKEN is not a folipage API token (they start with folipage_pat_).", 2);
		const base = (setting("FOLIPAGE_URL") ?? FOLIPAGE).replace(/\/+$/, "");
		chosen = { kind: "folipage", token, base };
	} else if (setting("OPENAI_API_KEY")) {
		chosen = { kind: "openai", key: setting("OPENAI_API_KEY") };
	} else {
		fail(
			"Nobody to speak. Easiest: a folipage API key — in folipage open Profil › API › Nový klíč, choose " +
				'"Čtení i úpravy" without limiting it to portals, and put FOLIPAGE_TOKEN=… into a .env file ' +
				"in the working directory; the organization's AI credits pay for the voice. Or set OPENAI_API_KEY to use your own OpenAI key.",
			2,
		);
	}
	return chosen;
}

/** What the backend is called in the messages to the user. */
const backendName = () => (backend().kind === "folipage" ? "folipage" : "OpenAI");

async function openai(path, init) {
	const key = backend().key;
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers } });
		if (res.ok) return res;
		const body = await res.text();
		const message = (() => {
			try {
				return JSON.parse(body).error?.message ?? body;
			} catch {
				return body;
			}
		})();
		if (res.status === 401) fail("OpenAI refused the key (401). Check OPENAI_API_KEY.", 2);
		if ((res.status === 429 || res.status >= 500) && attempt < 4 && !/quota/i.test(message)) {
			await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
			continue;
		}
		throw new Error(`OpenAI ${res.status}: ${message.slice(0, 400)}`);
	}
}

/** One call to the folipage API with the token; its refusals end the run with folipage's own sentence. */
async function folipage(path, init = {}) {
	const { token, base } = backend();
	for (let attempt = 0; ; attempt++) {
		let res;
		try {
			res = await fetch(`${base}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
		} catch (error) {
			if (attempt < 3) {
				await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
				continue;
			}
			throw new Error(`folipage at ${base} is unreachable: ${error.message}`);
		}
		if (res.ok) return res;
		const body = await res.json().catch(() => ({}));
		const said = body.message ? ` ${body.message}` : "";
		if (res.status === 401) fail("folipage refused the token (401): it may have expired or been revoked. Create a new one in Profil › API.", 2);
		if (body.error === "token_read_only") fail('The folipage key can only read. Create one with "Čtení i úpravy" in Profil › API.', 2);
		if (res.status === 403 && body.error === "token_forbidden")
			fail(`folipage refused the token:${said} The voice is paid by the organization, so the token must not be limited to portals.`, 2);
		if (res.status === 403) fail(`folipage refused:${said || " the token's user needs to be at least an editor in the organization."}`, 2);
		if (res.status === 429 && body.error === "limit") fail(`The organization is out of AI credits:${said}`, 3);
		if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < 4) {
			await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
			continue;
		}
		throw new Error(`folipage ${res.status}:${said || ` ${body.error ?? "error"}`}`);
	}
}

/** The organization whose credits pay: FOLIPAGE_ORG (name, slug or id), or the only one the token sees. */
let paying;
function folipageOrg() {
	// Asked once, however many lines are being spoken at the same time.
	paying ??= findOrg();
	return paying;
}

async function findOrg() {
	const { organizations = [] } = await (await folipage("/orgs")).json();
	const wanted = setting("FOLIPAGE_ORG");
	const list = () => organizations.map((o) => `  ${o.name} (${o.slug})`).join("\n");
	let org;
	if (wanted) {
		const w = wanted.toLowerCase();
		org = organizations.find((o) => o.id === wanted || o.slug === w || o.name.toLowerCase() === w);
		if (!org) fail(`The token sees no organization "${wanted}". It sees:\n${list()}`, 2);
	} else if (organizations.length === 1) {
		[org] = organizations;
	} else if (!organizations.length) {
		fail("The token's user is in no organization.", 2);
	} else {
		fail(`The token sees several organizations; ask the user which one pays and set FOLIPAGE_ORG to its slug:\n${list()}`, 2);
	}
	console.log(`Voice from folipage, paid by the AI credits of "${org.name}".`);
	return org;
}

/* ------------------------------------------------------------------ voice */

/** The primary language of a tag: "pt-BR" → "pt". */
const primary = (lang) => lang.split("-")[0];

/**
 * The language tag in its canonical form ("pt-br" → "pt-BR"). There is no
 * default: the voice speaks what the user chose, so a missing one is an error.
 */
function languageTag(value, where = "--lang") {
	if (!value) {
		fail(
			'Which language should the voice speak? Ask the user, then pass --lang <code> or set "language" in the file ' +
				"(`node voiceover.mjs languages` lists them).",
		);
	}
	let tag;
	try {
		[tag] = Intl.getCanonicalLocales(String(value).replace(/_/g, "-"));
	} catch {
		fail(`${where} "${value}" is not a language code; use e.g. de, fr, pt-BR (see \`languages\`).`);
	}
	if (!LANGUAGES[primary(tag)]) {
		console.warn(`Warning: ${languageName(tag)} (${tag}) is not on OpenAI's list of supported languages; try one line with \`say\` first.`);
	}
	return tag;
}

const languageName = (lang) => {
	try {
		return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? lang;
	} catch {
		return lang;
	}
};

/** How the voice should speak, unless the user or the segments file says otherwise. */
function defaultInstructions(lang) {
	const name = languageName(lang);
	const stress = STRESS[primary(lang)] ? ` ${STRESS[primary(lang)]}` : "";
	return (
		`Speak natural, native ${name} with correct ${name} pronunciation and no foreign accent.${stress} ` +
		"Calm, clear and friendly, at an unhurried pace, like a trainer walking someone through an application. " +
		"Do not sound like an advert."
	);
}

function voiceSettings(args, data = {}) {
	const lang = languageTag(args.lang ?? data.language, args.lang ? "--lang" : '"language"');
	const model = args.model ?? data.model ?? DEFAULTS.model;
	if (backend().kind === "folipage" && model !== DEFAULTS.model)
		console.warn(`Warning: folipage speaks with ${DEFAULTS.model} only; "${model}" is ignored.`);
	return {
		lang,
		model: backend().kind === "folipage" ? DEFAULTS.model : model,
		voice: args.voice ?? data.voice ?? DEFAULTS.voice,
		instructions: args.instructions ?? data.instructions ?? defaultInstructions(lang),
	};
}

/** Swaps words the voice gets wrong for how they sound ("Folipage" → "Folipejdž"); whole words only. */
function pronounce(text, map = {}) {
	const pairs = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
	return pairs.reduce((out, [from, to]) => {
		const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), to);
	}, text);
}

async function speak(text, settings) {
	if (backend().kind === "folipage") {
		const org = await folipageOrg();
		const res = await folipage(`/orgs/${org.id}/voice/speech`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text, voice: settings.voice, instructions: settings.instructions }),
		});
		return Buffer.from(await res.arrayBuffer());
	}
	const body = { model: settings.model, voice: settings.voice, input: text, response_format: "wav" };
	// Only the gpt-* speech models take instructions; tts-1 rejects them.
	if (/^gpt-/.test(settings.model)) body.instructions = settings.instructions;
	const res = await openai("/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	return Buffer.from(await res.arrayBuffer());
}

/** The raw TTS output, trimmed of silence at both ends and resampled for mixing. */
function polish(raw, out) {
	const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05";
	ffmpeg(["-i", raw, "-af", `${trim},areverse,${trim},areverse`, "-ar", "48000", "-ac", "1", out]);
}

async function synthOne(text, file, settings) {
	const raw = `${file}.raw.wav`;
	writeFileSync(raw, await speak(text, settings));
	try {
		polish(raw, file);
	} finally {
		rmSync(raw, { force: true });
	}
	return duration(file);
}

/* ----------------------------------------------------------------- voices */

function languages() {
	const names = Object.entries(LANGUAGES)
		.map(([code]) => [code, languageName(code)])
		.sort((a, b) => a[1].localeCompare(b[1], "en"));
	console.log(`Languages of OpenAI's voices (${names.length}); any voice speaks all of them. Add a region where it matters (pt-BR, en-GB, es-MX, fr-CA):\n`);
	for (const [code, name] of names) console.log(`  ${code.padEnd(4)} ${name}`);
}

function voices() {
	console.log("Voices for gpt-4o-mini-tts (each one speaks any language; try two or three with `say`):\n");
	for (const [name, note] of VOICES) console.log(`  ${name.padEnd(8)} ${note}`);
}

/* -------------------------------------------------------------------- say */

async function say(text, args) {
	const settings = voiceSettings(args);
	const out = resolve(args.out ?? `voice-sample-${settings.voice}.wav`);
	mkdirSync(dirname(out), { recursive: true });
	const seconds = await synthOne(pronounce(text, args.pronounce ? JSON.parse(args.pronounce) : {}), out, settings);
	console.log(`${out}  (${seconds.toFixed(1)} s, voice ${settings.voice}, ${settings.model})`);
	if (process.platform === "darwin") console.log(`Listen: afplay "${out}"`);
}

/* ------------------------------------------------------------------ synth */

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

function checkSegments(data, file) {
	const segments = data.segments;
	if (!Array.isArray(segments) || !segments.length) fail(`${file} has no "segments".`);
	const seen = new Set();
	for (const [i, s] of segments.entries()) {
		if (!s.id || !SAFE_ID.test(s.id)) fail(`Segment ${i + 1} needs an "id" of letters, digits, dots, dashes or underscores.`);
		if (seen.has(s.id)) fail(`Segment id "${s.id}" is used twice.`);
		seen.add(s.id);
		if (!String(s.text ?? "").trim()) fail(`Segment "${s.id}" has no "text".`);
	}
	return segments;
}

async function synth(file, args) {
	const path = resolve(file);
	const data = readJson(path);
	const segments = checkSegments(data, file);
	const settings = voiceSettings(args, data);
	const outDir = resolve(args.out ?? join(dirname(path), "audio"));
	mkdirSync(outDir, { recursive: true });

	const long = segments.filter((s) => s.text.length > 600);
	if (long.length) console.warn(`Warning: ${long.map((s) => s.id).join(", ")} are over 600 characters; shorter segments sync better.`);

	console.log(`Voice ${settings.voice}, ${settings.model}, language ${settings.lang} → ${outDir}`);
	const durations = {};
	let sent = 0;
	let reused = 0;
	const queue = [...segments];
	const worker = async () => {
		for (let s = queue.shift(); s; s = queue.shift()) {
			const input = pronounce(s.text.trim(), data.pronounce);
			const key = createHash("sha256").update(JSON.stringify([settings.model, settings.voice, settings.instructions, input])).digest("hex").slice(0, 16);
			const wav = join(outDir, `${s.id}.wav`);
			const metaFile = join(outDir, `${s.id}.json`);
			const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : null;
			if (meta?.key === key && existsSync(wav)) {
				durations[s.id] = meta.duration;
				reused++;
				console.log(`  = ${s.id.padEnd(28)} ${meta.duration.toFixed(1).padStart(5)} s  (unchanged)`);
				continue;
			}
			const seconds = await synthOne(input, wav, settings);
			sent += input.length;
			durations[s.id] = Math.round(seconds * 1000) / 1000;
			writeFileSync(metaFile, `${JSON.stringify({ key, duration: durations[s.id], text: s.text, spoken: input }, null, "\t")}\n`);
			console.log(`  ✓ ${s.id.padEnd(28)} ${seconds.toFixed(1).padStart(5)} s`);
		}
	};
	await Promise.all(Array.from({ length: 3 }, worker));

	const ordered = Object.fromEntries(segments.map((s) => [s.id, durations[s.id]]));
	writeFileSync(join(outDir, "durations.json"), `${JSON.stringify(ordered, null, "\t")}\n`);
	const total = Object.values(ordered).reduce((a, b) => a + b, 0);
	console.log(
		`\n${segments.length} segments, ${total.toFixed(1)} s of speech; ${segments.length - reused} generated (${sent} characters sent to ${backendName()}), ${reused} reused.` +
			`\nDurations: ${join(outDir, "durations.json")}`,
	);
}

/* -------------------------------------------------------------------- mix */

/**
 * Where the picture has to wait for the voice. Each segment may speak from its
 * start until the next one starts (the last one until the video ends). When
 * its audio is longer, it is first sped up (up to maxTempo) and then the
 * picture is frozen at the segment's end for the rest.
 */
function plan(segments, videoLength, { gap, maxTempo }) {
	let shift = 0;
	return segments.map((s, i) => {
		const slotEnd = i + 1 < segments.length ? segments[i + 1].start : videoLength;
		const slot = Math.max(0, slotEnd - s.start);
		let tempo = 1;
		if (s.audioLength + gap > slot && slot > gap) tempo = Math.min(maxTempo, s.audioLength / (slot - gap));
		tempo = Math.max(1, tempo);
		const spoken = s.audioLength / tempo;
		const freeze = Math.max(0, spoken + gap - slot);
		const freezeAt = Math.min(slotEnd, Math.max(s.start, s.end ?? slotEnd));
		const out = { ...s, tempo, spoken, freeze, freezeAt, newStart: s.start + shift };
		shift += freeze;
		return out;
	});
}

/** One cue per up to two lines of ~42 characters; longer text is split with its time shared by length. */
function cues(planned) {
	const out = [];
	for (const s of planned) {
		const words = s.text.trim().split(/\s+/);
		const chunks = [];
		let line = "";
		for (const w of words) {
			if (line && `${line} ${w}`.length > 84) {
				chunks.push(line);
				line = w;
			} else line = line ? `${line} ${w}` : w;
		}
		if (line) chunks.push(line);
		const chars = chunks.reduce((a, c) => a + c.length, 0);
		let t = s.newStart;
		for (const c of chunks) {
			const length = (s.spoken * c.length) / chars;
			out.push({ start: t, end: t + length, text: wrap(c) });
			t += length;
		}
	}
	return out;
}

function wrap(text) {
	if (text.length <= 42) return text;
	const mid = text.length / 2;
	let best = -1;
	for (let i = 0; i < text.length; i++) if (text[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
	return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

const stamp = (t, sep) => {
	const ms = Math.max(0, Math.round(t * 1000));
	const pad = (n, l = 2) => String(n).padStart(l, "0");
	return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
};

const srt = (list) => list.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n");
const vtt = (list) => `WEBVTT\n\n${list.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`;

/** atempo takes 0.5–2 per filter; chain it for anything beyond. */
function atempo(factor) {
	const parts = [];
	let f = factor;
	while (f > 2) {
		parts.push("atempo=2");
		f /= 2;
	}
	if (Math.abs(f - 1) > 0.001) parts.push(`atempo=${f.toFixed(4)}`);
	return parts;
}

function mix(video, timelineFile, args) {
	const videoPath = resolve(video);
	const timelinePath = resolve(timelineFile);
	if (!existsSync(videoPath)) fail(`No video at ${videoPath}`);
	const data = readJson(timelinePath);
	const audioDir = resolve(args.audio ?? join(dirname(timelinePath), "audio"));
	const options = {
		gap: Number(args.gap ?? DEFAULTS.gap),
		maxTempo: Math.max(1, Number(args.maxTempo ?? DEFAULTS.maxTempo)),
		original: Math.min(1, Math.max(0, Number(args.original ?? DEFAULTS.original))),
		subs: args.subs ?? DEFAULTS.subs,
	};
	if (!["srt", "embed", "none"].includes(options.subs)) fail(`--subs is srt, embed or none, not "${options.subs}".`);

	const videoLength = duration(videoPath);
	const segments = checkSegments(data, timelineFile)
		.map((s) => {
			if (typeof s.start !== "number") fail(`Segment "${s.id}" has no "start" (seconds into the video).`);
			if (s.start >= videoLength) fail(`Segment "${s.id}" starts at ${s.start} s, after the video ends (${videoLength.toFixed(1)} s).`);
			const wav = join(audioDir, `${s.id}.wav`);
			if (!existsSync(wav)) fail(`No audio for "${s.id}" in ${audioDir}. Run synth on this timeline first.`);
			return { ...s, wav, audioLength: duration(wav) };
		})
		.sort((a, b) => a.start - b.start);

	const planned = plan(segments, videoLength, options);
	const fps = frameRate(videoPath);
	const minPiece = 2 / fps;

	// The picture: cut at every freeze point, hold the last frame of each piece, join again.
	const holds = new Map();
	for (const p of planned) {
		if (p.freeze < 0.01) continue;
		const at = Math.round(p.freezeAt * 1000) / 1000;
		holds.set(at, (holds.get(at) ?? 0) + p.freeze);
	}
	const points = [...holds.keys()].sort((a, b) => a - b);
	const pieces = [];
	let from = 0;
	for (const at of points) {
		const to = Math.min(videoLength, Math.max(at, from + minPiece));
		pieces.push({ from, to, pad: holds.get(at) });
		from = to;
	}
	if (videoLength - from >= minPiece || !pieces.length) pieces.push({ from, to: videoLength, pad: 0 });
	else pieces[pieces.length - 1].to = videoLength;
	const finalLength = videoLength + [...holds.values()].reduce((a, b) => a + b, 0);

	const graph = [];
	const k = pieces.length;
	graph.push(`[0:v]fps=${fps},split=${k}${pieces.map((_, i) => `[p${i}]`).join("")}`);
	pieces.forEach((p, i) => {
		const pad = p.pad > 0 ? `,tpad=stop_mode=clone:stop_duration=${p.pad.toFixed(3)}` : "";
		graph.push(`[p${i}]trim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},setpts=PTS-STARTPTS${pad}[v${i}]`);
	});
	graph.push(`${pieces.map((_, i) => `[v${i}]`).join("")}concat=n=${k}:v=1:a=0,format=yuv420p[vout]`);

	// The sound: each segment at its new start, the video's own sound (if kept) cut the same way.
	const voiceLabels = planned.map((p, i) => {
		const filters = [...atempo(p.tempo), `adelay=delays=${Math.round(p.newStart * 1000)}:all=1`];
		graph.push(`[${i + 1}:a]${filters.join(",")}[a${i}]`);
		return `[a${i}]`;
	});
	const mixInputs = [...voiceLabels];
	if (options.original > 0 && hasAudio(videoPath)) {
		graph.push(`[0:a]asplit=${k}${pieces.map((_, i) => `[q${i}]`).join("")}`);
		pieces.forEach((p, i) => {
			const pad = p.pad > 0 ? `,apad=pad_dur=${p.pad.toFixed(3)}` : "";
			graph.push(`[q${i}]atrim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},asetpts=PTS-STARTPTS${pad}[o${i}]`);
		});
		graph.push(`${pieces.map((_, i) => `[o${i}]`).join("")}concat=n=${k}:v=0:a=1,volume=${options.original}[orig]`);
		mixInputs.push("[orig]");
	}
	graph.push(
		`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=longest:normalize=0,` +
			`apad=whole_dur=${finalLength.toFixed(3)},atrim=end=${finalLength.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`,
	);

	const lang = languageTag(data.language ?? args.lang, '"language"');
	const base = videoPath.slice(0, -extname(videoPath).length);
	const out = resolve(args.out ?? `${base}.${lang}.mp4`);
	if (out === videoPath) fail("--out must not overwrite the source video.");
	const outBase = out.slice(0, -extname(out).length);
	mkdirSync(dirname(out), { recursive: true });

	const cueList = cues(planned);
	if (options.subs !== "none") {
		writeFileSync(`${outBase}.srt`, srt(cueList));
		writeFileSync(`${outBase}.vtt`, vtt(cueList));
	}

	const inputs = ["-i", videoPath, ...planned.flatMap((p) => ["-i", p.wav])];
	const maps = ["-map", "[vout]", "-map", "[aout]"];
	const subs = [];
	if (options.subs === "embed") {
		inputs.push("-i", `${outBase}.srt`);
		maps.push("-map", `${planned.length + 1}:s`);
		subs.push("-c:s", "mov_text", ...(LANGUAGES[primary(lang)] ? ["-metadata:s:s:0", `language=${LANGUAGES[primary(lang)]}`] : []));
	}
	console.log(`Mixing ${planned.length} segments onto ${relative(process.cwd(), videoPath)} …`);
	ffmpeg([
		...inputs,
		"-filter_complex",
		graph.join(";\n"),
		...maps,
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		...subs,
		"-movflags",
		"+faststart",
		out,
	]);

	const timeline = {
		...data,
		video: relative(dirname(outBase), out),
		duration: Math.round(finalLength * 1000) / 1000,
		segments: planned.map((p) => ({
			id: p.id,
			text: p.text,
			start: Math.round(p.newStart * 1000) / 1000,
			end: Math.round((p.newStart + p.spoken) * 1000) / 1000,
		})),
	};
	writeFileSync(`${outBase}.timeline.json`, `${JSON.stringify(timeline, null, "\t")}\n`);

	const frozen = planned.filter((p) => p.freeze >= 0.01);
	const faster = planned.filter((p) => p.tempo > 1.001);
	console.log(`\n✓ ${out}  (${finalLength.toFixed(1)} s, was ${videoLength.toFixed(1)} s)`);
	if (options.subs !== "none") console.log(`  subtitles: ${outBase}.srt, ${outBase}.vtt${options.subs === "embed" ? " (also inside the MP4)" : ""}`);
	if (frozen.length)
		console.log(`  picture held for the voice: ${frozen.map((p) => `${p.id} +${p.freeze.toFixed(1)} s at ${p.freezeAt.toFixed(1)} s`).join(", ")}`);
	if (faster.length) console.log(`  sped up: ${faster.map((p) => `${p.id} ×${p.tempo.toFixed(2)}`).join(", ")}`);
}

/* ------------------------------------------------------------- transcribe */

async function transcribe(video, args) {
	const videoPath = resolve(video);
	if (!existsSync(videoPath)) fail(`No video at ${videoPath}`);
	if (!hasAudio(videoPath)) fail("The video has no sound to transcribe. Use `frames` and write the timeline by hand.");
	const work = mkdtempSync(join(tmpdir(), "voiceover-"));
	try {
		const mp3 = join(work, "speech.mp3");
		// 32 kbit/s mono is plenty for speech, and what folipage expects when it estimates the credits.
		ffmpeg(["-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", mp3]);
		const size = statSync(mp3).size;
		if (size > MAX_UPLOAD) fail(`The speech track is ${(size / 1048576).toFixed(0)} MB; Whisper takes 25 MB (about 100 minutes). Cut the video into parts.`);
		// Whisper takes the bare ISO 639-1 code.
		const sourceLang = args.sourceLang ? primary(languageTag(args.sourceLang, "--source-lang")) : undefined;
		const target = args.lang ? languageTag(args.lang) : undefined;
		console.log(`Transcribing with whisper-1 (${backendName()}) …`);
		let result;
		if (backend().kind === "folipage") {
			const org = await folipageOrg();
			const query = sourceLang ? `?language=${sourceLang}` : "";
			result = await (
				await folipage(`/orgs/${org.id}/voice/transcribe${query}`, {
					method: "POST",
					headers: { "Content-Type": "audio/mpeg" },
					body: readFileSync(mp3),
				})
			).json();
		} else {
			const form = new FormData();
			form.append("file", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), "speech.mp3");
			form.append("model", "whisper-1");
			form.append("response_format", "verbose_json");
			form.append("timestamp_granularities[]", "segment");
			if (sourceLang) form.append("language", sourceLang);
			result = await (await openai("/audio/transcriptions", { method: "POST", body: form })).json();
		}
		const out = resolve(args.out ?? `${videoPath.slice(0, -extname(videoPath).length)}.timeline.json`);
		const round = (n) => Math.round(n * 1000) / 1000;
		const timeline = {
			video: relative(dirname(out), videoPath),
			duration: round(result.duration ?? duration(videoPath)),
			sourceLanguage: result.language,
			...(target ? { language: target } : {}),
			segments: (result.segments ?? []).map((s, i) => ({
				id: `s${String(i + 1).padStart(3, "0")}`,
				start: round(s.start),
				end: round(s.end),
				source: s.text.trim(),
				text: s.text.trim(),
			})),
		};
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, `${JSON.stringify(timeline, null, "\t")}\n`);
		console.log(
			`✓ ${out}\n  ${timeline.segments.length} segments in ${result.language}.` +
				(target
					? ` Translate each "text" into ${languageName(target)}; keep "start", "end" and "source".`
					: ' To dub it, ask the user for the target language, set "language" and translate each "text".'),
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

/* ----------------------------------------------------------------- frames */

function frames(video, args) {
	const videoPath = resolve(video);
	if (!existsSync(videoPath)) fail(`No video at ${videoPath}`);
	const every = Number(args.every ?? 2);
	const out = resolve(args.out ?? "frames");
	mkdirSync(out, { recursive: true });
	ffmpeg(["-i", videoPath, "-vf", `fps=1/${every},scale=960:-2`, "-q:v", "4", join(out, "frame-%04d.jpg")]);
	const files = readdirSync(out).filter((f) => /^frame-\d+\.jpg$/.test(f)).sort();
	console.log(`${files.length} frames, one every ${every} s, in ${out}:`);
	for (const [i, f] of files.entries()) console.log(`  ${f}  ≈ ${(i * every).toFixed(1)} s`);
}

/* ------------------------------------------------------------------- main */

const args = parseArgs(process.argv.slice(2));
const [command, a, b] = args._;
const usage = () => console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*?/, "").replace(/^ \* ?/gm, ""));
try {
	if (command === "voices") voices();
	else if (command === "languages") languages();
	else if (command === "say" && a) await say(a, args);
	else if (command === "synth" && a) await synth(a, args);
	else if (command === "mix" && a && b) mix(a, b, args);
	else if (command === "transcribe" && a) await transcribe(a, args);
	else if (command === "frames" && a) frames(a, args);
	else {
		usage();
		process.exit(command ? 1 : 0);
	}
} catch (error) {
	fail(error.message);
}

#!/usr/bin/env node
/**
 * Screen recordings of a web app, played from a script, with a visible cursor.
 *
 *   node record.mjs login     <url> [--until <regex>]       the user signs in by hand once; the session is kept
 *   node record.mjs inspect   <url>                         what a page offers, plus a screenshot to look at
 *   node record.mjs narration <video.json> [--out file]     the narration as segments, for folipage-video-voiceover synth
 *   node record.mjs record    <video.json> [--only id] [--durations audio/durations.json]
 *
 * Options:
 *   --state <file>       session file (default .folipage-screen-video/state.json)
 *   --durations <file>   seconds per narration segment; each one is held exactly that long
 *   --headed             show the browser while recording (timing is less even)
 *   --keep-frames        keep the raw frames in .folipage-screen-video/frames/
 *
 * Writes <outDir>/<id>.mp4 (H.264, no sound) and <outDir>/<id>.timeline.json.
 * Needs ffmpeg on PATH and Playwright, looked up next to this script, then in
 * ./.folipage-screen-video, ./.folipage-tutorial and the current directory:
 *
 *   npm install --prefix .folipage-screen-video playwright
 *   (cd .folipage-screen-video && npx playwright install chromium)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STAGE = readFileSync(join(HERE, "stage.js"), "utf8");
const WORK = resolve(".folipage-screen-video");

const DEFAULTS = {
	viewport: { width: 1280, height: 720 },
	scale: 1.5,
	fps: 30,
	colorScheme: "light",
	locale: "cs-CZ",
	typingDelay: 70,
	pace: 700,
	lead: 0.8,
	tail: 1.2,
	gap: 0.35,
	charsPerSecond: 14,
};

/* ------------------------------------------------------------------ setup */

async function loadPlaywright() {
	try {
		return await import("playwright");
	} catch {
		// Not installed next to the skill: look where the user works.
	}
	for (const base of [WORK, resolve(".folipage-tutorial"), process.cwd()]) {
		try {
			return createRequire(join(base, "noop.js"))("playwright");
		} catch {
			// Not here either: try the next place.
		}
	}
	fail(
		"Playwright is not installed. Run:\n" +
			"  npm install --prefix .folipage-screen-video playwright\n" +
			"  (cd .folipage-screen-video && npx playwright install chromium)",
		2,
	);
}

function fail(message, code = 1) {
	console.error(`record: ${message}`);
	process.exit(code);
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--headed") args.headed = true;
		else if (a === "--keep-frames") args.keepFrames = true;
		else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.timeOrigin + performance.now();

async function openContext(pw, { headed, state, config = {} }) {
	const browser = await pw.chromium.launch({ headless: !headed });
	const context = await browser.newContext({
		viewport: config.viewport ?? DEFAULTS.viewport,
		deviceScaleFactor: config.scale ?? DEFAULTS.scale,
		colorScheme: config.colorScheme ?? DEFAULTS.colorScheme,
		locale: config.locale ?? DEFAULTS.locale,
		...(state && existsSync(state) ? { storageState: state } : {}),
	});
	context.setDefaultTimeout(15000);
	const stageConfig = {
		mask: config.mask ?? [],
		hide: config.hide ?? [],
		replaceText: config.replaceText ?? [],
		ringColor: config.ringColor ?? "#111111",
		cursor: config.cursor ?? true,
		hideScrollbars: config.hideScrollbars ?? true,
	};
	await context.addInitScript({ content: `window.__stageConfig = ${JSON.stringify(stageConfig)};\n${STAGE}` });
	return { browser, context };
}

/** Waits until the page stops moving: network, fonts, a frame to paint. */
async function settle(page) {
	await page.waitForLoadState("load").catch(() => {});
	await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
	await page.evaluate(() => document.fonts?.ready).catch(() => {});
	await page.waitForTimeout(150);
}

/* --------------------------------------------------------------- targets */

/**
 * A target is a Playwright selector string, or an object:
 * { role, name } | { label } | { placeholder } | { text } | { testId } | { css },
 * optionally with { exact, nth, within: <target>, frame: "<iframe selector>" }. Same as folipage-tutorial's flows.
 */
function locate(page, target) {
	if (typeof target === "string") return page.locator(target).filter({ visible: true });
	// `frame` reaches into an iframe (also cross-origin); `within` inherits it.
	const root = target.frame ? page.frameLocator(target.frame) : page;
	const base = target.within ? locate(page, { frame: target.frame, ...target.within }) : root;
	const exact = target.exact ?? false;
	let loc;
	if (target.role) loc = base.getByRole(target.role, target.name ? { name: target.name, exact } : {});
	else if (target.label) loc = base.getByLabel(target.label, { exact });
	else if (target.placeholder) loc = base.getByPlaceholder(target.placeholder, { exact });
	else if (target.text) loc = base.getByText(target.text, { exact });
	else if (target.testId) loc = base.getByTestId(target.testId);
	else if (target.css) loc = base.locator(target.css);
	else throw new Error(`Unknown target ${JSON.stringify(target)}`);
	loc = loc.filter({ visible: true });
	return typeof target.nth === "number" ? loc.nth(target.nth) : loc;
}

const describe = (target) => (typeof target === "string" ? target : JSON.stringify(target));

/** Exactly one visible element, or an error that says how to fix the target. */
async function one(page, target, timeout = 10000) {
	const loc = locate(page, target);
	await loc.first().waitFor({ state: "visible", timeout }).catch(() => {});
	const count = await loc.count();
	if (!count) throw new Error(`No visible element matches ${describe(target)}. Run \`record.mjs inspect\` on the page to see what is there.`);
	if (count > 1) throw new Error(`${count} visible elements match ${describe(target)}; narrow it with "exact", "within" or "nth".`);
	return loc;
}

/* ---------------------------------------------------------------- inspect */

async function inspect(pw, url, args) {
	const { browser, context } = await openContext(pw, { headed: args.headed, state: args.state ?? join(WORK, "state.json"), config: { cursor: false } });
	const page = await context.newPage();
	await page.goto(url, { waitUntil: "load" });
	await settle(page);
	const info = await page.evaluate(() => {
		const visible = (el) => {
			const box = el.getBoundingClientRect();
			const s = getComputedStyle(el);
			return box.width > 0 && box.height > 0 && s.visibility !== "hidden" && s.display !== "none";
		};
		const text = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 80);
		const all = (selector) => [...document.querySelectorAll(selector)].filter(visible);
		const unique = (items) => [...new Set(items)];
		return {
			url: location.href,
			title: document.title,
			headings: all("h1, h2, h3").map((h) => `${h.tagName.toLowerCase()} ${text(h)}`),
			links: unique(all("a[href]").map((a) => `${text(a)}  →  ${a.getAttribute("href")}`)).slice(0, 50),
			buttons: unique(all("button, [role=button], input[type=submit]").map((b) => text(b) || "(icon only)")).slice(0, 40),
			tabs: unique(all("[role=tab], [role=menuitem]").map(text)).slice(0, 30),
			fields: all("input:not([type=hidden]), textarea, select").map(
				(f) => `${f.tagName.toLowerCase()}${f.type ? `[${f.type}]` : ""} "${(f.labels?.[0]?.innerText || f.getAttribute("aria-label") || f.placeholder || f.name || "").trim()}"`,
			),
		};
	});
	mkdirSync(join(WORK, "inspect"), { recursive: true });
	const shot = join(WORK, "inspect", `${new URL(page.url()).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}.png`);
	await page.screenshot({ path: shot });
	await browser.close();
	const list = (title, rows) => rows.length && console.log(`\n${title}:\n${rows.map((r) => `  - ${r}`).join("\n")}`);
	console.log(`\nURL: ${info.url}\nTitle: ${info.title}`);
	list("Headings", info.headings);
	list("Buttons", info.buttons);
	list("Tabs and menu items", info.tabs);
	list("Fields", info.fields);
	list("Links", info.links);
	console.log(`\nScreenshot: ${shot}`);
}

/* -------------------------------------------------------------- narration */

/** The say steps of every video, in order, with their ids. */
function narrationOf(config) {
	const segments = [];
	for (const video of config.videos ?? []) {
		let n = 0;
		for (const step of video.steps ?? []) {
			const text = step.action === "say" ? step.text : step.say;
			if (!text) continue;
			n++;
			segments.push({ id: step.id ?? `${video.id}-${String(n).padStart(2, "0")}`, video: video.id, text: text.trim() });
		}
	}
	return segments;
}

function narration(file, args) {
	const path = resolve(file);
	const config = readJson(path);
	const segments = narrationOf(config);
	if (!segments.length) fail("No narration: add `say` steps (or a `say` on an action) to the videos.");
	const out = resolve(args.out ?? join(dirname(path), "narration.json"));
	const data = {
		...(config.language ? { language: config.language } : {}),
		...(config.voice ? { voice: config.voice } : {}),
		...(config.instructions ? { instructions: config.instructions } : {}),
		...(config.pronounce ? { pronounce: config.pronounce } : {}),
		segments,
	};
	writeFileSync(out, `${JSON.stringify(data, null, "\t")}\n`);
	const chars = segments.reduce((a, s) => a + s.text.length, 0);
	console.log(`✓ ${out}\n  ${segments.length} segments, ${chars} characters, roughly ${Math.round(chars / DEFAULTS.charsPerSecond)} s of speech.`);
}

/* ------------------------------------------------------------- recording */

/** Raw frames from Chrome's screencast, with the time each was painted. */
async function startScreencast(page, dir, size) {
	const cdp = await page.context().newCDPSession(page);
	const frames = [];
	const writes = [];
	cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
		const file = join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
		frames.push({ file, t: metadata.timestamp ? metadata.timestamp * 1000 : now() });
		writes.push(Promise.resolve().then(() => writeFileSync(file, Buffer.from(data, "base64"))));
		cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
	});
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
	return {
		frames,
		async stop() {
			await cdp.send("Page.stopScreencast").catch(() => {});
			await Promise.all(writes);
			await cdp.detach().catch(() => {});
		},
	};
}

/** Frames held for as long as they were on screen, resampled to a steady frame rate. */
function encode(frames, t0, t1, size, fps, out) {
	const shown = frames.filter((f) => existsSync(f.file)).sort((a, b) => a.t - b.t);
	if (!shown.length) throw new Error("The screencast produced no frames.");
	const lines = ["ffconcat version 1.0"];
	shown.forEach((f, i) => {
		const from = i === 0 ? t0 : f.t;
		const to = i + 1 < shown.length ? shown[i + 1].t : t1;
		lines.push(`file '${f.file.replace(/'/g, "'\\''")}'`, `duration ${Math.max(0.001, (to - from) / 1000).toFixed(4)}`);
	});
	// Older ffmpeg only honours the last duration when the file is listed once more; newer
	// ones then show it twice, so the output is cut to the recorded length with -t below.
	lines.push(`file '${shown.at(-1).file.replace(/'/g, "'\\''")}'`);
	const list = join(dirname(shown[0].file), "frames.txt");
	writeFileSync(list, `${lines.join("\n")}\n`);
	mkdirSync(dirname(out), { recursive: true });
	const result = spawnSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			list,
			"-vf",
			`scale=${size.width}:${size.height}:flags=lanczos,fps=${fps},format=yuv420p`,
			"-c:v",
			"libx264",
			"-preset",
			"slow",
			"-crf",
			"18",
			"-movflags",
			"+faststart",
			"-an",
			"-t",
			((t1 - t0) / 1000).toFixed(3),
			out,
		],
		{ encoding: "utf8" },
	);
	if (result.error?.code === "ENOENT") fail("ffmpeg is not installed (macOS: brew install ffmpeg, Debian/Ubuntu: apt install ffmpeg).", 2);
	if (result.status !== 0) throw new Error(`ffmpeg failed:\n${result.stderr.trim().split("\n").slice(-10).join("\n")}`);
}

/** Plays one video's steps with a cursor that moves like a person's. */
class Director {
	constructor(page, config, durations) {
		this.page = page;
		this.config = config;
		this.durations = durations;
		this.cursor = { x: config.viewport.width * 0.62, y: config.viewport.height * 0.58 };
		this.t0 = 0;
		this.segment = null;
		this.segments = [];
		this.estimated = [];
	}

	clock() {
		return (now() - this.t0) / 1000;
	}

	async glide(x, y) {
		const distance = Math.hypot(x - this.cursor.x, y - this.cursor.y);
		const ms = Math.round(Math.min(1000, Math.max(350, 280 + distance * 0.55)));
		await this.page.evaluate(([x, y, ms]) => window.__stage?.move(x, y, ms), [x, y, ms]);
		await Promise.all([this.page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 25)) }), sleep(ms)]);
		this.cursor = { x, y };
	}

	/** Brings the element into view smoothly and returns its centre. */
	async reach(loc) {
		const inView = await loc.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return r.top >= 40 && r.bottom <= innerHeight - 40 && r.left >= 0 && r.right <= innerWidth;
		});
		if (!inView) {
			await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
			await this.page.waitForTimeout(750);
		}
		const box = await loc.boundingBox();
		if (!box) throw new Error("The element has no box on screen.");
		return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(box.height / 2, 24)) };
	}

	async ring(loc, step) {
		// The stage lives in the top page; an element inside an iframe is ringed by its box there.
		const inFrame = typeof step?.target === "object" && step.target.frame;
		const handle = loc ? await (inFrame ? loc.boundingBox() : loc.elementHandle()) : null;
		await this.page.evaluate(([el, color]) => window.__stage?.ring(el, color ? { color } : {}), [handle, step?.ringColor ?? null]);
	}

	async click(loc, step) {
		const point = await this.reach(loc);
		if (step.ring) {
			await this.ring(loc, step);
			await this.page.waitForTimeout(500);
		}
		await this.glide(point.x, point.y);
		await this.page.waitForTimeout(120);
		await this.page.evaluate(([x, y]) => window.__stage?.press(x, y), [point.x, point.y]);
		await loc.click({ timeout: 5000 });
		// A click's ring has done its job; apps often reuse the clicked element
		// for something else, and a lingering ring would point at that.
		if (step.ring) await this.ring(null);
	}

	/** Starts a narration segment; the one before is first held until its voice has finished. */
	async say(step, id) {
		await this.finishSegment();
		const text = (step.action === "say" ? step.text : step.say).trim();
		let seconds = this.durations?.[id];
		if (seconds == null) {
			seconds = Math.max(1.5, text.length / (this.config.charsPerSecond ?? DEFAULTS.charsPerSecond));
			this.estimated.push(id);
		}
		this.segment = { id, text, start: this.clock(), need: seconds + (this.config.gap ?? DEFAULTS.gap) };
	}

	async finishSegment() {
		if (!this.segment) return;
		const wait = this.segment.start + this.segment.need - this.clock();
		if (wait > 0) await sleep(wait * 1000);
		this.segments.push({ id: this.segment.id, text: this.segment.text, start: round(this.segment.start), end: round(this.clock()) });
		this.segment = null;
	}

	async step(step) {
		const page = this.page;
		const url = (u) => new URL(u, this.config.baseUrl).href;
		const pace = step.pause ?? this.config.pace ?? DEFAULTS.pace;
		if (!["say", "pause", "ring", "wait"].includes(step.action)) await this.ring(null);
		switch (step.action) {
			case "say":
				return;
			case "pause":
				return page.waitForTimeout(step.ms ?? 1000);
			case "goto":
				await page.goto(url(step.url), { waitUntil: "load" });
				await settle(page);
				await page.evaluate(([x, y]) => window.__stage?.place(x, y), [this.cursor.x, this.cursor.y]);
				return page.waitForTimeout(pace);
			case "click": {
				const before = page.url();
				await this.click(await one(page, step.target), step);
				await settle(page);
				if (page.url() !== before) await page.evaluate(([x, y]) => window.__stage?.place(x, y), [this.cursor.x, this.cursor.y]);
				return page.waitForTimeout(pace);
			}
			case "hover": {
				const loc = await one(page, step.target);
				const point = await this.reach(loc);
				await this.glide(point.x, point.y);
				await loc.hover();
				return page.waitForTimeout(pace);
			}
			case "fill":
			case "type": {
				if (step.secret) throw new Error("Never put passwords or secrets in a video; sign in with `record.mjs login`.");
				const loc = await one(page, step.target);
				await this.click(loc, step);
				// `fill` replaces what is there; `type` adds to the end of it.
				if (step.action === "fill") await loc.fill("");
				else
					await loc.evaluate((el) => {
						if (typeof el.setSelectionRange === "function") return el.setSelectionRange(el.value.length, el.value.length);
						const range = document.createRange();
						range.selectNodeContents(el);
						range.collapse(false);
						getSelection().removeAllRanges();
						getSelection().addRange(range);
					});
				await loc.pressSequentially(String(step.value ?? ""), { delay: step.delay ?? this.config.typingDelay ?? DEFAULTS.typingDelay });
				return page.waitForTimeout(pace);
			}
			case "select": {
				const loc = await one(page, step.target);
				const point = await this.reach(loc);
				await this.glide(point.x, point.y);
				await page.evaluate(([x, y]) => window.__stage?.press(x, y), [point.x, point.y]);
				await loc.selectOption(step.value);
				return page.waitForTimeout(pace);
			}
			case "check":
			case "uncheck": {
				const loc = await one(page, step.target);
				const point = await this.reach(loc);
				await this.glide(point.x, point.y);
				await page.evaluate(([x, y]) => window.__stage?.press(x, y), [point.x, point.y]);
				await (step.action === "check" ? loc.check() : loc.uncheck());
				return page.waitForTimeout(pace);
			}
			case "press":
				await page.evaluate((label) => window.__stage?.keys(label), step.label ?? step.key.replace(/\+/g, " + ").replace("Meta", "⌘"));
				await (step.target ? (await one(page, step.target)).press(step.key) : page.keyboard.press(step.key));
				await settle(page);
				return page.waitForTimeout(pace);
			case "scroll":
				if (step.target) await this.reach(await one(page, step.target));
				else {
					await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), step.y ?? 400);
					await page.waitForTimeout(750);
				}
				return page.waitForTimeout(pace / 2);
			case "ring": {
				const loc = await one(page, step.target);
				await this.reach(loc);
				await this.ring(loc, step);
				return page.waitForTimeout(step.ms ?? pace);
			}
			case "wait":
				if (step.target) return locate(page, step.target).first().waitFor({ state: step.state ?? "visible", timeout: step.timeout ?? 15000 });
				if (step.url) return page.waitForURL(new RegExp(step.url), { timeout: step.timeout ?? 15000 });
				return page.waitForTimeout(step.ms ?? 500);
			default:
				throw new Error(`Unknown action "${step.action}"`);
		}
	}
}

const round = (n) => Math.round(n * 1000) / 1000;

async function recordVideo(context, video, config, configDir, durations, args) {
	const outDir = resolve(configDir, config.outDir ?? "videos");
	const out = join(outDir, `${video.id}.mp4`);
	const frameDir = join(WORK, "frames", video.id);
	rmSync(frameDir, { recursive: true, force: true });
	mkdirSync(frameDir, { recursive: true });
	const size = {
		width: Math.round((config.viewport.width * config.scale) / 2) * 2,
		height: Math.round((config.viewport.height * config.scale) / 2) * 2,
	};

	const page = await context.newPage();
	const director = new Director(page, config, durations);
	const ids = new Map(narrationOf({ videos: [video] }).map((s, i) => [i, s.id]));
	let said = 0;
	try {
		// The first screen loads before the camera rolls, so the video does not open on a blank page.
		if (video.start) {
			await page.goto(new URL(video.start, config.baseUrl).href, { waitUntil: "load" });
			await settle(page);
		}
		const cast = await startScreencast(page, frameDir, size);
		director.t0 = now();
		// A cursor nudge makes Chrome paint the first frame even on a still page.
		await page.evaluate(([x, y]) => window.__stage?.place(x, y), [director.cursor.x, director.cursor.y]);
		await sleep((config.lead ?? DEFAULTS.lead) * 1000);

		for (const [i, step] of (video.steps ?? []).entries()) {
			try {
				if (step.action === "say" || step.say) await director.say(step, ids.get(said++));
				await director.step(step);
			} catch (error) {
				const shot = join(WORK, "errors", `${video.id}-step-${i + 1}.png`);
				mkdirSync(dirname(shot), { recursive: true });
				await page.screenshot({ path: shot }).catch(() => {});
				await cast.stop();
				throw new Error(`step ${i + 1} (${step.action}${step.target ? ` ${describe(step.target)}` : ""}): ${error.message.split("\n")[0]}\n    page at the failure: ${shot}`);
			}
		}
		await director.finishSegment();
		await director.ring(null);
		await sleep((config.tail ?? DEFAULTS.tail) * 1000);
		const t1 = now();
		await cast.stop();

		encode(cast.frames, director.t0, t1, size, config.fps ?? DEFAULTS.fps, out);
		const timeline = {
			video: `${video.id}.mp4`,
			title: video.title,
			duration: round((t1 - director.t0) / 1000),
			...(config.language ? { language: config.language } : {}),
			...(config.voice ? { voice: config.voice } : {}),
			...(config.instructions ? { instructions: config.instructions } : {}),
			...(config.pronounce ? { pronounce: config.pronounce } : {}),
			segments: director.segments,
		};
		writeFileSync(join(outDir, `${video.id}.timeline.json`), `${JSON.stringify(timeline, null, "\t")}\n`);
		console.log(`  ✓ ${relative(process.cwd(), out)}  (${timeline.duration.toFixed(1)} s, ${size.width}×${size.height}, ${director.segments.length} narration segments)`);
		if (director.estimated.length)
			console.log(`    timed by estimate, not by real audio: ${director.estimated.join(", ")} — the voiceover may hold the picture there.`);
	} finally {
		await page.close();
		if (!args.keepFrames) rmSync(frameDir, { recursive: true, force: true });
	}
}

async function record(pw, file, args) {
	const path = resolve(file);
	const config = { ...DEFAULTS, ...readJson(path) };
	if (!config.baseUrl) fail("The video script needs a baseUrl.");
	const videos = (config.videos ?? []).filter((v) => !args.only || v.id === args.only);
	if (!videos.length) fail(args.only ? `No video with id "${args.only}".` : "The script has no videos.");
	for (const v of videos) if (!v.id || !/^[a-z0-9-]+$/.test(v.id)) fail(`Video id "${v.id}" must be lowercase letters, digits and dashes.`);
	const durations = args.durations ? readJson(resolve(args.durations)) : null;

	const { browser, context } = await openContext(pw, { headed: args.headed, state: args.state ?? config.state ?? join(WORK, "state.json"), config });
	let failed = 0;
	try {
		for (const video of videos) {
			console.log(`\n▶ ${video.id}${video.title ? ` — ${video.title}` : ""}`);
			try {
				await recordVideo(context, video, config, dirname(path), durations, args);
			} catch (error) {
				failed++;
				console.error(`  ✗ ${error.message}`);
			}
		}
	} finally {
		await browser.close();
	}
	if (failed) fail(`${failed} video(s) stopped on an error; see above. Fix the step and re-run with --only <id>.`);
	console.log("\nAll videos done.");
}

/* ------------------------------------------------------------------ login */

async function login(pw, url, args) {
	const state = args.state ?? join(WORK, "state.json");
	mkdirSync(dirname(state), { recursive: true });
	const { browser, context } = await openContext(pw, { headed: true, state, config: { cursor: false } });
	const page = await context.newPage();
	await page.goto(url);
	const until = args.until ? new RegExp(args.until) : null;
	console.log(
		"A browser window is open. Sign in there by hand.\n" +
			(until ? `The session is saved once the address matches /${args.until}/.` : "When you are signed in, close the browser tab.") +
			"\n(Waiting up to 10 minutes.)",
	);
	const deadline = Date.now() + 10 * 60 * 1000;
	let saved = false;
	while (Date.now() < deadline) {
		await sleep(1500);
		const open = context.pages();
		try {
			await context.storageState({ path: state });
			saved = true;
		} catch {
			break; // the window was closed; the last save stands
		}
		if (!open.length) break;
		if (until && open.some((p) => until.test(p.url()))) {
			await sleep(2000);
			await context.storageState({ path: state });
			break;
		}
	}
	await browser.close().catch(() => {});
	if (!saved) fail("No session was saved.");
	console.log(`Session saved to ${state}`);
}

/* ------------------------------------------------------------------- main */

const args = parseArgs(process.argv.slice(2));
const [command, target] = args._;
if (!command || !target) {
	console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*?/, "").replace(/^ \* ?/gm, ""));
	process.exit(command ? 1 : 0);
}
if (command === "narration") narration(target, args);
else {
	const pw = await loadPlaywright();
	if (command === "login") await login(pw, target, args);
	else if (command === "inspect") await inspect(pw, target, args);
	else if (command === "record") await record(pw, target, args);
	else fail(`Unknown command "${command}". Use login, inspect, narration or record.`);
}

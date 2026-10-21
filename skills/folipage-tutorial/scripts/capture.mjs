#!/usr/bin/env node
/**
 * Screenshots for folipage tutorials, taken with Playwright.
 *
 *   node capture.mjs login   <url> [--until <regex>]   the user signs in by hand once; the session is kept
 *   node capture.mjs inspect <url>                     what a page offers, plus a screenshot to look at
 *   node capture.mjs run     <flows.json> [--only id]  replays flows and takes their screenshots
 *
 * Options:
 *   --state <file>   session file (default .folipage-tutorial/state.json)
 *   --headed         show the browser while inspecting or running
 *
 * Playwright is looked up next to this script, then in ./.folipage-tutorial and
 * the current directory. Install it with:
 *
 *   npm install --prefix .folipage-tutorial playwright
 *   (cd .folipage-tutorial && npx playwright install chromium)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OVERLAY = readFileSync(join(HERE, "overlay.js"), "utf8");
const WORK = resolve(".folipage-tutorial");

const DEFAULTS = {
	viewport: { width: 1440, height: 900 },
	scale: 2,
	colorScheme: "light",
	locale: "en-US",
	padding: 48,
	minClip: { width: 640, height: 360 },
};

/* ------------------------------------------------------------------ setup */

async function loadPlaywright() {
	try {
		return await import("playwright");
	} catch {
		// Not installed next to the skill: look where the user works.
	}
	for (const base of [WORK, process.cwd()]) {
		try {
			return createRequire(join(base, "noop.js"))("playwright");
		} catch {
			// Not here either: try the next place.
		}
	}
	fail(
		"Playwright is not installed. Run:\n" +
			"  npm install --prefix .folipage-tutorial playwright\n" +
			"  (cd .folipage-tutorial && npx playwright install chromium)",
		2,
	);
}

function fail(message, code = 1) {
	console.error(`capture: ${message}`);
	process.exit(code);
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--headed") args.headed = true;
		else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
		else args._.push(a);
	}
	return args;
}

async function openContext(pw, { headed, state, options = {} }) {
	const browser = await pw.chromium.launch({ headless: !headed });
	const context = await browser.newContext({
		viewport: options.viewport ?? DEFAULTS.viewport,
		deviceScaleFactor: options.scale ?? DEFAULTS.scale,
		colorScheme: options.colorScheme ?? DEFAULTS.colorScheme,
		locale: options.locale ?? DEFAULTS.locale,
		reducedMotion: "reduce",
		...(state && existsSync(state) ? { storageState: state } : {}),
	});
	context.setDefaultTimeout(15000);
	await context.addInitScript({ content: OVERLAY });
	return { browser, context };
}

/** Waits until the page stops moving: network, fonts, a frame to paint. */
async function settle(page) {
	await page.waitForLoadState("load").catch(() => {});
	await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
	await page.evaluate(() => document.fonts?.ready).catch(() => {});
	await page.waitForTimeout(250);
}

/* --------------------------------------------------------------- targets */

/**
 * A target is a Playwright selector string, or an object:
 * { role, name } | { label } | { placeholder } | { text } | { testId } | { css },
 * optionally with { exact, nth, within: <target>, frame: "<iframe selector>" }.
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

/** Exactly one visible element, or an error that says how to fix the target. */
async function one(page, target, timeout = 10000) {
	const loc = locate(page, target);
	await loc.first().waitFor({ state: "visible", timeout }).catch(() => {});
	const count = await loc.count();
	if (!count) throw new Error(`No visible element matches ${describe(target)}. Run \`capture.mjs inspect\` on the page to see what is there.`);
	if (count > 1) throw new Error(`${count} visible elements match ${describe(target)}; narrow it with "exact", "within" or "nth".`);
	return loc;
}

const describe = (target) => (typeof target === "string" ? target : JSON.stringify(target));

/* ---------------------------------------------------------------- inspect */

async function inspectPage(page, label) {
	await settle(page);
	const info = await page.evaluate(() => {
		const visible = (el) => {
			const box = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
		};
		const text = (el) =>
			(el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || "")
				.trim()
				.replace(/\s+/g, " ")
				.slice(0, 80);
		const all = (selector) => [...document.querySelectorAll(selector)].filter(visible);
		const unique = (items) => [...new Map(items.map((i) => [JSON.stringify(i), i])).values()];
		const fieldLabel = (el) =>
			(el.labels?.[0]?.innerText || el.getAttribute("aria-label") || el.placeholder || el.name || "")
				.trim()
				.replace(/\s+/g, " ");
		return {
			url: location.href,
			title: document.title,
			headings: all("h1, h2, h3").map((h) => `${h.tagName.toLowerCase()} ${text(h)}`),
			navigation: unique(all("nav a[href], aside a[href], [role=navigation] a[href]").map((a) => [text(a), a.getAttribute("href")])).slice(0, 40),
			links: unique(all("main a[href], a[href]").map((a) => [text(a), a.getAttribute("href")])).slice(0, 40),
			buttons: unique(
				all("button, [role=button], input[type=submit], input[type=button]").map((b) => [
					text(b) || "(icon only)",
					b.disabled ? "disabled" : "",
				]),
			).slice(0, 40),
			tabs: unique(all("[role=tab], [role=menuitem]").map((t) => text(t))).slice(0, 30),
			fields: all("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").map(
				(f) => `${f.tagName.toLowerCase()}${f.type ? `[${f.type}]` : ""} "${fieldLabel(f)}"`,
			),
		};
	});
	mkdirSync(join(WORK, "inspect"), { recursive: true });
	const shot = join(WORK, "inspect", `${label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "page"}.png`);
	await page.evaluate(() => window.__folipage?.prepare());
	await page.screenshot({ path: shot });
	const list = (title, rows) => rows.length && console.log(`\n${title}:\n${rows.map((r) => `  - ${Array.isArray(r) ? r.filter(Boolean).join("  →  ") : r}`).join("\n")}`);
	console.log(`\nURL: ${info.url}\nTitle: ${info.title}`);
	list("Headings", info.headings);
	list("Navigation", info.navigation);
	list("Buttons", info.buttons);
	list("Tabs and menu items", info.tabs);
	list("Fields", info.fields);
	list("Links", info.links);
	console.log(`\nScreenshot: ${shot}`);
}

/* ------------------------------------------------------------------- shot */

async function takeShot(page, step, config, docsDir) {
	if (!step.file) throw new Error("A shot needs a `file`, relative to docsDir.");
	await settle(page);
	await page.evaluate(
		({ mask, hide, replace }) => {
			window.__folipage.prepare();
			window.__folipage.mask(mask);
			window.__folipage.hide(hide);
			window.__folipage.replaceText(replace);
		},
		{
			mask: [...(config.mask ?? []), ...(step.mask ?? [])],
			hide: [...(config.hide ?? []), ...(step.hide ?? [])],
			replace: [...(config.replaceText ?? []), ...(step.replaceText ?? [])] },
	);

	const crop = step.crop ?? "viewport";
	const rings = step.highlight ? (Array.isArray(step.highlight) ? step.highlight : [step.highlight]) : [];
	if (rings.length && crop === "full") throw new Error("`highlight` does not work with crop \"full\"; use \"viewport\" or \"target\".");
	if (rings.length > 10) throw new Error("At most 10 marks fit one picture; split the shot.");

	// The crop area is scrolled into view first, so the marks measured next stay where they belong.
	let cropLoc = null;
	if (crop !== "viewport" && crop !== "full") {
		const around = typeof crop === "object" ? crop : step.target;
		if (crop !== "target" && typeof crop !== "object") throw new Error(`Unknown crop ${JSON.stringify(crop)}; use "viewport", "full", "target" or a target.`);
		if (around) {
			cropLoc = await one(page, around);
			await cropLoc.scrollIntoViewIfNeeded();
		} else if (!rings.length) throw new Error('crop "target" needs `target` or `highlight`.');
	}

	const labels = step.labels ?? [];
	const boxes = [];
	for (const [i, target] of rings.entries()) {
		const loc = await one(page, target);
		if (!cropLoc) await loc.scrollIntoViewIfNeeded();
		// The overlay lives in the top page; an element inside an iframe is ringed by its box there.
		const handle = typeof target === "object" && target.frame ? await loc.boundingBox() : await loc.elementHandle();
		const color = step.ringColor ?? config.ringColor;
		const box = await page.evaluate(
			([el, padding, color, label]) => window.__folipage.highlight(el, { padding, color, label }),
			[handle, step.ringPadding ?? 6, color ?? null, labels[i] == null ? null : String(labels[i])],
		);
		if (!box) throw new Error(`Nothing to highlight for ${describe(target)}`);
		boxes.push(box);
	}
	// The soft veil around the marks: per step, or for every marked shot via config.dim.
	const dim = step.dim ?? config.dim ?? false;
	if (rings.length && dim) await page.evaluate((amount) => window.__folipage.dim(amount), dim === true ? 0.35 : Number(dim));

	const path = resolve(docsDir, step.file);
	mkdirSync(dirname(path), { recursive: true });
	const options = { path, animations: "disabled", caret: "hide" };
	const viewport = page.viewportSize();
	let clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
	if (crop === "full") options.fullPage = true;
	else if (crop !== "viewport") {
		const box = cropLoc ? await cropLoc.boundingBox() : boxes[0];
		if (!box) throw new Error("Nothing to crop to.");
		clip = clipAround(box, step.padding ?? config.padding ?? DEFAULTS.padding, viewport, config.minClip ?? DEFAULTS.minClip);
		options.clip = clip;
	}
	// The picture stays clean: the marks travel as JSON, drawn by folipage over it.
	await page.screenshot(options);
	// A copy with the marks drawn in, only to look at: is the right thing ringed?
	if (rings.length) {
		const check = join(WORK, "check", step.file);
		mkdirSync(dirname(check), { recursive: true });
		await page.evaluate(() => window.__folipage.show(true));
		await page.screenshot({ ...options, path: check });
		await page.evaluate(() => window.__folipage.show(false));
	}
	const highlight = rings.length
		? await page.evaluate(([clip, scale]) => window.__folipage.highlightOf(clip, scale), [clip, config.scale ?? DEFAULTS.scale])
		: null;
	await page.evaluate(() => window.__folipage.clear());
	if (rings.length && !highlight) throw new Error("The marks fell outside the screenshot; crop around them.");
	console.log(`  ✓ ${step.file}${options.clip ? ` (${Math.round(clip.width)}×${Math.round(clip.height)})` : ""}`);
	if (rings.length) console.log(`    to check by eye, with the marks drawn: ${relative(process.cwd(), join(WORK, "check", step.file))}`);
	recordShot(docsDir, step, highlight);
}

/** `'` and `&` escaped, so the JSON sits in a single-quoted attribute as-is. */
const attributeJson = (value) => JSON.stringify(value).replace(/'/g, "\\u0027").replace(/&/g, "\\u0026");

/**
 * The `::image` directive for a shot, ready to paste into its page: the
 * src relative to the page (a page sits next to its images/ folder), the alt
 * from the step, the marks in `highlight='…'`. Kept for every shot in
 * .folipage-tutorial/highlights.json too, so a later run can be compared.
 */
function recordShot(docsDir, step, highlight) {
	const file = step.file.replace(/\\/g, "/");
	const at = file.lastIndexOf("images/");
	const src = at >= 0 ? `./${file.slice(at)}` : `./${file.split("/").pop()}`;
	const alt = String(step.alt ?? "").replace(/"/g, "'");
	const caption = step.caption ? ` caption="${String(step.caption).replace(/"/g, "'")}"` : "";
	if (highlight) console.log(`    ::image{src="${src}" alt="${alt || "…"}"${caption} highlight='${attributeJson(highlight)}'}`);
	const manifest = join(WORK, "highlights.json");
	let all = {};
	try {
		all = JSON.parse(readFileSync(manifest, "utf8"));
	} catch {
		// First shot of this folder: start the manifest.
	}
	all[relative(process.cwd(), resolve(docsDir, step.file)).replace(/\\/g, "/")] = { src, alt: alt || null, caption: step.caption ?? null, highlight };
	mkdirSync(WORK, { recursive: true });
	writeFileSync(manifest, `${JSON.stringify(all, null, "\t")}\n`);
}

/** The element's box grown by `padding`, at least `min` in size, kept inside the viewport. */
function clipAround(box, padding, viewport, min) {
	let width = Math.max(box.width + padding * 2, min.width);
	let height = Math.max(box.height + padding * 2, min.height);
	width = Math.min(width, viewport.width);
	height = Math.min(height, viewport.height);
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const x = Math.min(Math.max(cx - width / 2, 0), viewport.width - width);
	const y = Math.min(Math.max(cy - height / 2, 0), viewport.height - height);
	return { x, y, width, height };
}

/* -------------------------------------------------------------------- run */

async function runStep(page, step, config, docsDir) {
	const url = (u) => new URL(u, config.baseUrl).href;
	switch (step.action) {
		case "goto":
			await page.goto(url(step.url), { waitUntil: "load" });
			return settle(page);
		case "click":
			await (await one(page, step.target)).click();
			return settle(page);
		case "hover":
			return (await one(page, step.target)).hover();
		case "fill":
			if (step.secret) throw new Error("Never put passwords or secrets in flows; sign in with `capture.mjs login`.");
			return (await one(page, step.target)).fill(String(step.value ?? ""));
		case "select":
			return (await one(page, step.target)).selectOption(step.value);
		case "check":
			return (await one(page, step.target)).check();
		case "uncheck":
			return (await one(page, step.target)).uncheck();
		case "press":
			await (step.target ? (await one(page, step.target)).press(step.key) : page.keyboard.press(step.key));
			return settle(page);
		case "scroll":
			return (await one(page, step.target)).scrollIntoViewIfNeeded();
		case "wait":
			if (step.target) return locate(page, step.target).first().waitFor({ state: step.state ?? "visible", timeout: step.timeout ?? 15000 });
			if (step.url) return page.waitForURL(new RegExp(step.url), { timeout: step.timeout ?? 15000 });
			return page.waitForTimeout(step.ms ?? 500);
		case "shot":
			return takeShot(page, step, config, docsDir);
		case "inspect":
			return inspectPage(page, step.label ?? "step");
		default:
			throw new Error(`Unknown action "${step.action}"`);
	}
}

async function run(pw, file, args) {
	const configPath = resolve(file);
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	if (!config.baseUrl) fail("flows.json needs a baseUrl.");
	const docsDir = resolve(dirname(configPath), config.docsDir ?? "docs");
	const flows = (config.flows ?? []).filter((f) => !args.only || f.id === args.only);
	if (!flows.length) fail(args.only ? `No flow with id "${args.only}".` : "flows.json has no flows.");

	const { browser, context } = await openContext(pw, { headed: args.headed, state: args.state ?? config.state ?? join(WORK, "state.json"), options: config });
	let failed = 0;
	try {
		for (const flow of flows) {
			console.log(`\n▶ ${flow.id}${flow.title ? ` — ${flow.title}` : ""}`);
			const page = await context.newPage();
			try {
				for (const [i, step] of (flow.steps ?? []).entries()) {
					try {
						await runStep(page, step, config, docsDir);
					} catch (error) {
						failed++;
						const shot = join(WORK, "errors", `${flow.id}-step-${i + 1}.png`);
						mkdirSync(dirname(shot), { recursive: true });
						await page.screenshot({ path: shot }).catch(() => {});
						console.error(`  ✗ step ${i + 1} (${step.action}${step.target ? ` ${describe(step.target)}` : ""}): ${error.message.split("\n")[0]}\n    page at the failure: ${shot}`);
						break;
					}
				}
			} finally {
				await page.close();
			}
		}
	} finally {
		await browser.close();
	}
	if (failed) fail(`${failed} flow(s) stopped on an error; see above.`);
	console.log("\nAll flows done.");
}

/* ------------------------------------------------------------------ login */

async function login(pw, url, args) {
	const state = args.state ?? join(WORK, "state.json");
	mkdirSync(dirname(state), { recursive: true });
	const { browser, context } = await openContext(pw, { headed: true, state });
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
		await new Promise((r) => setTimeout(r, 1500));
		const open = context.pages();
		try {
			await context.storageState({ path: state });
			saved = true;
		} catch {
			break; // the window was closed; the last save stands
		}
		if (!open.length) break;
		if (until && open.some((p) => until.test(p.url()))) {
			await new Promise((r) => setTimeout(r, 2000));
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
const pw = await loadPlaywright();
if (command === "login") await login(pw, target, args);
else if (command === "inspect") {
	const { browser, context } = await openContext(pw, { headed: args.headed, state: args.state ?? join(WORK, "state.json") });
	const page = await context.newPage();
	await page.goto(target, { waitUntil: "load" });
	await inspectPage(page, new URL(page.url()).pathname || "home");
	await browser.close();
} else if (command === "run") await run(pw, target, args);
else fail(`Unknown command "${command}". Use login, inspect or run.`);

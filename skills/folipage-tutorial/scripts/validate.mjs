#!/usr/bin/env node
/**
 * Checks a tutorial folder against what the folipage import accepts, before it
 * is zipped. No dependencies; Node 18+.
 *
 *   node validate.mjs <docs-dir>
 *
 * Errors (exit 1) are what would break the import or the build, or leave a
 * reader with a broken page. Warnings are what the import would quietly fix
 * or drop.
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMITS = {
	entries: 2000,
	totalBytes: 100 * 1024 * 1024,
	markdownBytes: 1024 * 1024,
	imageBytes: 10 * 1024 * 1024,
	videoBytes: 50 * 1024 * 1024,
	captionsBytes: 1024 * 1024,
};
const MARKDOWN = /\.(md|markdown)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const CAPTIONS = /\.vtt$/i;
/** `::video{…}` at the start of a line; group 1 is what the braces hold. */
const VIDEO_DIRECTIVE = /^:{2,}video(?:\[[^\]\n]*\])?\{([^}\n]*)\}/gm;
const VIDEO_KEYS = new Set(["src", "captions", "caption", "alt"]);
const KEYS = new Set(["title", "description", "order", "icon", "group", "draft", "updated"]);
const TODO = /TODO\(folipage\)/g;

/** Every file under `dir`, relative, with `/` separators; hidden files skipped like the import does. */
export function listFiles(dir) {
	const out = [];
	const walk = (at) => {
		for (const name of readdirSync(at)) {
			if (name.startsWith(".") || name === "__MACOSX" || name === "node_modules") continue;
			const full = join(at, name);
			if (statSync(full).isDirectory()) walk(full);
			else out.push(relative(dir, full).split(sep).join("/").normalize("NFC"));
		}
	};
	walk(dir);
	return out.sort();
}

/** The frontmatter as flat `key: value` scalars — all a folipage page needs. */
function frontmatter(text) {
	const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
	if (!m) return null;
	const data = {};
	const problems = [];
	for (const line of m[1].split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
		if (!kv) {
			problems.push(`frontmatter line is not "key: value": ${line.trim()}`);
			continue;
		}
		let value = kv[2].trim();
		if (/^".*"$/.test(value)) {
			try {
				value = JSON.parse(value);
			} catch {
				problems.push(`${kv[1]}: the quoted string is not valid`);
			}
		} else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
		else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
		else if (value === "true" || value === "false") value = value === "true";
		else if (/^[>|]/.test(value)) problems.push(`${kv[1]}: write it on one line, not as a YAML block`);
		else if (/:\s|\s#/.test(value)) problems.push(`${kv[1]}: quote the value, it contains ": " or " #"`);
		data[kv[1]] = value;
	}
	return { data, body: text.slice(m[0].length), problems };
}

/** Links and images in Markdown, outside code. */
function references(body) {
	const text = body.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
	const refs = [];
	// A destination is <with spaces> in angle brackets, or without spaces.
	for (const m of text.matchAll(/(!?)\[((?:[^\]\\]|\\.)*)\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"([^"]*)")?\s*\)/g)) {
		refs.push({ image: m[1] === "!", text: m[2], href: m[3] ?? m[4], title: m[5] });
	}
	// A bare space in a destination ends the link in Markdown: the link silently does not work.
	for (const m of text.matchAll(/!?\[(?:[^\]\\]|\\.)*\]\(\s*([^<)\s][^)\n]*\s[^)\n"]*\.(?:md|png|jpe?g|webp|gif|avif|svg))\s*\)/gi)) {
		refs.push({ broken: true, href: m[1] });
	}
	for (const m of text.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
		const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(m[0]);
		refs.push({ image: true, text: alt ? alt[1] : "", href: m[1], html: true });
	}
	return { refs, text };
}

/* An `::image` directive: `::image{src="./images/a.png" alt="…" highlight='{…}'}`. */
const IMAGE_DIRECTIVE = /^\s*::image(?:\[((?:[^\]\\\n]|\\.)*)\])?\{([^\n]*)\}\s*$/gm;
const ATTRIBUTE = /\s*(?:[#.][^\s#.}=]+|([^\s"'=<>`}#.][^\s"'=<>`}]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`}]+)))?)/y;

/** The `::image` directives of a page, with their attributes; `bad` when one cannot be read. */
function imageDirectives(text) {
	const out = [];
	for (const m of text.matchAll(IMAGE_DIRECTIVE)) {
		const attributes = {};
		let bad = false;
		ATTRIBUTE.lastIndex = 0;
		while (ATTRIBUTE.lastIndex < m[2].length) {
			const start = ATTRIBUTE.lastIndex;
			const a = ATTRIBUTE.exec(m[2]);
			if (!a || ATTRIBUTE.lastIndex === start) {
				if (m[2].slice(start).trim()) bad = true;
				break;
			}
			if (a[1]) attributes[a[1]] = a[2] ?? a[3] ?? a[4] ?? "";
		}
		out.push({ line: m[0].trim(), label: m[1], attributes, bad });
	}
	return out;
}

/*
 * What folipage accepts in `highlight='…'` — a copy of the platform's own
 * check (@folipage/shared/highlight), so the skill needs no dependencies.
 */
const HIGHLIGHT = { marks: 10, dim: 0.8, label: 3, stroke: [1, 12], side: 20000 };
const HIGHLIGHT_TOP = new Set(["width", "height", "crop", "dim", "color", "stroke", "marks"]);
const HIGHLIGHT_BOX = ["x", "y", "width", "height"];
const HIGHLIGHT_MARK = new Set([...HIGHLIGHT_BOX, "radius", "color", "label"]);
const HEX = /^#[0-9a-f]{6}$/i;
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function highlightProblems(value) {
	const problems = [];
	if (!isObject(value)) return ['is not an object {"width", "height", "marks"}'];
	for (const key of Object.keys(value)) if (!HIGHLIGHT_TOP.has(key)) problems.push(`unknown key "${key}"`);
	for (const side of ["width", "height"]) {
		const n = value[side];
		if (!isNumber(n) || n < 1 || n > HIGHLIGHT.side) problems.push(`${side} is the picture's size in pixels, 1–${HIGHLIGHT.side}`);
	}
	const width = isNumber(value.width) ? value.width : 0;
	const height = isNumber(value.height) ? value.height : 0;
	const box = (b, path, known) => {
		if (!isObject(b)) return problems.push(`${path} is a rectangle {"x", "y", "width", "height"}`);
		for (const key of Object.keys(b)) if (!known.has(key)) problems.push(`unknown key "${key}" in ${path}`);
		let ok = true;
		for (const key of HIGHLIGHT_BOX) {
			const min = key === "width" || key === "height" ? 1 : 0;
			if (!isNumber(b[key]) || b[key] < min) {
				problems.push(`${path}.${key} is a number of pixels${min ? " above 0" : ""}`);
				ok = false;
			}
		}
		if (ok && width && height && (b.x + b.width > width + 0.5 || b.y + b.height > height + 0.5))
			problems.push(`${path} reaches outside the picture (${width} × ${height})`);
	};
	if (value.crop !== undefined) box(value.crop, "crop", new Set(HIGHLIGHT_BOX));
	if (value.dim !== undefined && (!isNumber(value.dim) || value.dim < 0 || value.dim > HIGHLIGHT.dim)) problems.push(`dim is 0–${HIGHLIGHT.dim}`);
	if (value.color !== undefined && !(typeof value.color === "string" && HEX.test(value.color))) problems.push("color is #rrggbb");
	if (value.stroke !== undefined && !(isNumber(value.stroke) && value.stroke >= HIGHLIGHT.stroke[0] && value.stroke <= HIGHLIGHT.stroke[1]))
		problems.push(`stroke is ${HIGHLIGHT.stroke.join("–")}`);
	if (!Array.isArray(value.marks)) return [...problems, "marks is a list of the highlighted places"];
	if (value.marks.length > HIGHLIGHT.marks) problems.push(`at most ${HIGHLIGHT.marks} marks`);
	value.marks.forEach((mark, i) => {
		const path = `marks[${i}]`;
		box(mark, path, HIGHLIGHT_MARK);
		if (!isObject(mark)) return;
		if (mark.radius !== undefined && !(isNumber(mark.radius) && mark.radius >= 0)) problems.push(`${path}.radius is 0 or more pixels`);
		if (mark.color !== undefined && !(typeof mark.color === "string" && HEX.test(mark.color))) problems.push(`${path}.color is #rrggbb`);
		// eslint-disable-next-line no-control-regex
		if (mark.label !== undefined && !(typeof mark.label === "string" && [...mark.label].length <= HIGHLIGHT.label && !/[\u0000-\u001f\u007f]/.test(mark.label)))
			problems.push(`${path}.label is a short label, at most ${HIGHLIGHT.label} characters`);
	});
	return problems;
}

/** A PNG's size from its header, or null for anything else. */
function pngSize(file) {
	const head = Buffer.alloc(24);
	const fd = openSync(file, "r");
	try {
		if (readSync(fd, head, 0, 24, 0) < 24) return null;
	} finally {
		closeSync(fd);
	}
	if (head.readUInt32BE(0) !== 0x89504e47 || head.toString("ascii", 12, 16) !== "IHDR") return null;
	return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const isExternal = (href) => /^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href);

function resolveLocal(fromFile, href) {
	let path = href.split(/[?#]/)[0];
	try {
		path = decodeURIComponent(path);
	} catch {
		// A malformed escape: check the path as written.
	}
	const joined = path.startsWith("/") ? path.slice(1) : join(dirname(fromFile), path);
	return joined.split(sep).join("/").replace(/^\.\//, "").normalize("NFC");
}

export function validate(dir) {
	const root = resolve(dir);
	const errors = [];
	const warnings = [];
	if (!existsSync(root) || !statSync(root).isDirectory()) return { errors: [`${dir} is not a folder`], warnings, stats: {} };

	const files = listFiles(root);
	const pages = files.filter((f) => MARKDOWN.test(f));
	// Group folders carry the sidebar label: a slug there reaches the reader without diacritics.
	const groups = new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]));
	for (const g of groups) {
		const name = g.replace(/^\d{1,4}[-_. ]+/, "");
		if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name))
			warnings.push(`${g}/: the sidebar will call this group "${(name.charAt(0).toUpperCase() + name.slice(1)).replace(/-/g, " ")}"; name the folder as the reader should see it, e.g. "${g.replace(name, "")}${name.charAt(0).toUpperCase()}${name.slice(1).replace(/-/g, " ")}" with the language's diacritics`);
	}
	const images = new Set(files.filter((f) => IMAGE.test(f)));
	const used = new Set();
	let total = 0;
	let todos = 0;

	for (const f of files) {
		const size = statSync(join(root, f)).size;
		total += size;
		if (/\.mdx$/i.test(f)) errors.push(`${f}: write plain Markdown (.md); MDX imports do not survive the import`);
		else if (!MARKDOWN.test(f) && !IMAGE.test(f) && !VIDEO.test(f) && !CAPTIONS.test(f)) warnings.push(`${f}: neither Markdown, an image nor a video — the import skips it`);
		if (MARKDOWN.test(f) && size > LIMITS.markdownBytes) errors.push(`${f}: larger than 1 MB`);
		if (IMAGE.test(f) && size > LIMITS.imageBytes) errors.push(`${f}: image larger than 10 MB`);
		if (VIDEO.test(f) && size > LIMITS.videoBytes) errors.push(`${f}: video larger than 50 MB`);
		if (CAPTIONS.test(f) && size > LIMITS.captionsBytes) errors.push(`${f}: subtitles larger than 1 MB`);
		if (CAPTIONS.test(f) && !/^\uFEFF?WEBVTT(\s|$)/.test(readFileSync(join(root, f), "utf8").slice(0, 16))) errors.push(`${f}: subtitles must be WebVTT (start with WEBVTT)`);
	}
	if (files.length > LIMITS.entries) errors.push(`${files.length} files; the import takes at most ${LIMITS.entries}`);
	if (total > LIMITS.totalBytes) errors.push(`${(total / 1048576).toFixed(1)} MB in total; the import takes at most 100 MB`);
	if (!pages.length) errors.push("no Markdown pages");

	for (const f of pages) {
		const text = readFileSync(join(root, f), "utf8");
		const fm = frontmatter(text);
		if (!fm) {
			errors.push(`${f}: starts without frontmatter (--- title / description ---)`);
			continue;
		}
		for (const p of fm.problems) errors.push(`${f}: ${p}`);
		const { data, body } = fm;
		for (const key of Object.keys(data)) if (!KEYS.has(key)) errors.push(`${f}: frontmatter key "${key}" is not allowed (allowed: ${[...KEYS].join(", ")})`);
		if (typeof data.title !== "string" || !data.title.trim()) errors.push(`${f}: missing title`);
		if (typeof data.description !== "string" || !data.description.trim()) errors.push(`${f}: missing description`);
		else if (data.description.length > 180) warnings.push(`${f}: description is ${data.description.length} characters; keep it under 160`);
		if ("order" in data && typeof data.order !== "number") errors.push(`${f}: order must be a number`);
		if ("draft" in data && typeof data.draft !== "boolean") errors.push(`${f}: draft must be true or false`);
		if ("updated" in data && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.updated))) errors.push(`${f}: updated must be YYYY-MM-DD`);
		if ("group" in data && !/^[a-z0-9-]{1,60}$/.test(String(data.group))) warnings.push(`${f}: group "${data.group}" is not a folder id; the import ignores it`);
		if ("icon" in data) warnings.push(`${f}: icon is not drawn anywhere yet; leave it out`);

		const firstBlock = body.trimStart().split(/\n/)[0] ?? "";
		if (/^#\s/.test(firstBlock)) warnings.push(`${f}: the page starts with "# …"; the title is the heading already — start the body with text`);

		const { refs, text: prose } = references(body);
		for (const ref of refs) {
			if (ref.broken) {
				errors.push(`${f}: link "${ref.href}" has a space; write it as <${ref.href}> or with %20`);
				continue;
			}
			if (isExternal(ref.href)) continue;
			const target = resolveLocal(f, ref.href);
			if (ref.image || IMAGE.test(target)) {
				if (!ref.text.trim()) errors.push(`${f}: image ${ref.href} has no alt text`);
				if (ref.html) warnings.push(`${f}: <img> for ${ref.href}; use Markdown ![alt](path "caption") instead`);
				if (!images.has(target)) errors.push(`${f}: image ${ref.href} is missing (looked for ${target})`);
				used.add(target);
			} else {
				const ok = [target, `${target}.md`, `${target.replace(/\/$/, "")}/README.md`, `${target.replace(/\/$/, "")}/index.md`].some((p) => pages.includes(p));
				if (!ok) errors.push(`${f}: link ${ref.href} leads to no page in the folder`);
			}
		}
		for (const image of imageDirectives(prose)) {
			const { src, alt, highlight } = image.attributes;
			if (image.bad) errors.push(`${f}: cannot read the attributes of ${image.line.slice(0, 80)}…`);
			if (!src) {
				errors.push(`${f}: ::image without src`);
				continue;
			}
			if (!String(alt ?? "").trim()) errors.push(`${f}: image ${src} has no alt text`);
			for (const href of [src, image.attributes["src-dark"]].filter(Boolean)) {
				if (isExternal(href)) continue;
				const target = resolveLocal(f, href);
				if (!images.has(target)) errors.push(`${f}: image ${href} is missing (looked for ${target})`);
				used.add(target);
			}
			if (highlight === undefined) continue;
			let value;
			try {
				value = JSON.parse(highlight);
			} catch {
				errors.push(`${f}: the highlight of ${src} is not valid JSON (in single quotes, a ' inside written as \\u0027)`);
				continue;
			}
			const problems = highlightProblems(value);
			for (const p of problems) errors.push(`${f}: highlight of ${src}: ${p}`);
			const target = resolveLocal(f, src);
			const size = !problems.length && !isExternal(src) && images.has(target) ? pngSize(join(root, target)) : null;
			// The marks are in the picture's pixels: another shape means they were measured on another picture.
			if (size && Math.abs(value.width / value.height - size.width / size.height) > 0.01)
				errors.push(`${f}: the highlight of ${src} is for a ${value.width} × ${value.height} picture, the file is ${size.width} × ${size.height} — re-run the shot`);
		}
		for (const m of prose.matchAll(VIDEO_DIRECTIVE)) {
			const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'}]+))/g)].map((a) => [a[1], a[2] ?? a[3] ?? a[4]]));
			for (const key of Object.keys(attrs)) if (!VIDEO_KEYS.has(key)) errors.push(`${f}: ::video attribute "${key}" does not exist (src, captions, caption, alt)`);
			if (!attrs.src) errors.push(`${f}: ::video needs src="./videos/<file>.mp4"`);
			for (const [key, pattern, kind] of [["src", VIDEO, "an .mp4 or .webm video"], ["captions", CAPTIONS, "a .vtt file"]]) {
				const href = attrs[key];
				if (!href) continue;
				if (isExternal(href)) {
					errors.push(`${f}: ::video ${key} ${href} must be a file in the folder, not an address`);
					continue;
				}
				const target = resolveLocal(f, href);
				if (!pattern.test(target)) errors.push(`${f}: ::video ${key} ${href} is not ${kind}`);
				else if (!files.includes(target)) errors.push(`${f}: ::video ${key} ${href} is missing (looked for ${target})`);
				used.add(target);
			}
		}
		if (/^::button\b/m.test(prose)) warnings.push(`${f}: ::button links are not rewritten on import; prefer a plain link`);
		if (/^(import|export)\s/m.test(prose)) errors.push(`${f}: import/export lines are MDX; plain Markdown only`);

		// Container directives: every opener needs a closer of the same length.
		const stack = [];
		prose.split(/\r?\n/).forEach((line, i) => {
			const open = /^(:{3,})([a-z][\w-]*)/.exec(line);
			const close = /^(:{3,})\s*$/.exec(line);
			if (open) stack.push({ colons: open[1].length, name: open[2], line: i + 1 });
			else if (close) {
				const top = stack.pop();
				if (!top) errors.push(`${f}: a closing "${close[1]}" with nothing open`);
				else if (top.colons !== close[1].length) errors.push(`${f}: ":::${top.name}" opened with ${top.colons} colons is closed with ${close[1].length}`);
			}
		});
		for (const open of stack) errors.push(`${f}: ":::${open.name}" is never closed`);

		const found = prose.match(TODO)?.length ?? 0;
		if (found) warnings.push(`${f}: ${found} × TODO(folipage) left for a person to finish`);
		todos += found;
	}

	for (const img of images) if (!used.has(img)) warnings.push(`${img}: no page uses this image — the import drops it`);
	for (const f of files) if ((VIDEO.test(f) || CAPTIONS.test(f)) && !used.has(f)) warnings.push(`${f}: no ::video uses this file — the import drops it`);
	const rootPages = pages.filter((p) => !p.includes("/") && !/^(index|readme)\.md$/i.test(p));
	if (rootPages.length) warnings.push(`${rootPages.join(", ")}: pages outside a folder land in a group called "General"; put them in a topic folder`);
	if (!pages.some((p) => /^(index|readme)\.md$/i.test(p))) warnings.push("no index.md at the top; the platform writes a plain welcome page instead");

	return {
		errors,
		warnings,
		stats: { pages: pages.length, images: images.size, bytes: total, groups: new Set(pages.filter((p) => p.includes("/")).map((p) => p.split("/")[0])).size, todos },
	};
}

export function report({ errors, warnings, stats }) {
	for (const e of errors) console.log(`✗ ${e}`);
	for (const w of warnings) console.log(`! ${w}`);
	if (stats.pages !== undefined)
		console.log(`\n${stats.pages} page(s) in ${stats.groups} group(s), ${stats.images} image(s), ${(stats.bytes / 1048576).toFixed(1)} MB — ${errors.length} error(s), ${warnings.length} warning(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const dir = process.argv[2];
	if (!dir) {
		console.log("Usage: node validate.mjs <docs-dir>");
		process.exit(1);
	}
	const result = validate(dir);
	report(result);
	process.exit(result.errors.length ? 1 : 0);
}

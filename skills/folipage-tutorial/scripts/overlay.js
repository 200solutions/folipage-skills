/*
 * Browser-side helpers for clean tutorial screenshots.
 *
 * capture.mjs injects this file into every page it opens. An agent driving
 * its own browser tool can evaluate the file as-is, then call the helpers:
 *
 *   window.__folipage.prepare()                      freeze animations, hide scrollbars and the caret
 *   window.__folipage.mask(["css selector", ...])     blur personal data
 *   window.__folipage.hide(["css selector", ...])     hide chat widgets, banners, custom scrollbars
 *   window.__folipage.replaceText([["real", "fake"]]) swap text such as names or e-mails
 *   window.__folipage.setRing({ color: "#e11d48" })   the ring colour for this page (default neutral black)
 *   window.__folipage.highlight("css selector" | element | {x, y, width, height}, { color, padding, label })
 *                                                mark what the reader clicks (a ring on the site)
 *   window.__folipage.dim(0.35)                      darken everything outside the marks on the site
 *   window.__folipage.highlightOf(clip, scale)      the marks as a folipage highlight (JSON), in the
 *                                                pixels of a screenshot of `clip` taken at `scale`
 *   window.__folipage.show(true)                     also draw the marks in the page, to check them by eye
 *   window.__folipage.clear()                         forget the marks and the dimming again
 *
 * The screenshot itself stays clean: folipage draws the rings over it on the
 * site, from the `highlight='…'` attribute of an `::image` directive, so they
 * stay sharp, follow the theme and can be moved later in the editor.
 */
(() => {
	if (window.__folipage) return;

	const STYLE_ID = "__folipage-style";
	const LAYER_ID = "__folipage-layer";
	// Neutral black ring by default; the author may pick the brand colour
	// instead. A thin halo in the opposite brightness keeps it visible on any
	// background.
	const DEFAULT_COLOR = "#111111";
	let ringColor = DEFAULT_COLOR;
	/** The marks since the last clear(), in viewport pixels. */
	let rings = [];
	/** The dimming asked for since the last clear(), 0 for none. */
	let dimmed = 0;
	/** Whether the marks are drawn in the page too (to check them by eye); never in a screenshot. */
	let shown = false;

	/**
	 * Any CSS colour as the `#rrggbb` a folipage highlight takes (`red`,
	 * `#E11D48`, `rgb(…)`); null when it is not an opaque colour.
	 */
	function toHex(color) {
		const text = String(color ?? "").trim().toLowerCase();
		const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
		if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
		if (/^#[0-9a-f]{6}$/.test(text)) return text;
		try {
			const ctx = document.createElement("canvas").getContext("2d");
			ctx.fillStyle = "#000000";
			ctx.fillStyle = text;
			const out = String(ctx.fillStyle).toLowerCase();
			return /^#[0-9a-f]{6}$/.test(out) && (out !== "#000000" || /^(black|#000|rgb\(0, ?0, ?0\))$/.test(text)) ? out : null;
		} catch {
			return null;
		}
	}

	/** The colour asked for as #rrggbb, or the fallback (with a warning) when it is not one. */
	function ringHex(color, fallback) {
		const hex = toHex(color);
		if (!hex) console.warn(`[folipage] "${color}" is not an opaque colour; using ${fallback}`);
		return hex ?? fallback;
	}

	/** Relative luminance of a #rgb / #rrggbb colour, 0 (black) … 1 (white). */
	function luminance(color) {
		const hex = String(color).trim().replace(/^#/, "");
		const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
		if (!/^[0-9a-f]{6}$/i.test(full)) return 0;
		const [r, g, b] = [0, 2, 4].map((i) => {
			const v = parseInt(full.slice(i, i + 2), 16) / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	function setRing(options = {}) {
		if (options.color) ringColor = ringHex(options.color, DEFAULT_COLOR);
	}

	function prepare() {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = `
			*, *::before, *::after {
				animation-duration: 0s !important;
				animation-delay: 0s !important;
				transition-duration: 0s !important;
				transition-delay: 0s !important;
				caret-color: transparent !important;
			}
			* { scrollbar-width: none !important; }
			::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
			[data-folipage-mask] { filter: blur(6px) !important; }
			[data-folipage-hide] { visibility: hidden !important; }
		`;
		(document.head || document.documentElement).appendChild(style);
	}

	function resolve(target) {
		if (!target) return null;
		if (target instanceof Element) return target;
		return document.querySelector(target);
	}

	function layer() {
		let el = document.getElementById(LAYER_ID);
		if (!el) {
			el = document.createElement("div");
			el.id = LAYER_ID;
			el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
			document.documentElement.appendChild(el);
		}
		return el;
	}

	/** Marks the element; returns its box in viewport coordinates, or null. */
	function highlight(target, options = {}) {
		const pad = options.padding ?? 6;
		// A plain { x, y, width, height } box rings an element in an iframe, measured by the caller.
		const isBox = target && typeof target === "object" && !(target instanceof Element) && typeof target.x === "number";
		const el = isBox ? null : resolve(target);
		if (!el && !isBox) return null;
		const box = isBox ? { left: target.x, top: target.y, width: target.width, height: target.height } : el.getBoundingClientRect();
		// Follow the element's own rounding, so pills get a pill-shaped ring.
		const radius = Math.min(el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : 4, box.height / 2) + pad;
		const color = options.color ? ringHex(options.color, ringColor) : ringColor;
		const ring = { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, radius, color };
		if (options.label) ring.label = String(options.label).slice(0, 3);
		rings.push(ring);
		if (shown) draw();
		return { x: box.left, y: box.top, width: box.width, height: box.height };
	}

	/** The marks drawn in the page, only to check them by eye (show(true)). */
	function draw() {
		document.getElementById(LAYER_ID)?.remove();
		if (!shown || (!rings.length && !dimmed)) return;
		const el = layer();
		if (dimmed) el.appendChild(veil());
		for (const r of rings) {
			const halo = luminance(r.color) > 0.5 ? "#111111" : "#ffffff";
			const ring = document.createElement("div");
			ring.style.cssText = [
				"position:absolute",
				`left:${r.left}px`,
				`top:${r.top}px`,
				`width:${r.width}px`,
				`height:${r.height}px`,
				`border:3px solid ${r.color}`,
				`border-radius:${r.radius}px`,
				`box-shadow:0 0 0 2px ${halo}, inset 0 0 0 1px ${halo}`,
				"box-sizing:border-box",
				"z-index:1",
			].join(";");
			el.appendChild(ring);
		}
	}

	/**
	 * Darkens the picture around the marks with a soft black veil on the site,
	 * so the eye lands on what is ringed. Optional: worth it on busy screens
	 * with one focal element, not on a plain form.
	 */
	function dim(amount = 0.35) {
		dimmed = Math.max(0, Math.min(0.8, Number(amount) || 0));
		if (shown) draw();
	}

	/** The veil of dim(), drawn in the page by show(true). */
	function veil() {
		const ns = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(ns, "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.style.cssText = "position:absolute;inset:0;z-index:0";
		const defs = document.createElementNS(ns, "defs");
		const cut = document.createElementNS(ns, "mask");
		cut.id = `${LAYER_ID}-cut`;
		const all = document.createElementNS(ns, "rect");
		for (const [k, v] of Object.entries({ x: 0, y: 0, width: "100%", height: "100%", fill: "white" })) all.setAttribute(k, v);
		cut.appendChild(all);
		for (const r of rings) {
			const hole = document.createElementNS(ns, "rect");
			for (const [k, v] of Object.entries({ x: r.left, y: r.top, width: r.width, height: r.height, rx: r.radius, fill: "black" }))
				hole.setAttribute(k, String(v));
			cut.appendChild(hole);
		}
		defs.appendChild(cut);
		svg.appendChild(defs);
		const rect = document.createElementNS(ns, "rect");
		for (const [k, v] of Object.entries({ x: 0, y: 0, width: "100%", height: "100%", fill: "#000", "fill-opacity": dimmed, mask: `url(#${cut.id})` }))
			rect.setAttribute(k, String(v));
		svg.appendChild(rect);
		return svg;
	}

	/**
	 * The marks as a folipage highlight: the JSON of `::image{… highlight='…'}`,
	 * in the pixels of the screenshot — `clip` (viewport pixels, the area shot)
	 * times `scale` (the device scale factor). A mark partly outside the clip
	 * is cut to it; one wholly outside is left out. Null without marks.
	 */
	function highlightOf(clip, scale = 1) {
		const px = (n) => Math.round(n * scale);
		const width = px(clip.width);
		const height = px(clip.height);
		const marks = [];
		for (const r of rings) {
			const x1 = Math.max(r.left, clip.x);
			const y1 = Math.max(r.top, clip.y);
			const x2 = Math.min(r.left + r.width, clip.x + clip.width);
			const y2 = Math.min(r.top + r.height, clip.y + clip.height);
			if (x2 - x1 < 1 || y2 - y1 < 1) continue;
			const mark = { x: px(x1 - clip.x), y: px(y1 - clip.y), width: px(x2 - x1), height: px(y2 - y1) };
			mark.width = Math.min(mark.width, width - mark.x);
			mark.height = Math.min(mark.height, height - mark.y);
			const radius = Math.min(px(r.radius), Math.floor(Math.min(mark.width, mark.height) / 2));
			if (radius > 0) mark.radius = radius;
			if (r.color !== ringColor) mark.color = r.color;
			if (r.label) mark.label = r.label;
			marks.push(mark);
		}
		if (!marks.length) return null;
		const out = { width, height };
		if (dimmed) out.dim = Math.round(dimmed * 100) / 100;
		if (ringColor !== DEFAULT_COLOR) out.color = ringColor;
		out.marks = marks;
		return out;
	}

	function show(on = true) {
		shown = Boolean(on);
		draw();
	}

	function mask(selectors) {
		for (const selector of selectors || []) {
			for (const el of document.querySelectorAll(selector)) el.setAttribute("data-folipage-mask", "");
		}
	}

	function hide(selectors) {
		for (const selector of selectors || []) {
			for (const el of document.querySelectorAll(selector)) el.setAttribute("data-folipage-hide", "");
		}
	}

	function replaceText(pairs) {
		if (!pairs || !pairs.length) return;
		const swap = (text) => pairs.reduce((out, [from, to]) => out.split(from).join(to), text);
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const next = swap(node.nodeValue);
			if (next !== node.nodeValue) node.nodeValue = next;
		}
		for (const field of document.querySelectorAll("input, textarea")) {
			const next = swap(field.value);
			if (next !== field.value) field.value = next;
		}
	}

	function clear() {
		document.getElementById(LAYER_ID)?.remove();
		rings = [];
		dimmed = 0;
	}

	window.__folipage = { prepare, setRing, highlight, dim, highlightOf, show, mask, hide, replaceText, clear };
})();

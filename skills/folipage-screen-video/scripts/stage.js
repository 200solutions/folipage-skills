/*
 * Browser-side stage for screen recordings: a visible cursor, click ripples,
 * a highlight ring, a key badge, and privacy (mask, hide, replace text) that
 * holds through every re-render.
 *
 * record.mjs injects this file into every page before the page's own scripts.
 * The privacy settings come in window.__stageConfig, set just before it.
 *
 *   window.__stage.place(x, y)                put the cursor somewhere at once
 *   window.__stage.move(x, y, ms)             glide the cursor there
 *   window.__stage.press(x, y)                the click ripple
 *   window.__stage.ring(element | box, { color })  ring an element (or an {x, y, width, height} box); ring(null) removes it
 *   window.__stage.keys("Ctrl + K")           a short badge with the keys pressed
 */
(() => {
	if (window.__stage) return;

	const config = window.__stageConfig ?? {};
	const KEY = "__stage-cursor";
	const ROOT_ID = "__stage-root";
	let ringTarget = null;
	let ringOptions = {};

	/* --------------------------------------------------------- privacy */

	const swap = (text) => (config.replaceText ?? []).reduce((out, [from, to]) => out.split(from).join(to), text);

	function swapNode(node) {
		const next = swap(node.nodeValue);
		if (next !== node.nodeValue) node.nodeValue = next;
	}

	/** The element itself and everything under it that matches. */
	const within = (root, selector) => [...(root.matches?.(selector) ? [root] : []), ...(root.querySelectorAll?.(selector) ?? [])];

	function scrub(root) {
		for (const selector of config.mask ?? []) for (const el of within(root, selector)) el.setAttribute("data-stage-mask", "");
		for (const selector of config.hide ?? []) for (const el of within(root, selector)) el.setAttribute("data-stage-hide", "");
		if (!config.replaceText?.length) return;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) swapNode(node);
		for (const field of within(root, "input, textarea")) {
			const next = swap(field.value);
			if (next !== field.value) field.value = next;
		}
	}

	/* ----------------------------------------------------------- stage */

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

	const halo = (color) => (luminance(color) > 0.5 ? "#111111" : "#ffffff");

	function style() {
		const css = document.createElement("style");
		css.textContent = `
			[data-stage-mask] { filter: blur(6px) !important; }
			[data-stage-hide] { visibility: hidden !important; }
			${config.hideScrollbars === false ? "" : "* { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; }"}
			#${ROOT_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
			#${ROOT_ID} .cursor { position: absolute; left: 0; top: 0; width: 28px; height: 28px; will-change: transform;
				filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
			#${ROOT_ID} .cursor svg { display: block; transition: transform 120ms ease-out; transform-origin: 4px 3px; }
			#${ROOT_ID} .cursor.down svg { transform: scale(.82); }
			#${ROOT_ID} .ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
				border: 2px solid var(--stage-ring); opacity: .9; animation: __stage-ripple 520ms ease-out forwards; }
			@keyframes __stage-ripple { to { transform: scale(3.6); opacity: 0; } }
			#${ROOT_ID} .ring { position: absolute; border: 3px solid var(--stage-ring); box-sizing: border-box;
				box-shadow: 0 0 0 2px var(--stage-halo); animation: __stage-in 220ms ease-out; }
			@keyframes __stage-in { from { opacity: 0; transform: scale(1.06); } }
			#${ROOT_ID} .keys { position: absolute; left: 50%; bottom: 48px; transform: translateX(-50%); padding: 10px 18px;
				border-radius: 12px; background: rgba(17,17,17,.88); color: #fff; font: 600 20px/1.2 system-ui, sans-serif;
				letter-spacing: .02em; animation: __stage-in 160ms ease-out; }
		`;
		document.documentElement.appendChild(css);
	}

	function root() {
		let el = document.getElementById(ROOT_ID);
		if (!el) {
			const color = config.ringColor || "#111111";
			el = document.createElement("div");
			el.id = ROOT_ID;
			el.style.setProperty("--stage-ring", color);
			el.style.setProperty("--stage-halo", halo(color));
			document.documentElement.appendChild(el);
		}
		return el;
	}

	function savedCursor() {
		try {
			return JSON.parse(sessionStorage.getItem(KEY));
		} catch {
			return null;
		}
	}

	function cursor() {
		// Iframes get the privacy scrub only; the cursor and rings belong to the top page.
		if (config.cursor === false || window.top !== window) return null;
		let el = root().querySelector(".cursor");
		if (!el) {
			el = document.createElement("div");
			el.className = "cursor";
			el.innerHTML =
				'<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 3 L4 22 L9.2 17.4 L12.6 25 L16 23.5 L12.7 16 L19.5 16 Z" ' +
				'fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
			const start = savedCursor() ?? { x: innerWidth * 0.62, y: innerHeight * 0.58 };
			el.style.transform = `translate(${start.x}px, ${start.y}px)`;
			root().appendChild(el);
		}
		return el;
	}

	function remember(x, y) {
		try {
			sessionStorage.setItem(KEY, JSON.stringify({ x, y }));
		} catch {
			// Storage blocked: the cursor starts from its default spot after a navigation.
		}
	}

	function place(x, y) {
		const el = cursor();
		if (!el) return;
		el.style.transition = "none";
		el.style.transform = `translate(${x}px, ${y}px)`;
		remember(x, y);
	}

	function move(x, y, ms = 600) {
		const el = cursor();
		if (!el) return;
		el.style.transition = `transform ${ms}ms cubic-bezier(.45,.05,.25,1)`;
		el.style.transform = `translate(${x}px, ${y}px)`;
		remember(x, y);
	}

	function press(x, y) {
		const dot = document.createElement("div");
		dot.className = "ripple";
		dot.style.left = `${x}px`;
		dot.style.top = `${y}px`;
		root().appendChild(dot);
		setTimeout(() => dot.remove(), 600);
		const el = cursor();
		if (el) {
			el.classList.add("down");
			setTimeout(() => el.classList.remove("down"), 140);
		}
	}

	function drawRing() {
		root().querySelector(".ring")?.remove();
		// A plain { x, y, width, height } box rings an element inside an iframe; it does not follow scrolling.
		const isBox = ringTarget && !(ringTarget instanceof Element) && typeof ringTarget.x === "number";
		if (!isBox && !ringTarget?.isConnected) return;
		const pad = ringOptions.padding ?? 6;
		const box = isBox ? { left: ringTarget.x, top: ringTarget.y, width: ringTarget.width, height: ringTarget.height } : ringTarget.getBoundingClientRect();
		const radius = Math.min(isBox ? 4 : parseFloat(getComputedStyle(ringTarget).borderTopLeftRadius) || 0, box.height / 2) + pad;
		const el = document.createElement("div");
		el.className = "ring";
		Object.assign(el.style, {
			left: `${box.left - pad}px`,
			top: `${box.top - pad}px`,
			width: `${box.width + pad * 2}px`,
			height: `${box.height + pad * 2}px`,
			borderRadius: `${radius}px`,
		});
		if (ringOptions.color) {
			el.style.borderColor = ringOptions.color;
			el.style.boxShadow = `0 0 0 2px ${halo(ringOptions.color)}`;
		}
		root().appendChild(el);
	}

	function ring(element, options = {}) {
		ringTarget = element ?? null;
		ringOptions = options;
		drawRing();
	}

	let keysTimer;
	function keys(label) {
		root().querySelector(".keys")?.remove();
		const el = document.createElement("div");
		el.className = "keys";
		el.textContent = label;
		root().appendChild(el);
		clearTimeout(keysTimer);
		keysTimer = setTimeout(() => el.remove(), 1100);
	}

	/* ------------------------------------------------------------ boot */

	/**
	 * Init scripts run before the document has its root element, so the stage
	 * builds itself on the first chance it gets: the first mutation, or the
	 * first call from record.mjs.
	 */
	let built = false;
	function ensure() {
		if (built || !document.documentElement) return;
		built = true;
		style();
		cursor();
		scrub(document.documentElement);
	}

	// Observing the document itself catches every node the parser adds, from
	// the very first one. Mutation callbacks run before the next paint, so real
	// names never reach a frame.
	new MutationObserver((records) => {
		ensure();
		for (const r of records) {
			if (r.type === "characterData") swapNode(r.target);
			else
				for (const node of r.addedNodes) {
					if (node.nodeType === 1) scrub(node);
					else if (node.nodeType === 3) swapNode(node);
				}
		}
	}).observe(document, { subtree: true, childList: true, characterData: true });
	addEventListener("scroll", () => built && drawRing(), { passive: true, capture: true });
	addEventListener("resize", () => built && drawRing());

	const ready =
		(fn) =>
		(...args) => {
			ensure();
			return fn(...args);
		};
	window.__stage = {
		place: ready(place),
		move: ready(move),
		press: ready(press),
		ring: ready(ring),
		keys: ready(keys),
		scrub: ready(() => scrub(document.documentElement)),
	};
	ensure();
})();

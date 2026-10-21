---
name: folipage-tutorial
description: Walk through a web application, take clean annotated screenshots and write a step-by-step user tutorial in Markdown in the Folipage format, then validate it and package it as a ZIP ready to upload to Folipage. Use when the user asks for a tutorial, user guide, how-to, help center, onboarding docs or product documentation of a web app or website, or wants documentation content for Folipage.
metadata:
  version: "1.0.0"
---

# Folipage tutorial

You turn a working web app into a task-based tutorial: you use the app the way
a new user would, screenshot each important moment with the element to click
highlighted, write short Markdown pages in the Folipage format and hand back one
ZIP that the user uploads to Folipage.

The result is only as good as what you actually saw. Never describe a screen,
a label or a step you did not see in the app.

## Files in this skill

| File | Read it |
| --- | --- |
| `scripts/check-version.mjs` | Run first, every time (below). |
| `references/folipage-format.md` | Before writing any page — folder layout, frontmatter, steps, callouts, images, limits. |
| `references/writing-guide.md` | Before writing — how to structure tasks and phrase steps. |
| `references/screenshot-guide.md` | Before taking screenshots. |
| `scripts/capture.mjs` | Playwright runner: `login`, `inspect`, `run <flows.json>`. |
| `scripts/overlay.js` | In-page helper (measuring the highlight marks, masking, freezing animations) used by capture.mjs or injected by hand. |
| `scripts/validate.mjs` | Checks the docs folder against the Folipage import rules. |
| `scripts/package.mjs` | Validates and writes the ZIP (no dependencies). |
| `assets/page-template.md`, `assets/flows.example.json` | Starting points. |

Below, `$SKILL` is the directory this file is in.

## First: version check

Before anything else, every time this skill is used, run:

```bash
node $SKILL/scripts/check-version.mjs
```

- `OK` — carry on.
- `UPDATE AVAILABLE` — tell the user, in their language, that a newer version
  of this skill exists and recommend downloading it from the address in the
  output; the new ZIP replaces this skill's folder. Then carry on with this
  version unless the user wants to update first.
- `CHECK SKIPPED` — carry on; there is no need to mention it.

## Workflow

### 1. Intake

Ask for what you do not know yet, in one message:

- **The app's URL** and whether it needs signing in.
- **Who the readers are** (end users, admins, new customers…) and what they
  need to get done. If the user is unsure, propose the 5–10 most important tasks
  after exploring.
- **Language of the tutorial** — English unless the user says otherwise.
- **Scope** — the whole app or specific areas.
- **Colour of the highlight rings** — neutral black by default; offer the
  app's brand colour or a signal colour (e.g. red `#e11d48`) as alternatives,
  and ask for a hex value if they name one. Use the answer for every
  screenshot (`ringColor` in `flows.json`, `window.__folipage.setRing()` in mode B).
- **Videos** — only when the sibling skills `folipage-screen-video` (and, for a
  spoken voice, `folipage-video-voiceover`) are installed next to this one
  (`$SKILL/../folipage-screen-video/SKILL.md`). Offer: no videos (default), short
  silent screen videos, or videos with a voiceover. The voice speaks the
  tutorial's language unless the user wants another one — ask, and ask for
  the variant or formality where it matters (see step 0 of the voiceover
  skill). Videos fit the main tasks, not every page — let
  the user pick, or propose two or three. If the skills are missing, do not
  offer videos; mention that they exist if the user asks for any.

Tell the user plainly:

- You will **really click through the app**. Anything you create, send or
  change happens for real. Ask for a **demo or test account with demo data**,
  or a staging environment, whenever there is one.
- **You never type passwords.** If the app needs signing in, the user signs in
  themselves in a browser window you open (see Capture modes), and you reuse
  that session.

### 2. Explore and propose an outline — then stop

Walk through the app without taking final screenshots: the main navigation,
each area in scope, the forms and dialogs of the main tasks. With capture mode
A use `node $SKILL/scripts/capture.mjs inspect <url>` on each important page
(it lists headings, navigation, buttons, fields and saves a look-screenshot);
otherwise use your browser tool's page reading.

Then propose the outline: groups (folders), and in each the task pages with a
one-line description, plus anything you could not reach, and — if videos were
asked for — which tasks get one. Write the group names
exactly as the reader should see them in the sidebar, in the tutorial's
language with its diacritics — `02-Psaní obsahu`, not `02-psani-obsahu` (see
`references/folipage-format.md`). **Wait for the user
to approve or change it before you capture or write anything.**

### 3. Capture

Pick the capture mode by what your environment can do — check, do not ask:

**A. Playwright (preferred).** You can run shell commands with Node.js 18+ and
reach the app's URL from that shell.

```bash
npm install --prefix .folipage-tutorial playwright
(cd .folipage-tutorial && npx playwright install chromium)
node $SKILL/scripts/capture.mjs login https://app.example.com --until "/dashboard"
node $SKILL/scripts/capture.mjs run flows.json
```

- `login` opens a visible browser; the user signs in, you continue when the
  address matches `--until` (or when they close the tab). The session is saved
  in `.folipage-tutorial/state.json`. Skip it for public pages. If a headless
  browser cannot be opened for `login`, fall back to mode B for the sign-in.
- Describe every task as a flow in `flows.json` (see
  `assets/flows.example.json`): the actions that lead to each screen and a
  `shot` for each screenshot, with `alt`, `caption`, `highlight` (a target
  or a list), `labels`, `crop`, `mask`, `hide`, `replaceText`, `ringColor`
  and `dim`. `mask`, `hide`, `replaceText`, `ringColor` and `dim` also work
  for the whole file at the top level. `crop` is `"viewport"` (default),
  `"full"` (whole page, no highlight), `"target"` (around `target` or the
  first highlight) or a target.
- The screenshots stay clean: for every shot with `highlight` the runner
  prints the `::image{src="…" alt="…" highlight='…'}` line to paste into the
  page (folipage draws the marks over the picture; see
  `references/folipage-format.md`), keeps it in
  `.folipage-tutorial/highlights.json`, and saves a copy with the marks drawn
  in under `.folipage-tutorial/check/` — look at that copy, not the clean PNG,
  to see whether the right thing is ringed.
- Actions: `goto {url}`, `click|hover|check|uncheck|scroll {target}`,
  `fill {target, value}`, `select {target, value}`, `press {key, target?}`,
  `wait {target | url (regex) | ms}`, `shot {file, …}`, `inspect {label}`.
  A target is a selector string or `{role, name}`, `{label}`, `{placeholder}`,
  `{text}`, `{testId}`, `{css}`, optionally with `exact`, `nth`, `within`. It
  must match exactly one visible element. An element inside an iframe (an
  editor's live preview, an embedded widget) takes `"frame": "<iframe
  selector>"`, e.g. `{"frame": "iframe[title=Preview]", "text": "Welcome"}`;
  it can be clicked, filled and highlighted like any other.
  Prefer role-based targets (`{"role": "button", "name": "Save"}`) over CSS.
- When a step fails, the runner saves the page to
  `.folipage-tutorial/errors/<flow>-step-N.png` — look at it, fix the flow and
  re-run just that flow with `--only <id>`.
- Keep `flows.json` next to the docs: it lets anyone re-shoot all screenshots
  after the app changes.

**B. Browser tool.** No usable shell or Playwright, but you have a browser
tool that can run JavaScript in the page and save screenshots to files.

- Set the window to 1440 × 900. Inject the helper once per page load by
  evaluating the contents of `scripts/overlay.js`, then call
  `window.__folipage.prepare()`, `window.__folipage.mask([...selectors])`,
  `window.__folipage.hide([...selectors])`,
  `window.__folipage.replaceText([["Real Name", "Jane Doe"]])` and
  `window.__folipage.setRing({ color: "#e11d48" })` (the chosen ring colour),
  `window.__folipage.highlight("css selector or element", { label: "1" })`
  (label optional) and, when the shot benefits from it,
  `window.__folipage.dim(0.35)` before each screenshot. Nothing is drawn: take
  the screenshot of the whole window, then read the marks with
  `JSON.stringify(window.__folipage.highlightOf({ x: 0, y: 0, width: innerWidth, height: innerHeight }, devicePixelRatio))`
  and write the image as `::image{src="./images/…" alt="…" highlight='<that JSON>'}`.
  To check the placement, `window.__folipage.show(true)` draws the marks in
  the page for a look (never for the saved screenshot); then
  `window.__folipage.clear()`.
- Save each screenshot straight into the docs folder under the planned name.
- For signing in, open the login page and ask the user to sign in in that
  browser themselves.

**C. No way to save screenshots.** Write the pages anyway, with the image
references in place, and add a `SHOTLIST.md` at the top of your output
(outside the docs folder) listing each file, the screen, what to highlight
and what to hide. Say clearly in your report that the screenshots are
missing; do not package a ZIP that points at missing images — `package.mjs`
refuses it.

Whatever the mode, follow `references/screenshot-guide.md`: one viewport, one
theme, the highlight ring in the agreed colour on the element to act on
(optionally with the page around it dimmed) — as `highlight` JSON over a
clean picture, never painted in — personal data
masked, no spinners or pop-ups. **Open every screenshot and look at it**
before you use it: is the right thing highlighted, is anything personal
visible, did the page finish loading?

**Safety while capturing.** Before any action that sends messages or e-mails,
invites people, charges money, publishes, or deletes or overwrites data, stop
and ask the user — even on a demo account. Prefer showing the dialog and
screenshotting it without confirming. Never enter passwords, card numbers or
other secrets; never create accounts.

### 4. Write

Write the pages following `references/folipage-format.md` and
`references/writing-guide.md`; start from `assets/page-template.md`. Default
layout of the working folder:

```
tutorial/
├── flows.json
└── docs/
    ├── index.md                   front page: what the app is, where to start
    ├── 01-Getting started/
    │   ├── README.md
    │   ├── sign-in.md
    │   └── images/…
    └── 02-Invoices/
        ├── README.md
        ├── create-an-invoice.md
        └── images/…
```

Where you could not do or verify something, leave `TODO(folipage): …` in the text
instead of guessing.

### 5. Videos (optional)

Only when the user asked for videos in the intake. Read
`$SKILL/../folipage-screen-video/SKILL.md` and, for a voice,
`$SKILL/../folipage-video-voiceover/SKILL.md`, and follow them; here is how they fit
into the tutorial:

- **Script from the flows.** Write `tutorial/video.json` (folipage-screen-video
  format). Its actions and targets are the same as in `flows.json`, so reuse
  the targets that already worked. Add `say` lines in the tutorial's
  language, worded like the page's steps but for the ear, and set
  `"language"` to the voice language agreed in the intake. Use the same
  `replaceText`, `mask`, `hide` and `ringColor` as the screenshots, and the
  session from the screenshots: `--state .folipage-tutorial/state.json`.
- **Approval.** Show the narration lines per video and wait for the user's
  yes before generating any voice or recording.
- **Order:** `record.mjs narration` → `voiceover.mjs synth` →
  `record.mjs record --durations` → `voiceover.mjs mix`. Output goes to
  `tutorial/videos/`.
- **Into the pages — the video travels in the ZIP.** Copy the final MP4
  (the `.<lang>.mp4` with the voice, e.g. `.cs.mp4`) and its `.vtt` into a `videos/` folder next
  to the page, e.g. `docs/01-Práce v editoru/videos/uprava-textu.mp4`, and add
  one `::video{src="./videos/<id>.mp4" captions="./videos/<id>.vtt" caption="…" alt="…"}`
  right after the page's introduction (see "Videos" in
  `references/folipage-format.md`). The import uploads both and the portal
  plays them; nothing has to be published elsewhere. A video must be MP4
  (H.264) or WebM, at most 50 MB; the whole ZIP at most 100 MB.

### 6. Validate and package

```bash
node $SKILL/scripts/validate.mjs tutorial/docs
node $SKILL/scripts/package.mjs tutorial/docs tutorial/<app-name>-tutorial.zip
```

Fix every error; read every warning and fix it unless it is intentional.
`package.mjs` refuses to build a ZIP while there are errors.

### 7. Hand over

Give the user the path to the ZIP and a short report:

- the pages it contains (grouped), and the number of screenshots;
- every `TODO(folipage)` left, and anything you skipped or could not reach, with
  the reason;
- what was masked or replaced in the screenshots;
- how to upload it:
  - **New portal:** in Folipage, create a new portal and choose **Nahrát ZIP s
    Markdownem** (Upload a ZIP with Markdown).
  - **Existing portal:** open the portal, the **Zdroj** (Source) tab, and
    choose **Nahrát ZIP**. This **replaces all the portal's content** with the
    ZIP; the previous version stays in the history.
- that `flows.json` re-shoots every screenshot with `capture.mjs run` when the
  app changes;
- with videos: each MP4 with its length and the page it plays on, and that
  `video.json` re-records them after the app changes.

## Rules

- Only what you saw: labels copied from the screen, steps you performed.
- The user approves the outline before you capture and write.
- No passwords, no account creation, no destructive or outward-facing action
  without asking first.
- No personal data in text or screenshots.
- The output is Markdown in the Folipage format only — no MDX, no custom
  components, no HTML images. Videos as `::video` with files in the ZIP, or
  `::embed` with a real `https://` address the user gave you.

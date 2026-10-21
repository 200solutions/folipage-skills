# Screenshots

Good screenshots are consistent, focused and clean. The same rules apply
whichever way they are taken (see the capture modes in SKILL.md).

## Consistency

- One window size for the whole tutorial: **1440 × 900**, at **2× scale**
  (sharp on retina screens; the build scales them down for the web).
- One colour theme for the whole tutorial — the app's default, usually light.
  Do not mix light and dark screenshots.
- The same demo data throughout: the invoice created in one page is the one
  shown in the next.
- Take all screenshots of a tutorial in one session, so the app looks the same
  in every image.

## Focus

- **Highlight what the reader acts on** with a ring (`highlight` in a flow;
  `window.__folipage.highlight()` in the fallback). One ring per image, two at
  most. The ring is neutral black unless the user chose another colour at
  intake — then that colour everywhere (`"ringColor": "#e11d48"` at the top of
  `flows.json`, or per shot). A thin halo in the opposite brightness is added
  automatically, so any colour stays visible on light and dark screens.
- **The screenshot stays clean.** The ring is not painted into the PNG:
  capture.mjs measures it and prints the `::image{… highlight='…'}` line for
  the page (also kept in `.folipage-tutorial/highlights.json`). Folipage draws
  the ring over the picture on the site, sharp at any zoom and in dark mode,
  and the author can still move it in the editor. Paste that line as it is —
  only the `alt` (from the shot's `"alt"`) is yours to word.
- **Number the marks** when one picture shows several things the text walks
  through in order (`"labels": ["1", "2"]`, one per `highlight` target). The
  text then refers to them: “Fill in the customer (1) and the due date (2).”
- **Dim the rest when it helps** (`"dim": true` on a shot, or a number 0–0.8
  for the strength; `window.__folipage.dim(0.35)` in the fallback). Folipage
  lays a soft black veil over everything outside the rings, so the eye lands
  on the ringed element. It is a judgement call, not a rule: use it on busy
  screens where the element is small or easy to miss (a toolbar icon, one
  menu item among many, a setting deep in a long form); skip it on plain forms
  and dialogs where the ring alone is obvious, and on orientation shots whose
  point is the whole screen. Keep the strength around 0.3–0.4 — the dimmed
  part must stay readable. Be consistent within one page.
- **Crop to the part that matters** when the whole window is noise: a dialog,
  a form, a panel. Use `crop: "target"` with generous padding (48 px) so the
  reader still recognises where on the screen it is. Keep full-window shots for
  orientation: the first screenshot of a page and whenever the reader moves to
  a new screen.
- Show the state **after** the previous step and **before** the action the
  ring points at: the menu open, the field empty, the button visible.
- Close toasts, cookie banners and onboarding pop-ups that are not part of
  the task before shooting. What cannot be closed (chat bubbles, feedback
  tabs, custom scrollbars) goes in `hide`.

## Clean

- Animations frozen, no caret, no scrollbars, no mouse pointer (the overlay
  and capture.mjs do this).
- Wait until loading is finished: no spinners or skeleton placeholders.
- **No personal data.** Use a demo account and demo data. Where real names,
  e-mails, phone numbers, addresses, account numbers, API keys or tokens show,
  blur them (`mask`) or swap them for obviously fake ones (`replaceText`):
  Jane Doe, jane.doe@example.com, +1 555 0100. Check every image before you
  package it.
- Never screenshot a password field with anything typed in it.

## Files

- Save images in `images/` inside the topic folder, next to the pages that use
  them.
- Name them after the page and the step: `create-invoice-1.png`,
  `create-invoice-2.png`. Lowercase, dashes, no spaces.
- PNG for screenshots. Do not resize or compress them; the build does.

## Alt text and captions

- Alt text says what the image shows and what is highlighted, in one sentence:
  “The invoice list with the New invoice button in the top right corner
  highlighted.” Not “Screenshot”, not the file name.
- A caption (the quoted text after the path, or `caption="…"` on an
  `::image`) only when it adds something the
  step does not already say. Most step screenshots need none.

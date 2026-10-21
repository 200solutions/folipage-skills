# Directing a walkthrough video

## Length and scope

- **One task, one video.** "Založení faktury", not "Fakturace". 30–90
  seconds; past two minutes, split it.
- Start on the screen where the task starts (`start`), already loaded — no
  login, no typing the address.
- End on the result (the saved record, the success message), held for a
  second or two (`tail`).

## Pacing

- Let the eye arrive before the hand moves: a line of narration, then the
  action. `"say"` on the action does exactly that.
- Ring what you talk about when it is not obvious (`"ring": true` on a
  click, or a `ring` step while the line plays). Do not ring every click.
- Type real-looking but fictional data, short: "Gama spol. s r.o.", not
  "Test test 123".
- Avoid scrolling back and forth. If the target is far down, a single
  `scroll` to it, then act.
- Use `pause` sparingly; the narration timing already holds the picture.
- Native dropdowns (`<select>`) do not show their option list in a recording;
  the value just changes. Say what you choose.

## Narration

Read the `folipage-video-voiceover` skill's `references/narration-guide.md`. In short:
one idea per line, what to do and where, labels exactly as on the screen,
first line the goal, last line the result.

## Screen hygiene

- A demo account with tidy demo data; nothing that looks like a real
  customer. `replaceText` and `mask` for what cannot be changed.
- `hide` chat widgets, cookie bars, "what's new" pop-ups and anything
  that blinks.
- Light theme unless the product is dark-first; same theme in all videos of
  one tutorial.
- Text must be readable at 1080p on a laptop: keep the 1280 × 720 viewport
  with scale 1.5. For dense apps that need more room, 1440 × 810 with scale
  1.333 still gives 1920 × 1080.

## Before you hand it over

Pull frames at each narration start and at the end; check the cursor is on
the right element, the ring is on the right thing, the page has finished
loading, and no real personal data is visible.

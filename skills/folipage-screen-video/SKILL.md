---
name: folipage-screen-video
description: Record a polished screen video of a web application from a script — a visible cursor that glides and clicks, highlight rings, typed text, smooth scrolling, personal data hidden — as a Full HD MP4, timed for a narration. Use when the user wants a screen recording, walkthrough video, demo video, how-to video, video tutorial or product video of a web app or website, or a video for documentation. Pairs with the folipage-video-voiceover skill for spoken narration in any language.
metadata:
  version: "1.0.0"
---

# Screen video

You turn a task in a web app into a short, calm screen video: you write a
script of actions and narration lines, a real browser plays it with a cursor
that moves like a person's, and the frames are encoded into an MP4. Every
narration line is held on screen for as long as its voice will take, so the
`folipage-video-voiceover` skill can lay the voice on without stretching the picture.

The video shows only what really happens in the app. Never script a screen or
a label you have not seen.

## Files in this skill

| File | Read it |
| --- | --- |
| `scripts/check-version.mjs` | Run first, every time (below). |
| `references/script-format.md` | Before writing `video.json` — settings, actions, targets, narration. |
| `references/directing-guide.md` | Before writing the script — length, pacing, what makes a walkthrough easy to follow. |
| `scripts/record.mjs` | `login`, `inspect`, `narration`, `record`. Run without arguments for help. |
| `scripts/stage.js` | Injected into every page: cursor, click ripple, ring, key badge, privacy. |
| `assets/video.example.json` | A starting point. |

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

## Requirements

Check, do not ask: Node.js 18+, `ffmpeg` on PATH (`ffmpeg -version`;
install with `brew install ffmpeg` or `apt install ffmpeg`), and a shell that
can reach the app's URL. Then:

```bash
npm install --prefix .folipage-screen-video playwright
(cd .folipage-screen-video && npx playwright install chromium)
```

A Playwright already installed for `folipage-tutorial` (in
`.folipage-tutorial/`) is found and used as well.

Without a shell (only a browser tool), this skill cannot record; say so and
offer the script and narration as text instead.

## Workflow

### 1. Intake

Ask in one message for what you do not know:

- **The app's URL**, whether it needs signing in, and a **demo or test
  account** — you click through the app for real.
- **Which tasks** become videos. One task per video, 30–90 seconds each.
- **Narration:** none, voiceover (the `folipage-video-voiceover` skill), or
  subtitles only. With a voiceover, **ask which language** (and variant or
  formality where it matters — see that skill's step 0) and put it into
  `"language"` in `video.json`; there is no default.
- **Highlight colour** (default neutral black; brand or signal colour as hex).
- **Format:** Full HD 16:9 (default) or something else (e.g. 1080×1080 for
  social media).

You never type passwords. If the app needs signing in:

```bash
node $SKILL/scripts/record.mjs login https://app.example.com --until "/dashboard"
```

The user signs in in the window that opens; the session is kept in
`.folipage-screen-video/state.json`.

### 2. Explore, then write the script — and stop

Walk through each task first (`record.mjs inspect <url>` lists headings,
buttons, fields and links and saves a look-screenshot; open it). Then write
`video.json` following `references/script-format.md` and
`references/directing-guide.md`: the actions, and a `say` line for each
moment worth explaining.

Show the user the script as a readable list — per video, the narration
lines with the action each one accompanies — and **wait for approval** before
recording or generating any voice.

### 3. Narration timing (with voiceover)

When the video gets a voice, generate it **before** recording, so every line
is held exactly as long as it is spoken:

```bash
node $SKILL/scripts/record.mjs narration video.json                 # → narration.json
node <folipage-video-voiceover>/scripts/voiceover.mjs synth narration.json   # → audio/*.wav, audio/durations.json
```

`<folipage-video-voiceover>` is the `folipage-video-voiceover` skill's directory, usually
`$SKILL/../folipage-video-voiceover`. Follow that skill's SKILL.md for the voice,
pronunciation and who speaks (a folipage API key, or the user's own OpenAI key).
Without it, recording still works: lines are
timed by an estimate, and the voiceover holds the picture where needed.

### 4. Record

```bash
node $SKILL/scripts/record.mjs record video.json [--durations audio/durations.json] [--only <id>]
```

Each video becomes `<outDir>/<id>.mp4` (H.264, no sound) and
`<outDir>/<id>.timeline.json` (when each line starts). A failing step stops
that video and saves `.folipage-screen-video/errors/<id>-step-N.png` — look at it, fix
the step, re-run with `--only <id>`.

**Look at the result.** Pull frames at the key moments and open them:

```bash
ffmpeg -loglevel error -ss 5 -i videos/<id>.mp4 -frames:v 1 -vf scale=960:-2 check-5.jpg
```

Is the cursor where the action is, the right element ringed, nothing personal
visible, no spinner frozen in view? Fix and re-record until it is right.

### 5. Voice and subtitles

With narration, finish with `folipage-video-voiceover`:

```bash
node <folipage-video-voiceover>/scripts/voiceover.mjs mix videos/<id>.mp4 videos/<id>.timeline.json --audio audio
```

→ `videos/<id>.<lang>.mp4` with the voice (e.g. `.cs.mp4` for Czech), plus `.srt` and `.vtt`.

### 6. Hand over

The MP4 files (and subtitles), their length, what was masked or replaced,
anything you could not show and why, and that `video.json` re-records every
video after the app changes (`record`, then `mix` again — unchanged voice lines
are not regenerated).

## Safety while recording

Before any step that sends messages or e-mails, invites people, charges
money, publishes, or deletes or overwrites data, stop and ask the user — even
on a demo account. Prefer ending the video on the open confirmation dialog
without confirming. Never type passwords, card numbers or other secrets into
the script; never create accounts. Mask or replace every real name, e-mail,
phone number and amount that belongs to a real person (`mask`,
`replaceText`) — the stage applies them before anything is painted.

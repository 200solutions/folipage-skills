---
name: folipage-video-voiceover
description: Add a spoken, expressive voiceover to a video with AI text-to-speech (ElevenLabs voices from folipage on the organization's AI credits, directed with emotion tags) in the language the user picks (57 languages — Czech, Slovak, English, German, Polish, French, Spanish …), timed to the picture, with subtitles. Also dubs an existing video into another language by transcribing it, translating the script and replacing the speech. Use when the user wants to narrate, voice over, dub, "nadabovat" or "namluvit" a video or screen recording, translate a video's speech, or add narration in any language to a tutorial or product video.
metadata:
  version: "1.3.0"
---

# Video voiceover

You give a video a voice: you write (or translate) a short narration script,
direct how each line is said (excited, calm, curious, relieved …), generate
the lines with folipage's ElevenLabs voices, and lay them onto the
video at the right moments. Where a line is longer than the picture allows,
the picture holds still until the voice finishes. You hand back an MP4 with
the voice, plus `.srt` and `.vtt` subtitles.

## Files in this skill

| File | Read it |
| --- | --- |
| `scripts/check-version.mjs` | Run first, every time (below). |
| `references/timeline-format.md` | Before writing or editing a segments/timeline file. |
| `references/narration-guide.md` | Before writing or translating narration: writing for the ear, directing the voice with tags, length and register per language, numbers, names, pronunciation fixes. |
| `scripts/voiceover.mjs` | Everything: `languages`, `voices`, `say`, `synth`, `mix`, `upload`, `transcribe`, `frames`. Run it without arguments for help. |

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

- Node.js 20+ and `ffmpeg` with `ffprobe` on PATH (`brew install ffmpeg`,
  `apt install ffmpeg`). Check with `ffmpeg -version` first.
- **Who speaks**, from the environment, a `.env` file in the working
  directory (or a parent), or `$SKILL/folipage.env` — the script reads them
  in that order, and looks for these:
  1. `FOLIPAGE_TOKEN` — a folipage API token. The voice comes from folipage
     and the organization's AI credits (Marie's credits) pay for it. A skill downloaded from folipage already has the
     user's token, URL and organization in `$SKILL/folipage.env`: then there
     is nothing to set up. Otherwise the user creates it in folipage under **Profil › API
     › Nový klíč** with **Čtení i úpravy** and *without* „Omezit na vybrané
     portály“ (a key limited to portals is refused: the organization pays).
     Their role in the organization must be at least editor. If the key sees
     more than one organization, add `FOLIPAGE_ORG=<slug>` for the one that
     pays.
     `FOLIPAGE_URL` is only for a folipage that does not run at
     https://app.folipage.com.
  2. `OPENAI_API_KEY` — only for `transcribe` without a folipage token
     (dubbing), billed by OpenAI. It gives no voice: the voices are
     folipage's alone.

  Without a folipage token, ask the user for one and tell them where to
  create it. **Never print, echo or log a token or key**,
  and never write one into a file yourself: the user puts it into `.env`.
- The text of every segment is sent to folipage, which has it checked by
  OpenAI's moderation and spoken by ElevenLabs. Tell the user once, before
  the first `synth`, and do not narrate personal or confidential data.
- A line costs 35 credits per started 100 characters (tags count as
  characters), and a transcription about 15 credits per minute of speech;
  the organization's credits and what is left are behind the credits button
  in the console's top bar, under „Prémiový hlas videa“ and „Přepis videa“. When they
  run out, the script stops with folipage's own message — tell the user,
  don't retry.

## Three ways in

**A. A video made by the `folipage-screen-video` skill.** It already gives you
`narration.json` (the lines) and, after recording, `<id>.timeline.json` (when
each line starts). Best order, so the picture never has to wait:

```bash
node $SKILL/scripts/voiceover.mjs synth narration.json            # → audio/*.wav + audio/durations.json
node <folipage-screen-video>/scripts/record.mjs record video.json --durations audio/durations.json
node $SKILL/scripts/voiceover.mjs mix videos/<id>.mp4 videos/<id>.timeline.json --audio audio
```

**B. A silent video you did not make** (a screen recording, a product demo).
Look at it first, then write the timeline yourself:

```bash
node $SKILL/scripts/voiceover.mjs frames demo.mp4 --every 2    # frames/frame-0001.jpg … with their times
```

Open the frames, work out what happens when, and write `demo.timeline.json`
with one segment per moment worth saying something about (see
`references/timeline-format.md`). Then `synth` the timeline and `mix`.

**C. Dubbing a video that already speaks** (e.g. English into German):

```bash
node $SKILL/scripts/voiceover.mjs transcribe talk.mp4 --source-lang en --lang de   # → talk.timeline.json
```

Each segment gets `source` (what was said) and `text` (a copy for you to
translate). Translate every `text` into the target language as natural
spoken language, about as long as the original — most languages run longer
than English (see `references/narration-guide.md`), so tighten rather than pad. You may merge neighbouring segments (keep
the first `start`, the last `end`) when a sentence was cut in two. Then
`synth` and `mix` with `--original 0` (the original speech is dropped; music
and sound go with it — say so to the user).

## Workflow

0. **Ask for the language — always.** Unless the user already named it (or
   the calling skill passes it on, e.g. the tutorial's language), ask which
   language the voice should speak, before writing a line. Offer the
   likely ones (Czech, Slovak, English, German, Polish…) and say any of the
   57 in `node $SKILL/scripts/voiceover.mjs languages` works. Ask about the
   variant where it matters (Brazilian or European Portuguese → `pt-BR` /
   `pt-PT`, British or American English, Latin American Spanish `es-MX`,
   Canadian French `fr-CA`) and, for languages with a polite and a familiar
   "you" (vy/ty, Sie/du, vous/tu, usted/tú), which one. Several languages
   are fine: one narration file and one `mix` per language, from the same
   recording. Put the code into `"language"` of every segments file; the
   script refuses to guess and stops when it is missing.
1. **Agree on the script.** Write the narration (or translation) and show it
   to the user as a plain list of lines before generating anything. Follow
   `references/narration-guide.md`.
2. **Pick the voice.** The organization has its own voice for each
   language, chosen in the console on the **Marie** page: leave out
   `--voice` and `"voice"` and that one speaks.
   `node $SKILL/scripts/voiceover.mjs voices --lang <code>` lists the voices
   that speak the language, with the organization's marked — for Czech,
   native Czech women, men and two children (`jana`, `anet`, `eliska`,
   `marek`, `daniel`, `jan`, `tomas`, `piku`, `teddy` …) who speak Czech
   only; ElevenLabs' international ones speak every language, with an
   accent outside English — and after them the audio tags they act out.
   Name a voice only when the user asks for one. If the user cares — or the
   language is not a common one — generate the first line in two voices
   with `say` and let them listen:
   ```bash
   node $SKILL/scripts/voiceover.mjs say "[warmly] Guten Tag, in diesem Video legen wir eine Rechnung an." --lang de --voice sarah
   node $SKILL/scripts/voiceover.mjs say "[warmly] Guten Tag, in diesem Video legen wir eine Rechnung an." --lang de --voice george
   ```
   On macOS they play with `afplay <file>`.
3. **Direct the voice.** Give the narration an arc with audio tags in
   square brackets — warm or excited at the start, calm through the steps,
   curious before a question, relieved after a tricky step, happy when the
   result appears — following „Directing the voice“ in
   `references/narration-guide.md`: a tag on about a third of the lines,
   never the same one twice in a row, none on a plain instruction, a laugh
   or a sigh only once or twice a video. Czech tags are fine (`[nadšení]`,
   `[úleva]`); the full vocabulary is at the end of `voices`. Tags are never
   spoken and never in the subtitles. Show them in the script the user
   approves, and preview the most directed lines with `say` before
   `synth`. If the user wants a plain, even voice, leave the tags out.
4. **Synthesize.** `synth <file>` writes `audio/<id>.wav` per segment and
   `audio/durations.json`. Unchanged lines are reused, so re-running after
   editing one line costs one line.
5. **Fix pronunciation.** Transcribe your own result to hear it "through
   another ear" — `transcribe out.<lang>.mp4 --source-lang <lang> --out check.json`
   — and compare `source` with what you wrote. Words that come back wrong
   (brand names, abbreviations, foreign terms) go into `pronounce`, spelled
   the way that language would write the sound, e.g. Czech
   `{"PDF": "pé dé ef"}` (folipage itself is said "folipejdž" in Czech and
   Slovak without it), German
   `{"Folipage": "Folipejdsch"}`; re-run `synth`. If you do not speak the
   language well, say so and ask the user (or a native speaker) to listen
   to the result before it is published.
6. **Mix.**
   ```bash
   node $SKILL/scripts/voiceover.mjs mix video.mp4 video.timeline.json --audio audio [--subs embed] [--max-tempo 1.1] [--original 0.15]
   ```
   - `--max-tempo 1.1` lets a slightly long line speed up by up to 10 %
     before the picture is held. More than 1.15 sounds rushed.
   - `--original 0.15` keeps the video's own sound quietly under the voice
     (music, clicks); `0` (default) drops it.
   - `--subs embed` also puts a subtitle track inside the MP4.
   The output is `<video>.<lang>.mp4` with `.srt`, `.vtt` and an updated
   `.timeline.json` next to it. The report says where the picture was held.
7. **Check it.** Pull a few frames where the picture was held
   (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 check.jpg`) and look at them; read
   the `.srt` against the script. If a hold looks odd (frozen mid-animation),
   shorten that line or move its `end`.
8. **Into folipage's archive** (with a folipage token; ask the user first —
   it uploads the video to their organization):
   ```bash
   node $SKILL/scripts/voiceover.mjs upload video.<lang>.mp4 video.<lang>.timeline.json --audio audio [--title "Jak založit fakturu"] [--script video.json]
   ```
   It sends the mixed MP4, the lines and every line's audio, and prints the
   video's address in the console (**Knihovna › Videa s hlasem**). There a member fixes
   a subtitle for free, has one line said again for credits where it fits,
   or presses „Zkusit znovu“ to have the whole video recorded again —
   `--script` (the `folipage-screen-video` script it was recorded from) is
   what that is done by. Up to 300 MB per video. Upload the timeline `mix`
   wrote (`<output>.timeline.json`), not the one you gave it.
9. **Hand over** the MP4 and subtitle files (and the folipage address, if
   uploaded), the voice used, the number of characters sent (folipage's
   credits paid), and
   anything you could not get right (a word the voice keeps mispronouncing).

## Rules

- The language is the user's choice; never fall back to Czech or English
  on your own.
- The user approves the narration text before `synth`.
- Never print or store the folipage token or an OpenAI key; never narrate
  personal data.
- Never overwrite the source video; `mix` writes a new file.
- Say plainly that the voice is synthetic if the user plans to publish the
  video where that matters.

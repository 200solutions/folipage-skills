# The video script (`video.json`)

```json
{
	"baseUrl": "https://app.example.com",
	"outDir": "videos",
	"viewport": { "width": 1280, "height": 720 },
	"scale": 1.5,
	"language": "cs",
	"voice": "marin",
	"pronounce": { "Folipage": "Folipejdž" },
	"ringColor": "#e11d48",
	"mask": [".avatar"],
	"hide": ["#intercom-container"],
	"replaceText": [["Marta Nováková", "Jana Ukázková"]],
	"videos": [
		{
			"id": "create-an-invoice",
			"title": "Založení faktury",
			"start": "/invoices",
			"steps": [
				{ "action": "say", "text": "V tomto videu založíme novou fakturu." },
				{ "action": "click", "target": { "role": "link", "name": "Nová faktura" }, "ring": true,
				  "say": "Klikněte na Nová faktura vpravo nahoře." },
				{ "action": "fill", "target": { "label": "Zákazník" }, "value": "Gama spol. s r.o.",
				  "say": "Vyplňte zákazníka…" },
				{ "action": "fill", "target": { "label": "Částka" }, "value": "8 900 Kč" },
				{ "action": "click", "target": { "role": "button", "name": "Uložit" }, "say": "…a fakturu uložte." },
				{ "action": "wait", "target": { "role": "status" } }
			]
		}
	]
}
```

## Settings (top level)

| Key | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | required | Relative URLs in `start` and `goto` resolve against it. |
| `outDir` | `videos` | Where MP4s and timelines go, relative to the script. |
| `viewport` | 1280 × 720 | The CSS size of the page. Keep 16:9 unless asked otherwise. |
| `scale` | 1.5 | Device pixel ratio; the video is viewport × scale (1920 × 1080). Larger viewport = smaller text. |
| `fps` | 30 | Frame rate of the MP4. |
| `colorScheme`, `locale` | `light`, `cs-CZ` | Passed to the browser. |
| `language` | none | The narration language the user chose (`cs`, `de`, `pt-BR` …). Required for a voiceover; passed through to `narration.json` and the timelines. |
| `voice`, `instructions`, `pronounce` | — | Passed through to `narration.json` and the timelines for `folipage-video-voiceover`. |
| `ringColor` | `#111111` | Colour of highlight rings and click ripples. |
| `cursor` | `true` | `false` records without the drawn cursor. |
| `mask` | `[]` | CSS selectors blurred on every page. |
| `hide` | `[]` | CSS selectors made invisible (chat widgets, cookie bars). |
| `replaceText` | `[]` | `[["real", "fake"], …]` swapped in all text and fields, before painting. |
| `typingDelay` | 70 | Milliseconds per typed character. |
| `pace` | 700 | Milliseconds to linger after each action. Per step: `"pause": 1200`. |
| `lead`, `tail` | 0.8, 1.2 | Seconds of stillness at the start and the end. |
| `gap` | 0.35 | Seconds of quiet after each narration line before the next may start. |
| `charsPerSecond` | 14 | Speaking speed for estimating line length when no `--durations` file is given. |
| `state` | `.folipage-screen-video/state.json` | Session file from `login`. |

## A video

| Key | Meaning |
| --- | --- |
| `id` | Lowercase letters, digits and dashes; the file name. |
| `title` | For the report and the timeline. |
| `start` | URL opened **before** recording starts, so the video opens on a loaded page. |
| `steps` | The actions, in order. |

## Actions

Every action may carry `"say": "…"`: the narration line starts just before
the action. A separate `{ "action": "say", "text": "…" }` starts a line on its
own. A line lasts until the next line starts; if the actions in between are
quicker than the voice, the recording waits until the voice is done.

| Action | Fields | What the viewer sees |
| --- | --- | --- |
| `say` | `text`, `id`? | Nothing; starts a narration line. |
| `goto` | `url` | The page loads (prefer clicking through the UI). |
| `click` | `target`, `ring`? | The cursor glides to the element, ripple, click. `"ring": true` rings it first. |
| `fill` / `type` | `target`, `value` | Click into the field, text typed character by character. `fill` replaces what is there; `type` adds to the end. |
| `select` | `target`, `value` | Cursor to the select, option chosen. |
| `check` / `uncheck` | `target` | Cursor, ripple, the box changes. |
| `hover` | `target` | The cursor rests on the element (tooltips, menus). |
| `press` | `key`, `target`?, `label`? | A key badge ("Ctrl + K") and the key press. |
| `scroll` | `target` or `y` | Smooth scroll to the element, or by `y` pixels. |
| `ring` | `target`, `ms`? | A highlight ring around the element; it stays until the next action that is not `say`, `pause`, `wait` or `ring`. |
| `wait` | `target` / `url` (regex) / `ms` | Waits for something to appear; nothing moves. |
| `pause` | `ms` | Stillness. |

`id` on a `say` (or on a step with `say`) names the line; otherwise lines are
`<video id>-01`, `-02`, … in order. Keep ids stable once audio exists — the
audio files are named after them.

## Targets

Same as in folipage-tutorial's `flows.json`: a Playwright selector string, or
`{ "role": "button", "name": "Uložit" }`, `{ "label": "Zákazník" }`,
`{ "placeholder": "…" }`, `{ "text": "…" }`, `{ "testId": "…" }`,
`{ "css": "…" }`, optionally with `"exact": true`, `"nth": 0`,
`"within": <target>` or `"frame": "<iframe selector>"` (an element inside
an iframe, e.g. an editor's preview: `"frame": "iframe[title=Preview]"`). A target must match exactly one visible element.
Prefer roles and labels the viewer can see.

## Output

`<outDir>/<id>.mp4` — H.264, yuv420p, no sound, `+faststart`.

`<outDir>/<id>.timeline.json` — the `folipage-video-voiceover` timeline format:
`segments[]` with `id`, `text`, `start` and `end` in seconds, plus
`language`, `voice`, `pronounce` from the script.

`record.mjs narration video.json` writes `narration.json` with the same
segment ids and texts, for `voiceover.mjs synth` before recording.

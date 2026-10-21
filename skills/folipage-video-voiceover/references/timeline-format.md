# Segments and timelines

One JSON format serves every command. `synth` needs only the lines; `mix`
also needs to know when each line starts.

```json
{
	"video": "create-an-invoice.mp4",
	"duration": 42.3,
	"language": "cs",
	"voice": "marin",
	"instructions": "Speak natural, native Czech …",
	"pronounce": { "Folipage": "Folipejdž", "PDF": "pé dé ef" },
	"segments": [
		{ "id": "create-an-invoice-01", "start": 0.8, "end": 6.9, "text": "V seznamu faktur vidíte všechny vystavené doklady." },
		{ "id": "create-an-invoice-02", "start": 6.9, "end": 13.1, "text": "Novou fakturu založíte tlačítkem Nová faktura." }
	]
}
```

| Key | Used by | Meaning |
| --- | --- | --- |
| `segments[].id` | all | Unique; letters, digits, `.`, `-`, `_`. Also the audio file name (`audio/<id>.wav`). |
| `segments[].text` | all | What the voice says and what the subtitles show. |
| `segments[].start` | `mix` | Seconds into the video where the line begins. |
| `segments[].end` | `mix` | Optional. Where the picture may be held if the line runs long — the moment the action of this line is over. Default: the next line's start. |
| `segments[].source` | — | Written by `transcribe`: the original speech, kept for reference while translating. Ignored otherwise. |
| `language` | `synth`, `mix` | **Required.** The language the user chose: ISO 639-1 (`cs`, `en`, `sk`, `de` …), with a region where it matters (`pt-BR`, `en-GB`, `es-MX`). `voiceover.mjs languages` lists them. Picks the default voice instructions, the output name `<video>.<language>.mp4` and the subtitle language tag. `--lang` on the command line stands in for it. |
| `voice`, `model`, `instructions` | `synth` | Defaults `marin`, `gpt-4o-mini-tts` and calm trainer-style instructions in the language. Command-line options win. |
| `pronounce` | `synth` | Whole-word replacements applied only to what the voice hears; subtitles keep the written form. |
| `video`, `duration`, `title` | — | Informational. |

Other keys (such as `video` on each segment from `folipage-screen-video`) are ignored.

## Timing rules `mix` applies

- A line may speak from its `start` until the next line's `start` (the last
  one until the video ends), minus `--gap` (0.3 s) of breathing room.
- If it is longer, it is first sped up, up to `--max-tempo` (default 1, off).
- What still does not fit is made up by **holding the picture** at the line's
  `end` (or just before the next line) for the missing time. Everything after
  shifts later; the new times are written to `<output>.timeline.json`.
- Lines are never cut and never overlap.

So when you write a timeline by hand, put `start` where the thing you talk
about appears, and `end` where holding still would look natural — after a
click has landed, a dialog has opened, a page has loaded. Never in the middle
of a scroll or an animation.

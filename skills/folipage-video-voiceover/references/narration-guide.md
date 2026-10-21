# Writing narration

Narration is heard once, at the speed of speech, while the eyes are busy with
the picture. Write for the ear, in the language the user chose — written
natively in it, not translated in your head from English.

## Shape of a line (any language)

- **One idea per line, one line per moment on screen.** 6–18 words is the
  sweet spot (in Chinese, Japanese or Korean roughly 15–40 characters); a
  line much longer than that needs a cut.
- **Say what to do and where, not what the viewer already sees.** "Create a
  new invoice with the New invoice button at the top right." — not "Now we
  see the invoices page and in the top right corner there is a blue button."
- **Talk to the viewer** in the form of address the product uses. Where the
  language has a polite and a familiar "you" (cs/sk vy–ty, de Sie–du, fr
  vous–tu, es usted–tú, pl Pan/Pani–ty, ru вы–ты), use the one the user
  agreed; default to the polite one.
- **Lead with the goal** in the first line and **close with the result**.
- UI labels exactly as on the screen, in the language the screen shows,
  without quotes or bold — they are heard, not read. Say the label first,
  then where it is. When the app's UI is in another language than the
  narration, keep the label as on screen and name its place clearly.
- No filler ("So…", "Takže…", "Also…"), no marketing adjectives.
- Short sentences, active voice, verbs rather than nouns ("provedení
  uložení faktury" → "fakturu uložíte"; "die Durchführung der Speicherung" →
  "speichern Sie").

## Length against the picture

Translations and native narration differ in length from English. Roughly,
for the same content:

| Language | Against English |
| --- | --- |
| German, Dutch, Finnish, Hungarian | +20–35 % |
| French, Spanish, Italian, Portuguese, Polish, Russian | +15–25 % |
| Czech, Slovak, Ukrainian | +10–20 % |
| Chinese, Japanese, Korean | shorter in characters, similar in time |

Cut adjectives and repetitions first. Read each line in your head against its
`start`–`end` window; if it clearly cannot fit, shorten it before `synth`
rather than let `mix` hold the picture still.

## Directing the voice

The voices are ElevenLabs' and act out audio tags: a word or two in square
brackets before the part of the line they colour, `[excited] Hotovo!`. A
narration read in one even tone for two minutes sounds like a machine; a
human trainer is pleased when something works, curious before a question,
calm through the steps. Direct every narration, not only when asked — just
keep it natural.

**The arc of a tutorial.** Plan the tone per line before you write tags:

| Moment | Tone | Tags |
| --- | --- | --- |
| Opening line — what we will make | warm, a little excited | `[excited]`, `[warmly]`, `[friendly]` |
| Steps — click here, fill in that | calm, clear, no tag | — |
| A question or a choice ("Which template suits you?") | curious | `[curious]` |
| Something tricky, a common mistake | serious, emphatic | `[serious]`, `[emphatic]` |
| After a fiddly step, the fix that worked | relieved | `[relieved]`, `[sighs]` |
| The result appears | happy, proud, amazed | `[happy]`, `[amazed]`, `[proud]` |
| A small joke or a pleasant surprise | amused | `[chuckles]`, `[laughs]`, `[amused]` |
| Closing line | warm | `[warmly]`, `[friendly]` |

**Density.**

- About **one line in three** carries a tag; never more than half.
- **Never the same tag twice in a row**, and no tag more than three times in
  one video.
- A purely instructional line ("Klikněte na Uložit.") gets **no tag**: the
  calm of the steps is what makes the excitement around them land.
- One tag per line is the rule, two at most (a tone and a sound:
  `[relieved] [sighs] A je to.`).
- Sounds — `[laughs]`, `[chuckles]`, `[sighs]`, `[exhales]`,
  `[clears throat]` — are **rare**: at most one or two in a video, where a
  person would really make them. No coughing, yawning or shouting in a
  tutorial.
- Pauses: `[short pause]` before a reveal ("A teď… [short pause] hotovo.");
  `[long pause]` almost never — the picture can wait instead.

**Prosody without tags.** The voice also follows the punctuation: an
exclamation mark lifts a line ("Hotovo!"), a question mark makes it ask, an
ellipsis makes it hesitate or build up ("A teď to nejlepší…"), a comma is a
breath. Use them as you would when reading aloud, and end statements with a
full stop so the voice lands at the end of the sentence. Capitals for
emphasis (`TADY`) work but sound shouted — use once in a video at most.

**Writing tags.** English tags work best (`[excited]`); Czech ones are put
into English by folipage (`[nadšení]`, `[úleva]`, `[smích]`).
`node $SKILL/scripts/voiceover.mjs voices` prints the whole vocabulary folipage
knows, Czech aliases included; other short English directions (`[with a
smile]`, `[speaking slowly]`) work too, less reliably. Tags are never
spoken and never shown in the subtitles.

**Try before you commit.** Before `synth`, preview the two or three most
directed lines with `say` and listen; a tag that comes out overdone gets a
milder one (`[excited]` → `[warmly]`) or none:

```bash
node $SKILL/scripts/voiceover.mjs say "[excited] Dobrý den! Dnes si společně založíme první fakturu." --lang cs
```

**Example** (Czech, a tagged line in three):

```
[warmly] Dobrý den, v tomhle videu si založíme první fakturu.
Otevřete Faktury a klikněte na Nová faktura vpravo nahoře.
Vyplňte odběratele a položky.
[curious] Nevíte, jakou sazbu DPH zvolit?
Program ji doplní podle odběratele.
Klikněte na Uložit.
[happy] A je to! Faktura je hotová a můžete ji rovnou poslat.
```

Show the user the lines with their tags when you ask them to approve the
script, and say they can ask for a calmer or a livelier voice.

## Numbers, abbreviations, foreign words

- Numbers the way people of that language say them ("osm tisíc devět set
  korun", "achttausendneunhundert Euro", "le 2 octobre" → "le deux
  octobre"). Write them out in words when the voice reads digits oddly; keep
  the currency and date order of the locale.
- Abbreviations: write what should be heard. Some are spelled out letter by
  letter (PDF, DPH, MwSt), some read as a word; test once with `say`.
- English product names and terms often get a wrong accent or stress. Put
  the fix in `pronounce`, spelled the way the target language writes that
  sound, rather than misspelling the text — subtitles keep the right form:
  Czech `{"Folipage": "Folipejdž", "dashboard": "dešbórd", "e-mail": "ímejl"}`,
  Polish `{"Folipage": "Folipejdż"}`, German `{"Folipage": "Folipejdsch"}`.
- Keyboard shortcuts: say them the local way ("kontrol a ká", "Steuerung
  plus K", "contrôle K") — or show the key badge in the video and only say
  "with the keyboard shortcut".

## Spoken Czech (and Slovak)

- Vykání by default: "Klikněte", "Vyplňte", "Zvolte".
- Avoid long passive and nominal chains; spoken Czech is plainer than
  written.
- Stress falls on the first syllable; the Czech voices know it. If a word
  still comes out wrong, `pronounce` it.

## Translating a dubbed video

- Translate meaning, not words; aim for the same length as the original or a
  little shorter (see the table above).
- Keep the speaker's register (a formal talk stays formal).
- Names of people, products and features stay as they are; add their
  pronunciation to `pronounce` if needed.
- If you are not sure of idiom in the target language, say so to the user
  and suggest a native speaker reads the lines before `synth`.

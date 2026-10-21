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
- Stress falls on the first syllable; the default instructions already say
  so. If a word still comes out wrong, `pronounce` it.

## Translating a dubbed video

- Translate meaning, not words; aim for the same length as the original or a
  little shorter (see the table above).
- Keep the speaker's register (a formal talk stays formal).
- Names of people, products and features stay as they are; add their
  pronunciation to `pronounce` if needed.
- If you are not sure of idiom in the target language, say so to the user
  and suggest a native speaker reads the lines before `synth`.

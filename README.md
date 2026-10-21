# Skilly folipage pro AI agenty

Skilly, které naučí AI agenta dělat dokumentaci a videa k webovým aplikacím
rovnou pro [folipage](https://folipage.com): návody se screenshoty, videa
z obrazovky a jejich namluvení v 57 jazycích. Každý skill je složka se
souborem `SKILL.md` v otevřeném formátu [Agent Skills](https://agentskills.io),
který čtou Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode,
Kimi Code a další agenti.

> **English:** Agent skills that write step-by-step tutorials with annotated
> screenshots, record polished screen videos of web apps and narrate or dub
> them in 57 languages, ready to publish on folipage. Install them with
> `npx skills add 200solutions/folipage-skills`.

| Skill | Co umí |
| --- | --- |
| [`folipage-tutorial`](skills/folipage-tutorial/SKILL.md) | Projde vaši aplikaci jako nový uživatel, nafotí obrazovky se zvýrazněním a napíše návod krok za krokem. Vrátí ZIP, který nahrajete do folipage. |
| [`folipage-screen-video`](skills/folipage-screen-video/SKILL.md) | Nahraje video aplikace podle scénáře: plynulý kurzor, kliknutí, zvýraznění, psaní, skryté osobní údaje. Full HD MP4. |
| [`folipage-video-voiceover`](skills/folipage-video-voiceover/SKILL.md) | Napíše a namluví komentář k videu přirozeným hlasem, sesadí ho s obrazem a přidá titulky. Umí i dabing do jiného jazyka. |

## Instalace

**Nejjednodušší je z konzole folipage** (Marie › Skilly): u skillu zvolte
„Instrukcí pro agenta“, zkopírujte instrukci do svého agenta a ten si skill
stáhne a nainstaluje sám, i s vaším API klíčem.

Z tohoto repozitáře:

```bash
npx skills add 200solutions/folipage-skills
```

Jen jeden skill:

```bash
npx skills add 200solutions/folipage-skills --skill folipage-tutorial
```

V Claude Code také jako plugin:

```text
/plugin marketplace add 200solutions/folipage-skills
/plugin install folipage-skills@folipage-skills
```

Ručně: zkopírujte složku ze `skills/` do složky se skilly svého agenta, třeba
`~/.claude/skills/` (Claude Code), `~/.agents/skills/` (Codex a ostatní),
`~/.cursor/skills/`, `~/.gemini/skills/` nebo `~/.copilot/skills/`.

## Co skilly potřebují

- **Node.js 20+**.
- **ffmpeg** pro oba video skilly (na Macu `brew install ffmpeg`).
- **Playwright** pro návody a videa z obrazovky. Skilly si ho nainstalují samy.
- Pro namluvení **API klíč folipage**: v konzoli Profil › API › Nový klíč,
  „Čtení i úpravy“, neomezený na portály. Dejte ho agentovi do prostředí nebo
  do `.env` v pracovní složce jako `FOLIPAGE_TOKEN=…`. Hlas se platí z kreditů
  AI vaší organizace. Skill stažený z konzole folipage klíč už obsahuje.

Hesla do vašich aplikací skilly nezadávají: když je potřeba přihlášení,
přihlásíte se sami v okně prohlížeče, které agent otevře.

## Jak skilly zadat

Úkol agentovi napíšete obyčejnou větou, třeba:

- „Udělej návod k naší aplikaci na app.example.com pro nové zákazníky.
  Přihlásím se sám.“
- „Natoč krátké video, jak se zakládá nový projekt, a namluv ho česky.“
- „Nadabuj video demo.mp4 do angličtiny a němčiny a přidej titulky.“

Agent si skill vybere sám podle úkolu. Osnovu, scénář i text komentáře vám
ukáže ke schválení, než začne.

## Aktualizace

Každý skill si při spuštění zkontroluje, jestli nevyšla novější verze, a řekne
vám to. Novou verzi nainstalujete stejným příkazem jako poprvé.

---

Repozitář je zrcadlo složky `skills/` z vývoje folipage, změny se dělají tam.
Chybu nebo nápad nám napište na [folipage.com](https://folipage.com).

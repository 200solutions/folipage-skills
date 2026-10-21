<p align="center">
  <a href="https://folipage.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
      <img src="assets/logo-light.svg" alt="folipage" width="302" height="84">
    </picture>
  </a>
</p>

# Skilly folipage pro AI agenty

![Status](https://img.shields.io/badge/status-v_provozu-brightgreen?style=for-the-badge) ![License](https://img.shields.io/badge/license-v%C5%A1echna_pr%C3%A1va_vyhrazena-blue?style=for-the-badge) ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E) ![Agent Skills](https://img.shields.io/badge/Agent_Skills-0005dd?style=for-the-badge)

Skilly, které naučí AI agenta dělat dokumentaci a videa k webovým aplikacím
rovnou pro [folipage](https://folipage.com): návody se screenshoty, videa
z obrazovky a jejich namluvení v 57 jazycích. Pro každého, kdo píše nápovědu,
onboarding nebo demo videa a nechce kvůli tomu fotit obrazovky ručně.

> **English:** Agent skills that write step-by-step tutorials with annotated
> screenshots, record polished screen videos of web apps and narrate or dub
> them in 57 languages, ready to publish on folipage. Install them with
> `npx skills add 200solutions/folipage-skills`.

| | |
|---|---|
| **Zákazník / objednatel** | interní produkt (doplněk k [folipage](https://folipage.com)) |
| **Typ projektu** | interní produkt |
| **Stav** | v provozu |
| **Odpovědná osoba (200solutions)** | Marek Kejda |
| **Kontakt** | [folipage.com](https://folipage.com) |
| **Formát** | [Agent Skills](https://agentskills.io): Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Kimi Code a další |
| **Distribuce** | tento repozitář (`npx skills add`, plugin Claude Code) a konzole folipage |

## Description

Každý skill je složka se souborem `SKILL.md` v otevřeném formátu
[Agent Skills](https://agentskills.io). Agent si skill vybere sám podle toho,
co po něm chcete, přečte si postup a spustí přibalené skripty: projde vaši
aplikaci v prohlížeči, nafotí nebo natočí ji a výsledek připraví k nahrání
do folipage.

| Skill | Co umí |
| --- | --- |
| [`folipage-tutorial`](skills/folipage-tutorial/SKILL.md) | Projde vaši aplikaci jako nový uživatel, nafotí obrazovky se zvýrazněním a napíše návod krok za krokem. Vrátí ZIP, který nahrajete do folipage. |
| [`folipage-screen-video`](skills/folipage-screen-video/SKILL.md) | Nahraje video aplikace podle scénáře: plynulý kurzor, kliknutí, zvýraznění, psaní, skryté osobní údaje. Full HD MP4. |
| [`folipage-video-voiceover`](skills/folipage-video-voiceover/SKILL.md) | Napíše a namluví komentář k videu přirozeným hlasem, sesadí ho s obrazem a přidá titulky. Umí i dabing do jiného jazyka. |

Hesla do vašich aplikací skilly nezadávají: když je potřeba přihlášení,
přihlásíte se sami v okně prohlížeče, které agent otevře. Osnovu, scénář
i text komentáře vám agent ukáže ke schválení, než začne.

## Getting Started

### Dependencies

* **Node.js 20+**.
* **ffmpeg** pro oba video skilly (na Macu `brew install ffmpeg`).
* **Playwright** pro návody a videa z obrazovky. Skilly si ho nainstalují samy.
* Pro namluvení **API klíč folipage**: v konzoli Profil › API › Nový klíč,
  „Čtení i úpravy“, neomezený na portály. Hlas se platí z kreditů AI vaší
  organizace. Skill stažený z konzole folipage klíč už obsahuje.

### Installing

**Nejjednodušší je z konzole folipage** (Marie › Skilly): u skillu zvolte
„Instrukcí pro agenta“, zkopírujte instrukci do svého agenta a ten si skill
stáhne a nainstaluje sám, i s vaším API klíčem.

Všechny skilly z tohoto repozitáře:

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

Ručně: zkopírujte složku ze `skills/` do složky se skilly svého agenta:

| Agent | Složka |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex a ostatní | `~/.agents/skills/` |
| Cursor | `~/.cursor/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| GitHub Copilot | `~/.copilot/skills/` |
| OpenCode | `~/.config/opencode/skills/` |

API klíč pro namluvení dejte agentovi do prostředí nebo do `.env`
v pracovní složce:

```bash
FOLIPAGE_TOKEN=…
```

### Executing program

Úkol agentovi napíšete obyčejnou větou, třeba:

* „Udělej návod k naší aplikaci na app.example.com pro nové zákazníky.
  Přihlásím se sám.“
* „Natoč krátké video, jak se zakládá nový projekt, a namluv ho česky.“
* „Nadabuj video demo.mp4 do angličtiny a němčiny a přidej titulky.“

Agent si skill vybere sám podle úkolu. Hotový návod (ZIP) nebo video pak
nahrajete do svého portálu ve folipage.

## Deployment

Repozitář je zrcadlo složky `skills/` z vývoje folipage. Změny se dělají tam
a sem se přenášejí po vydání nové verze folipage, aby verze skillu tady
odpovídala té, kterou hlásí folipage. Pull requesty sem proto nepřijímáme,
chybu nebo nápad nám napište.

## Help

Každý skill si při spuštění zkontroluje, jestli nevyšla novější verze, a řekne
vám to. Novou verzi nainstalujete stejným příkazem jako poprvé.

Které skilly vidí `npx skills`:

```bash
npx skills add 200solutions/folipage-skills --list
```

Když agent skill nenajde, zkontrolujte, že složka skillu leží přímo ve složce
se skilly (`~/.claude/skills/folipage-tutorial/SKILL.md`, ne o úroveň hlouběji),
a agenta spusťte znovu. Když namluvení hlásí chybějící klíč, chybí
`FOLIPAGE_TOKEN` v prostředí nebo v `.env`.

## Authors

* [200solutions s.r.o.](https://folipage.com)

## Version History

Verzi každého skillu najdete v hlavičce jeho `SKILL.md` (`metadata.version`).

* 1.0.0
    * První vydání: návod, video z obrazovky, namluvení a dabing.

## License

© 2026 200solutions s.r.o. Všechna práva vyhrazena.

## Poznámky pro vývojáře

* Tech stack: Node.js skripty (ES moduly), Playwright, ffmpeg; popis skillů
  v `SKILL.md` podle specifikace [Agent Skills](https://agentskills.io).
* `.claude-plugin/marketplace.json` dělá z repozitáře marketplace pluginů
  pro Claude Code; generuje se při každé synchronizaci.
* Vše kromě `.git` se při synchronizaci přepisuje, ruční úpravy tady
  nepřežijí.

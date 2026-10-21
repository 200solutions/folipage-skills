# The folipage content format

What the folipage import accepts, and how it turns a folder into a site. Write
exactly this; `scripts/validate.mjs` checks it.

## Folder layout

```
<project>/
  index.md                      front page (optional; without it folipage writes a plain welcome)
  01-Getting started/           a topic folder = a group heading in the sidebar
    README.md                   the group's overview page, shown first in the group
    01-sign-in.md               pages; the number prefix sets the order
    02-first-project.md
    images/
      sign-in-1.png             screenshots next to the pages that use them
  02-Invoices/
    README.md
    01-create-an-invoice.md
    images/
```

- **Top-level folders are the sidebar groups.** The group label is the folder
  name without its number, taken as written: `02-Psaní obsahu` → “Psaní
  obsahu”, `02-Invoices` → “Invoices”. So **name each group folder exactly as
  the reader should see it** — in the tutorial's language, with diacritics,
  spaces and a capital first letter. The URL is made from it separately
  (`/psani-obsahu/`). A folder written as a slug (`02-psani-obsahu`) ends up
  labelled “Psani obsahu”, without diacritics — `validate.mjs` warns about it.
- **Number prefixes** (`01-`, `02-`) set the order of groups and pages and are
  stripped from URLs. Always use them; `package.mjs` writes the ZIP in sorted
  order so the groups arrive in that order.
- **`README.md` in a folder** becomes the group's overview page.
- Pages directly in the root (other than `index.md`) land in a group called
  “General”. Avoid that; every page belongs in a topic folder.
- Keep it to one folder level plus `images/`. Deeper folders work, but the
  sidebar only shows groups for the top level.
- Page file names and `images/`: lowercase ASCII, digits and dashes
  (`03-create-an-invoice.md`). Only the group folders carry display names;
  a page's label comes from its `title`.

## Frontmatter

Every page starts with frontmatter. The build's schema is strict: any other
key fails the page.

```md
---
title: "Create an invoice"
description: "Issue an invoice to a customer and send it by e-mail in three steps."
order: 1
updated: 2026-09-21
---
```

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | yes | The page heading (it is the H1 — do not repeat it in the body) and the sidebar label. Short, task-shaped. |
| `description` | yes | One sentence under the heading and in search results. Under 160 characters. |
| `order` | no | Position in the group; lower first. The file's number prefix sets it when missing. |
| `updated` | no | `YYYY-MM-DD` — the day the screenshots were taken. |
| `draft` | no | `true` keeps the page out of the published site. |
| `group` | no | Moves the page to another group, by folder id (`invoices`). Rarely needed. |
| `icon` | no | Not drawn anywhere at the moment. Leave it out. |

Write every value on one line. Quote strings that contain `: ` or ` #`
(safest: quote every title and description).

## Body

The body starts with text, not with `# Title`. Sections are `##`, subsections
`###`. Everything below is plain Markdown with GitHub extensions (tables,
task lists, strikethrough) and a few directives.

### Steps

For every procedure. The outer block has one more colon than the steps inside.

```md
::::steps
:::step{title="Open the invoices"}
In the left menu, click **Invoices**.

::image{src="./images/create-invoice-1.png" alt="The Invoices item in the left menu, highlighted" highlight='{"width":1280,"height":720,"marks":[{"x":24,"y":180,"width":344,"height":88,"radius":16}]}'}
:::
:::step{title="Start a new invoice"}
Click **New invoice** in the top right corner. An empty invoice opens.
:::
::::
```

A step's title is `title="…"` (or text in brackets: `:::step[Open *the* invoices]`).
Anything can go inside a step: text, images, lists, callouts, code.

### Callouts

Five kinds, by urgency. Optional custom title in brackets.

```md
:::note
Good to know; nothing happens if the reader skips it.
:::

:::tip
A shortcut or a better way.
:::

:::important
Without this the reader will not reach the goal.
:::

:::warning[Before you send it]
Something can go wrong — data, money, other people.
:::

:::danger
Irreversible: deleting, paying, sending to customers.
:::
```

### Collapsible sections

```md
:::details{title="What if the customer has no VAT number?"}
Leave the field empty; the invoice is issued without it.
:::
```

### Images

A plain screenshot is a Markdown image, path relative to the page:

```md
![The invoice list after saving](./images/create-invoice-4.png "The invoice list")
```

A screenshot with something highlighted is an `::image` directive whose
`highlight` attribute carries the marks as JSON — capture.mjs prints the line
ready to paste for every shot with `highlight`:

```md
::image{src="./images/create-invoice-2.png" alt="The New invoice button in the top right corner of the list, highlighted" highlight='{"width":1280,"height":720,"marks":[{"x":1004,"y":36,"width":228,"height":88,"radius":44}]}'}
```

- The alt text is **required** (in brackets, or `alt="…"`); describe what the
  image shows and what is highlighted.
- A caption under the image: the text in quotes, or `caption="…"`.
- An image standing alone in a paragraph becomes a figure; readers click it to
  enlarge.
- **The picture itself stays clean**: the rings, the dimming and the numbered
  labels are drawn by folipage over it, sharp at any size, in both colour
  themes, and the author can move them later in the editor. Never paint rings
  into the PNG.
- The `highlight` JSON is in the picture's own pixels (a 1440 × 900 window at
  2× scale is 2880 × 1800): `width` and `height` of the picture, `marks` (at
  most 10) each with `x`, `y`, `width`, `height`, optional `radius`, `color`
  (`#rrggbb`) and `label` (up to 3 characters, e.g. `"1"`); optional `dim`
  (0–0.8), `color` and `stroke` (1–12) for the whole picture. Write it on one
  line, in single quotes; a `'` inside becomes `\u0027`.
- No `<img>` tags.
- PNG, JPEG, WebP, GIF, AVIF or SVG, at most 10 MB each. The build resizes and
  converts them; do not shrink screenshots by hand.

### Videos

A video recorded for the tutorial goes **into the ZIP**, next to the page,
and plays in the portal with its subtitles:

```md
::video{src="./videos/zalozeni-faktury.mp4" captions="./videos/zalozeni-faktury.vtt" caption="Založení faktury za minutu" alt="Záznam obrazovky: založení faktury"}
```

- `src` is required: a relative path to an `.mp4` (H.264) or `.webm` file in
  the folder, at most 50 MB. `captions` is an optional WebVTT file (starts
  with `WEBVTT`, at most 1 MB), shown on by default. `caption` and `alt` as
  below; no other attributes. The whole ZIP stays under 100 MB.
- The import uploads the files and rewrites the paths; a video no
  `::video` points at is dropped.

A video hosted elsewhere is embedded from its `https://` address instead:

```md
::embed{src="https://www.youtube.com/watch?v=…" caption="Založení faktury za minutu"}
```

- `src` is required and must be `https://`. YouTube, Vimeo, CodePen and
  CodeSandbox addresses copied from the browser are turned into embeddable ones
  (YouTube plays from youtube-nocookie.com). Any other https address is framed
  as it is.
- `caption` (text under the video) and `alt` (a name for screen readers) are
  optional; no other attributes — an unknown one fails the build.
- One video per page at most, right after the introduction, before the
  steps. The steps with screenshots stay: the video is a companion, not a
  replacement.

### Links

Link to other pages by their relative file path — the import rewrites them to
the page URLs:

```md
See [Create an invoice](../02-Invoices/01-create-an-invoice.md).
See [Psaní obsahu](<../02-Psaní obsahu/README.md>).
```

- A path with a space (a group folder named for the reader) goes in angle
  brackets, `(<../02-Psaní obsahu/01-page.md>)`, or has `%20` for the space.
  A bare space ends the link — `validate.mjs` reports it.
- A link inside the same group is just the file name: `(02-add-a-customer.md)`.

External links are plain URLs. No `::button` (its link is not rewritten).

### Keys and inline

`<kbd>Ctrl</kbd> + <kbd>K</kbd>` for keys, `**Bold**` for UI labels, `` `code` ``
for things the reader types. No other HTML, no MDX (`import`, components).

## Limits

| What | Limit |
| --- | --- |
| Files in the ZIP | 2000 |
| ZIP in total | 100 MB |
| One Markdown file | 1 MB |
| One image | 10 MB |

## Importing the ZIP

Console labels are in Czech; the English is for orientation.

- **New portal:** *Nový portál* (New portal) → content *Nahrát ZIP s Markdownem*
  (Upload a ZIP with Markdown).
- **Existing portal:** the portal → *Zdroj* (Source) → *Nahrát ZIP* (Upload ZIP).
  **This replaces the portal's whole content**: pages missing from the ZIP
  disappear (with their translations) and earlier images are deleted. The
  previous version stays in the history and can be restored. Say this to the
  user before they upload into an existing portal.

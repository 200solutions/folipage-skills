# Writing the tutorial

A tutorial is judged by one thing: can a reader who has never seen the app
finish the task with the page open next to it? Everything here serves that.

## Organise by tasks, not by screens

- One page = one task the reader wants done: “Create an invoice”, “Invite a
  colleague”, “Export the monthly report”. Not “The Invoices screen”.
- Page titles are short imperative phrases in sentence case, without a
  trailing period: *Create an invoice*, not *Invoice creation* or *How to
  create an invoice?*.
- A topic folder groups the tasks of one area of the app. 3–8 pages per group
  reads well; split a bigger area.
- Start with **Getting started**: signing in, finding your way around the main
  screen, the first meaningful action. Then the areas in the order a new user
  meets them.
- The group's `README.md` says in 2–4 sentences what the area is for and links
  its pages in a list.

## Link the pages together

A tutorial is read by jumping, not front to back. Link generously wherever
one page touches another — the reader should never have to hunt in the
sidebar for a page the text just mentioned:

- **Prerequisites** in *Before you start* link to the page that does them:
  “You need [a customer](../02-Customers/01-add-a-customer.md) first.”
- **Mentions in steps and text** of another task, screen or setting link to
  its page the first time they appear on a page (not every time).
- **What next** links the one or two tasks that naturally follow.
- A group's `README.md` links all its pages; the front page `index.md` links
  every group's `README.md`.
- Across groups too: when *Publish changes* explains the draft, link to the
  page in *Writing content* that introduced it.

Link text is the target page's title or a natural phrase from the sentence,
never “here” or “click here”. Every link must resolve — `validate.mjs` checks
them.

## Shape of a task page

1. **One or two sentences** under the heading: what the reader achieves and
   when they need it. (The `description` is already shown as the lede; the
   first paragraph adds context, it does not repeat it.)
2. **Before you start** — only when there is something: a role or permission,
   data that must exist, a setting. Short list or a `:::note`.
3. **The steps** in a `::::steps` block.
4. **The result** — one sentence on what the reader now sees or has, often
   with the final screenshot.
5. Optionally **What next** — links to the one or two follow-up tasks.

Keep a page to one procedure of roughly 3–10 steps. More than 12 steps is two
tasks; split it and link them.

## Steps

- **One action per step**, plus what happens after it: “Click **Save**. The
  invoice appears at the top of the list.”
- The step title is the action in a few words: *Open the invoices*, *Fill in
  the customer*, *Send the invoice*.
- Say where things are before what to do: “In the top right corner, click
  **New invoice**.”
- Use the words **click**, **select** (from a list), **enter** or **type**
  (into a field), **turn on / turn off** (switches), **choose** (options).
  Never “hit”, “press on”, “go ahead and”.
- A form with many fields is one step with a short table or list of the fields
  that matter; do not make one step per field.
- Screenshot for each step where the reader has to find something new. Not
  for trivial ones (“Click **Save**” right next to the previous screenshot).

## Words

- **UI labels exactly as the app shows them**, in bold, with the app's
  capitalisation and language. Copy them from the screen, never from memory.
  If the app is in another language than the tutorial, give the label as shown
  and the meaning once in parentheses: **Uložit** (Save).
- Menu paths with ›: **Settings › Users › Invite**.
- Second person, present tense, active voice: “You see the list”, not “The
  list will be displayed”.
- Plain words, short sentences. No marketing (“powerful”, “seamless”,
  “simply”, “just”, “easily”). If it is easy, the steps show it.
- Name things the same way every time. Pick “customer” or “client” and stay.
- Numbers, dates and money in the format the app uses.

## Callouts, sparingly

At most two or three per page. `:::tip` for a real shortcut, `:::warning` or
`:::danger` before anything that sends, pays, deletes or cannot be undone.
Never a callout for what belongs in a step.

## Honesty

- Write only what you actually did and saw in the app. If a step could not be
  done (missing permission, a paid feature, an error), leave a visible marker
  for a person to finish and say so in your report:
  `TODO(folipage): describe how the export is approved — not available on the demo account.`
- Do not guess what a field does. If its purpose is not clear from the label,
  the help text or trying it on demo data, mark it `TODO(folipage)`.
- Do not describe errors or edge cases you did not see.

## Before you finish a page

- [ ] The title is a task; the description is one sentence under 160 characters.
- [ ] No `# heading` in the body; sections start at `##`.
- [ ] Every step is one action with its result; labels are bold and exact.
- [ ] Every image has alt text saying what it shows and what is highlighted.
- [ ] Every other page it mentions is linked (relative `.md` paths), and it
      links its follow-up tasks.
- [ ] Nothing personal in the text or the screenshots.

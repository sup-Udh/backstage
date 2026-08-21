# ALL AGENTS test prompt — Batman landing page

Paste the block below into **ALL AGENTS**. It is written as a list of
independent tasks with no agent named, so the team lead has to read the roster
and decide who gets what — which is the part being tested.

Each task writes its own file, so no two agents can collide.

---

Build a Batman landing page in this project folder using only HTML and CSS.
No JavaScript, no frameworks, no image files — keep it clean and aesthetic
rather than busy.

There are four separate tasks below. They are independent and each one writes a
different file, so they can be done in parallel. Work out who on the team is
best suited to each, hand them out, and take one yourself.

Ground rules everyone follows, so the pieces fit together:

- Colours are CSS variables declared once in `css/base.css` and used everywhere
  else with `var()`: background `#0a0a0d`, panel `#14141c`, gold `#f5c518`,
  muted text `#b9b9c3`, bright text `#f2f2f5`.
- Font is `'Courier New', Courier, monospace` throughout.
- `index.html` links the three stylesheets in this order: base, layout,
  components.
- The class and id names below are fixed. Do not rename them or invent others.
- No CSS file imports another.

**Task 1 — `index.html`**
The page structure and all the written copy. A header with nav, then four
sections in this order, then a footer:

- `#hero` — a hand-drawn inline `<svg>` bat symbol (SVG paths written by hand,
  no image files and no external URLs), an `<h1>`, a one-line tagline and one
  `<a class="btn">`
- `#gadgets` — six `<div class="card">`, each with an `<h3>` and a short line:
  Batarang, Grapple Gun, Smoke Pellets, Batsuit, Tumbler, Detective Mode
- `#cases` — four `<div class="case">` rows, each with a villain name, a threat
  level and a status
- `#contact` — a plain form with name, email, message and a `.btn` submit

Write real copy. No lorem ipsum, no TODOs, no placeholders.

**Task 2 — `css/base.css`**
The `:root` variables, a reset, `box-sizing`, body background and text colour,
heading and paragraph sizing, link styles, `::selection`. Nothing about layout
and nothing about components.

**Task 3 — `css/layout.css`**
A centred page container with a max width. `#gadgets` as a CSS grid: three
columns, two below 900px, one below 600px. Header and `.case` rows with
flexbox. Consistent spacing between sections. Exactly two media queries, at
900px and 600px.

**Task 4 — `css/components.css`**
Styling for `.btn`, `.card`, `.case`, nav links and the form fields. Thin gold
borders, a soft glow on hover, a subtle lift on the cards. Keep it restrained —
the page should read as sparse and confident, not neon.

When you are finished, each of you say only which file you wrote and what is in
it. Do not paste file contents into the chat.

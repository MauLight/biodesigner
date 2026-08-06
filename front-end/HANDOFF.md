# Handoff — BioDesigner, first session

Scratch note for whoever picks this up in a fresh window. Delete it once the
project has a real README.

## What this is

A new project, scaffolded 2026-08-03 by copying the layout and shell of an
existing app rather than starting from `create-next-app`.

**Source of everything here:** `/Users/mauulisseluz/GitHub/ai learner/front-end`
— a YouTube-transcript-to-academic-text app. Its sibling
`/Users/mauulisseluz/GitHub/readvideo` is the same app as a packaged Electron
monorepo. Neither is related to BioDesigner's purpose; they were the donor for
structure only. Don't carry over any more of their domain logic without being
asked.

## Layout

```
BioDesigner/
├── back-end/     README placeholder, no code
├── electron/     README placeholder, no code
└── front-end/    the only populated workspace
```

Three independent folders, deliberately **not** npm workspaces — no root
`package.json`, and `front-end/` carries its own `node_modules`. This mirrors
`ai learner/`. (First attempt used a workspace root like `readvideo/`; that was
wrong and was reverted.)

## front-end

Next.js 16.2.12, React 19.2.4, Tailwind v4, TypeScript. `output: "export"` with
`images.unoptimized`, because the renderer is expected to end up inside
Electron eventually — same config as the donor.

```
src/app/
├── layout.tsx            html/body shell, metadata title "BioDesigner"
├── globals.css           Tailwind v4 @theme tokens, copied verbatim
├── page.tsx              the grid
└── components/
    ├── navbar.tsx        left column
    ├── input.tsx         presentational input
    └── generation.tsx    right column
```

**The grid** (`page.tsx`) is the donor's, unchanged in structure:
`h-screen bg-black` → `grid grid-cols-2 grid-rows-1`. Left column is
`flex flex-col justify-center px-20 pb-40`; right column is
`bg-[#0d0d0d] px-20 overflow-hidden`. That `#0d0d0d` is the exact background
the donor's `AcademicText` sat on — the only thing taken from that component.

**`Generation`** fills the right column and repeats `bg-[#0d0d0d]`. Empty
otherwise. It's the placeholder for whatever the app actually outputs.

**`Navbar`** is the donor's JSX with all logic stripped, as asked. Present: the
hero block (icon + h1 + subtitle, absolutely positioned above the input), the
input, and a "Generate" button. Removed on purpose:

- `useVideo`/`useKeys` context, `useDebounce`, link parsing and verification
- the motion `layout="position"` commit-to-top animation and its settle callback
- status readout, video preview, keys button, clear button, `AnimatePresence`

Consequence: nothing is conditional, so everything renders at once, and no file
needs `"use client"` — it's all Server Components right now. `motion` and
`lucide-react` are installed; only `lucide-react` (`FilePlay`) is actually
imported. `FilePlay` and the "A subtitle goes here." copy are placeholders — the
donor's "Read Lecture Videos" wording was video-specific and was not carried
over.

Dependencies were trimmed to next/react/motion/lucide + tailwind. The donor's
katex, react-markdown, remark-gfm, remark-math and rehype-katex were only for
rendering generated articles, so they're absent. Add them back if BioDesigner
also renders markdown.

## State

Installed, builds clean (`npm run build` — compiles, typechecks, prerenders 3
static routes). Never opened in a browser, so the layout is unverified visually.
No git repository initialized. Nothing committed anywhere.

## Conventions to follow

`front-end/AGENTS.md` (and `CLAUDE.md`, which just includes it) came from the
donor and apply here:

- Next 16 differs from older training data — read `node_modules/next/dist/docs/`
  before writing framework code.
- No promise chaining. `async`/`await` with `try`/`catch`.
- No inline functions in JSX props. Named handler, passed by reference.

Also standing user preferences: answer concisely and lead with the conclusion;
never use the survey/question UI, ask in plain text or pick a sensible default;
stay in the scope asked — no unprompted follow-ups or adjacent fixes.

## Run it

```bash
cd front-end
npm run dev      # :3000
```

## Open questions

- What BioDesigner actually does. Never discussed — only the shell was built.
- Whether `back-end/` and `electron/` get filled, and in which order. The donor
  settled on back-end → front-end → electron for build order.
- Whether the hero copy, icon, and the "Generate" button label are final.

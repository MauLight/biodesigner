# BioDesigner

A biomimicry design assistant built on NASA PeTaL's [BIDARA][bidara] prompt. It
walks a design challenge through the five steps of the Biomimicry Design Process
— Define, Biologize, Discover, Abstract, Emulate — and judges each step against a
stated floor before letting you move on.

A desktop app: you supply your own API key, and nothing leaves your machine
except the calls to OpenAI.

```
BioDesigner/
├── back-end/    the BIDARA prompt, step criteria and session store, as
│                transport-agnostic core functions
├── front-end/   Next.js renderer, built as a static export
└── electron/    the desktop shell — serves the renderer, runs the core
```

[bidara]: https://github.com/nasa-petal/bidara

## How it fits together

The renderer is served over `http://127.0.0.1` rather than `file://`. Not for the
data — that travels over IPC — but because a `file://` page has an opaque origin
and loses the things a normal page takes for granted. So the local port serves
static assets only: no API surface, no credentials, nothing worth attacking.

`back-end/src/core/` is `(input, emit, signal)` and knows nothing about its
transport. Electron IPC drives it in the desktop app; the Express server in
`back-end/src/index.ts` is a second adapter over the same functions, useful for
testing the back-end with curl.

Your API key lives in the OS keychain via Electron's `safeStorage`, read by the
main process when it makes a request. It never crosses into the page.

Design transcripts are private by construction. They are written to the app's own
data directory as one JSON file each and never sent anywhere but OpenAI.

## Requirements

- Node 20 or newer
- macOS: Xcode command line tools (`xcode-select --install`)
- An OpenAI API key

## Build and run

From a fresh clone, one command does everything — install, build all three, and
package the app:

```bash
npm run setup
```

It leaves `BioDesigner.app` in `electron/release/mac-arm64/`. Drag it to
/Applications, or open it where it is.

The app is unsigned, which is fine because you built it: macOS only blocks
unsigned apps that arrive with a quarantine flag, and locally built ones don't
have one. That is the reason distribution is this repository rather than a
release download — a published artifact would need a Developer ID and
notarization, and this one does not.

The build follows your machine's architecture — Apple Silicon produces an arm64
app, an Intel Mac produces x64 — so there is nothing to configure either way.

To run from source instead, without packaging:

```bash
npm install          # one install for all three workspaces
npm run start:desktop
```

Build order is fixed and the root scripts enforce it: the shell inlines
`back-end/dist` and serves `front-end/out`, so both must exist first.

The first run downloads the Electron runtime (~100 MB) before the window
appears — Electron 43 fetches it on first use rather than during `npm install`,
so a quick install is normal and the wait comes later. It is cached afterwards.

On first launch the app asks for your key. It is encrypted into the keychain and
persists, so it is a one-time step.

## Rebuilding after a change

```bash
npm run package        # rebuild the .app after editing anything
npm run start:desktop  # build and run, without packaging
```

`npm run package` **overwrites in place** — output is named from the version and
architecture (`BioDesigner-0.1.0-arm64.dmg`), so rebuilding the same version
replaces the same files. Two things follow:

- Bumping the version produces a new filename and leaves the old DMG behind;
  `electron/release/` accumulates until you clear it. `rm -rf electron/release`
  is the clean reset, worth doing if you change target or architecture, since
  packaging overwrites rather than cleans.
- A copy you dragged to /Applications is *not* updated. Drag the new one over.

The packaged app is a snapshot. Nothing links it back to the source, so an edit
is not visible until you package again — use the dev loop below while iterating.

## Developing

```bash
npm run dev:renderer   # terminal 1 — Next dev server on :3000
npm run dev:desktop    # terminal 2 — the window, pointed at it for HMR
```

Renderer edits hot-reload in place. Back-end or main-process edits need
`npm run build` and a restart, since main imports those once at startup.

There is also a browser flow, which runs the Express adapter instead of the
shell and is the quickest way to exercise the back-end on its own:

```bash
npm run dev:backend    # terminal 1 — Express on :4000, reads back-end/.env
npm run dev:renderer   # terminal 2 — http://localhost:3000
```

That path reads `OPENAI_API_KEY` from `back-end/.env` and writes sessions to
`back-end/data/`. The desktop app shares neither — it has its own key in the
keychain and its own data directory, deliberately, so that installing a build
never inherits a developer's configuration.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Fresh clone to installed app, in one step |
| `npm run build` | All three, in dependency order |
| `npm run package` | Build, then the macOS .app/.dmg |
| `npm run start:desktop` | Build, then launch without packaging |
| `npm run dev:renderer` / `dev:desktop` | The two-terminal dev loop |
| `npm run dev:backend` | Express adapter on :4000, for the browser flow |
| `npm run typecheck` | Types across all three, no emit |

The shell is bundled with esbuild rather than emitted file-by-file, so the
packaged app carries no `node_modules` and no workspace symlink — everything main
reaches, including the back-end core and the OpenAI SDK, is inlined into
`electron/dist/main.js`. esbuild only strips types, so `npm run typecheck` is the
real check.

## Notes

- `electron/build/icon.png` is where the app icon goes: a 1024×1024 PNG, from
  which electron-builder generates the `.icns`. Without it the build ships the
  Electron logo.
- If `ELECTRON_RUN_AS_NODE=1` is set in your shell, Electron runs as plain Node
  and fails with `Cannot read properties of undefined (reading 'setName')`.
  Unset it.

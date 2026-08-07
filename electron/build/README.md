# Build resources

electron-builder reads this directory (`buildResources` in
`electron-builder.yml`) for assets it bakes into the app. Nothing here is used
at runtime.

## icon.png

Drop a **1024×1024 PNG** here named `icon.png` and electron-builder generates
the macOS `.icns` from it at package time — no conversion step needed.

- Square, 1024×1024. Anything under 512×512 is rejected.
- Transparent background if you want the usual rounded-rect macOS look; the
  image is used as-is, so bake in whatever shape you want.
- Supplying `icon.icns` directly also works, and is the option if you want to
  hand-tune the smaller sizes rather than let them be downscaled.

Without it the build logs `default Electron icon is used` and ships the Electron
logo — harmless, but it is the first thing anyone notices.

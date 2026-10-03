# Deploy zip build

Builds a deployable `.zip` containing only the files referenced at runtime (starting from an entry HTML), excluding the extra variant folders (`GWhist/`, `itchy/`, `newgrounds/`) unless they are referenced.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-zip.ps1 -Entry index.html -OutZip dist\newgrounds.zip -Clean
```

- `-Entry` is the HTML entry point.
- `-OutZip` is the output zip path (created under `dist/`).
- `-Clean` clears the previous staging folder and output zip.

## What gets included

- Anything referenced from:
  - HTML: `src=`, `href=`, and inline `url(...)`
  - CSS: `url(...)`
  - JS: `new Audio('...')`, `fetch('...')`, and `img.src = '...'/"..."`
- Always includes the card art folders `court/` and `special/` (top-level `.svg/.png/.webp` only; `special/art/` source images are skipped), since those paths are built at runtime.

## Notes

- The script is conservative: it only includes files that exist, and ignores external URLs and `data:` URIs.
- Built zips are ignored by git via `*.zip` in `.gitignore`.

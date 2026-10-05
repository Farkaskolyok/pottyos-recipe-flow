# Pöttyös RecipeFlow

Recipe imports, supplier document extraction, review, approval, and Word document generation.

## Development

Requires Node.js 22.12+ and Bun. Dependencies are fetched from the public npm registry during installation.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:3000. Run `bun run test:run`, `bun run lint`, and `bun run build` to verify changes.

## Windows desktop EXE (Tauri)

`bun run desktop:build` produces `src-tauri/target/x86_64-pc-windows-msvc/release/recipeflow.exe`.
Copy that single EXE to another folder or Windows x64 computer and double-click it. The frontend,
fonts, PDF worker, and Word templates are embedded; Node.js, Bun, Rust, and a local HTTP server
are not required to run it. No installer is generated.

The app uses the Microsoft Edge WebView2 Runtime already installed on Windows. It does not bundle
a browser or install/download a WebView2 runtime. A computer without WebView2 needs that runtime
installed separately. See [Tauri's Windows runtime options](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options).

Build prerequisites are Bun, Node.js 22.12+, Rust with the `x86_64-pc-windows-msvc` toolchain,
and Visual Studio C++ Build Tools with the Windows SDK. Run `bun install --frozen-lockfile` first.
Use `bun run desktop:dev` for a desktop development window. `bun run build:desktop` builds the
static frontend under `.output-desktop/public`; the regular web build remains separate.

Desktop imports, calculations, signatures, reviews, document generation, and backup/restore run
locally. Downloads use a Windows Save dialog. Source documents open in their Windows default
application (which is only needed to view those documents, not to import or generate them).
The demo specification placeholders open as `.txt` files. PDF page hints are not passed to external viewers.
AI service calls are unavailable and show “Az AI szolgáltatás nincs implementálva”; online
regulation verification returns the offline result. User-opened web links open in the default browser.

Data persists in `%LOCALAPPDATA%\hu.pottyos.recipeflow\WebView` using WebView2's IndexedDB/localStorage.
Source-viewing copies live in the app's `sources` cache folder; these copies can be deleted once
the external viewer is closed. The EXE is portable; its data remains in the current Windows user's profile.
Desktop and browser data are separate. To move existing data, export a backup in the browser's
Settings page, then import it in the desktop app's Settings page. Keep this identifier and WebView
profile path stable across updates, and export backups before replacing the EXE.

## Local production server

```powershell
bun run build
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:LOCAL_ONLY = "1"
bun run start
```

The production server uses the standard [TanStack Start and Nitro Node deployment](https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro). Keep using the same browser profile and origin: browser storage belongs to that origin. Export a backup in Settings before moving from another installation, then import it in the local one.

## Data and network connections

- Products, uploaded sources, settings, signatures, and audit data are stored in the browser's IndexedDB (with a localStorage fallback). Core extraction, calculations, and Word generation run in the browser.
- Fonts, document templates, PDF worker, and app assets are served by this installation. No external font service or runtime error reporting integration is used.
- Optional AI review sends target field keys/labels and short extracted snippets to the app server, which forwards them to the explicitly configured AI endpoint. Files are not uploaded by that feature, but snippets can contain sensitive supplier/product information. AI review requires the existing administrator opt-in; no provider is configured by default.
- Online regulation checks send only a normalized regulation identifier to the app server and then to the EU Publications Office. `LOCAL_ONLY=1` skips the external query and returns the existing offline result, leaving manual review available.
- Supporting documents can be imported from `.pdf`, `.docx`, `.xls`, and `.xlsx` files. Legacy `.doc` files are not supported; save them as `.docx` before importing. No Word or LibreOffice installation is needed for imports or Word generation.
- In local mode, AI endpoints must use `localhost`, `127.0.0.1`, or `[::1]`; redirects are rejected. Installation still needs internet unless dependencies and model files are already available offline. User-opened external links remain external links.

## Optional AI provider

Set server environment variables before starting the app:

- `AI_BASE_URL`: an OpenAI-compatible chat completions endpoint, including `/v1`.
- `AI_MODEL`: an available model supporting structured JSON output.
- `AI_API_KEY`: the provider's key; optional for local servers without authentication.
- `LOCAL_ONLY=1`: blocks external AI destinations and online regulation queries.

For a local model server already running on your computer:

```powershell
$env:LOCAL_ONLY = "1"
$env:AI_BASE_URL = "http://127.0.0.1:1234/v1"
$env:AI_MODEL = "your-installed-model"
$env:HOST = "127.0.0.1"
bun run start
```

Enable AI review in Settings after configuring the server. Suggestion quality depends on the selected model; source checks and approval rules remain in place. Cloud AI providers can also be configured explicitly when `LOCAL_ONLY` is unset. Provider credentials must stay on the server.

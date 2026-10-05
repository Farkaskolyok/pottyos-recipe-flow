# Pöttyös RecipeFlow

Recipe imports, supplier document extraction, review, approval, and Word document generation.

## Development

Requires Node.js 22.12+ and Bun. Dependencies are fetched from the public npm registry during installation.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:3000. Run `bun run test:run`, `bun run lint`, and `bun run build` to verify changes.

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
- Legacy `.doc` conversion uses a loopback service only. Run `python tools/doc-converter/server.py` with LibreOffice installed locally if conversion is needed. External hosts and redirects are rejected.
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

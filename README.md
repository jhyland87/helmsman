# Helmsman

A Manifest V3 Chrome-based browser extension to monitor and control 3D printers
from the toolbar popup. It talks to **Klipper printers via the Moonraker API**
today, and is built to be extended to other backends (e.g. OctoPrint) with no UI
changes.

## Features

- **Background monitoring** — a service worker keeps live WebSocket connections
  to every configured printer, so status is current the instant you open the
  popup (no need to keep it open).
- **Multiple printers** — switch between printers from a selector; each has its
  own dashboard.
- **Collapsible, user-selectable dashboard panels:** Printer Status, Temperatures
  (graph + control), Console, Macros, Fans & Outputs, Toolhead, Printer Limits,
  Webcam, Print Jobs, Print Queue, Bed Mesh.
- **Options pages:** Dashboard (full), Layout editor (drag to reorder), Printers
  (add/edit/remove), History & Statistics, System Stats, and Settings
  (light/dark/system theme, font size, language, storage backend).
- **Flexible settings storage:** extension storage, an on-disk file (File System
  Access API), or — per printer — the **Moonraker database** (so dashboards
  follow the printer across devices, like Mainsail/Fluidd).
- **Webcam-as-background** — optionally render the active printer's webcam feed
  behind the popup.

## Tech stack

TypeScript · Vite · React · TailwindCSS · MUI · Recharts · @dnd-kit. The
Moonraker client is the [`@jhyland87/moonraker-client`](modules/moonraker-client)
submodule, consumed directly from source.

## Architecture

```
src/
  core/            # backend-agnostic, shared by background + UI
    model/         # PrinterSnapshot — the normalized, vendor-neutral state model
    drivers/       # PrinterDriver interface + registry; moonraker/ implementation
    messaging/     # typed protocol + UI-side client (port stream + request/response)
    settings/      # schema, chrome.storage store, File System Access helpers
    printers/      # printer connection config
    util/          # runtime type guards
  background/      # service worker: PrinterManager (connections) + MessageRouter
  ui/
    shared/        # theme, i18n, state contexts, shared components, api wrappers
    panels/        # dashboard panels + registry
    popup/         # toolbar popup app
    options/       # full-window options app + pages
```

**Extending it:**
- New panel → add a component and one entry in `src/ui/panels/registry.tsx`
  (+ an id in `PanelId`).
- New backend → implement `PrinterDriver` and add one entry in
  `src/core/drivers/registry.ts`. Nothing else changes.

## Build & load

```bash
# one-time: fetch the moonraker-client submodule if not present
git submodule update --init --recursive

pnpm install
pnpm run build         # type-checks then builds dist/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `dist/` folder.

Scripts: `pnpm run dev` (Vite dev server), `pnpm run typecheck`,
`pnpm run client:test` / `pnpm run client:build` (the submodule).

> Uses **pnpm**. Native build scripts (`esbuild`, `@tailwindcss/oxide`) are
> approved in `pnpm-workspace.yaml`; without that pnpm aborts with
> `ERR_PNPM_IGNORED_BUILDS`.

## Moonraker authorization (403 on connect)

When Moonraker's `[authorization]` component is active there are two separate
gates:

1. **Authentication (HTTP 401)** — handled automatically. Before connecting,
   Helmsman `GET`s `/access/oneshot_token` and appends `?token=…` to the
   websocket URL. If your Moonraker also gates that endpoint, set an **API key**
   on the printer (Printers page).
2. **Cross-origin (HTTP 403)** — **requires a one-time Moonraker config change.**
   Moonraker runs on Tornado, whose websocket `check_origin` returns 403 for any
   `Origin` not in `cors_domains`, and a browser always sends the extension's
   `chrome-extension://…` origin. A browser extension can't suppress that header
   on its service-worker websocket, so add this to `moonraker.conf` and restart
   Moonraker:

   ```ini
   [authorization]
   cors_domains:
       chrome-extension://*
   ```

Helmsman detects this case for you: if the token authenticated but the websocket
never opened, the Printer Status panel shows a warning telling you to add
`chrome-extension://*` to `cors_domains`.

## Notes & limitations

- A webcam stream served over plain `http` may be blocked as mixed content in
  the extension's (secure) popup context; use an `https`/reverse-proxied stream.
  `ws://` connections to local printers work from the background worker via the
  extension's host permissions.
- "Solid foundation" build: the core panels and the Settings/Printers pages are
  fully implemented; Print Jobs/Queue, Bed Mesh, History, Layout, and System
  Stats are implemented at a functional baseline and easy to extend.

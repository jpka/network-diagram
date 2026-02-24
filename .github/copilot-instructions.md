<!-- Copilot instructions tailored to this repository -->
# Copilot instructions for contributors

This repository is a client-side, D3-based network diagram renderer. The entry point is `src/index.js` which exports an async `create(id, container, settings)` factory that initializes the diagram instance and pushes the initial layer.

- Big picture
  - `src/index.js`: top-level lifecycle (create, destroy, updateSettings). Use this to instantiate or tear down diagrams.
  - Layering: `src/layers.js` manages stacked diagram layers. The current layer is `diagram.layers[0]` and many `diagram.*` properties are proxied to that layer.
  - Data flow: `Data.fetch()` (in `src/data.js`) loads JSON (default paths like `api/diagramlayer3.json`). `Data.process()` converts API graphs into `layer.nodes`, `layer.edges`, and `layer.groups` consumed by `Graphics` and `Simulations`.
  - Rendering: `src/graphics.js` builds D3 `svg` elements and handles interactions/tooltips. `src/simulations/*.js` contains D3 force/drag behaviour.
  - Persistence: `src/layout.js` and `src/store.js` save layout and settings in localStorage (key: `layout` and other keys via `Store`).

- Developer workflows
  - Build (dev): `npm run build` (webpack dev build).
  - Build (prod): `npm run prod` (webpack production build).
  - Dev server: `npm run serve` (webpack-dev-server serves local `public/` and `api/` JSON files used by the app).
  - Unit tests: `npm test` (vitest). E2E: `npm run test:e2e` (Playwright).

- Project-specific conventions and patterns
  - ES modules only (`type: module` in `package.json`). Use `import`/`export` consistently.
  - Layers are treated as a stack. New visual contexts call `Layers.push(...)` or `Layers.push_subnets(...)` and are removed with `Layers.remove`/`Layers.refreshLayer`.
  - Group IDs use backslash-delimited strings (e.g., `group\subgroup`). See `src/data.js` and `src/layers.js` for parsing and `title_width` calculation via `getTextWidth`.
  - Devices reference `DevNum` and are assigned `id = String(DevNum)`; subnet nodes use `subnet` string values. Code assumes these fields exist in API JSON.
  - Configuration objects often convert lists to `Set` for quick containment checks (see `create()` in `src/index.js`). When mocking configs, mirror that shape.
  - Many modules export objects of functions (e.g., `Graphics`, `Data`, `Layers`) rather than single-class instances — prefer method-style edits.

- Integration points / external dependencies
  - Data is fetched from local JSON files under `public/api/*` (e.g., `diagramlayer3.json`). In dev the webpack server serves these paths; adjust `Data.fetch(...)` calls to change API endpoints.
  - D3 is used heavily (`d3-selection`, `d3-force`, `d3-fetch`, `d3-zoom`); follow existing D3 patterns (selection updates, enter/update/exit) when modifying visuals.
  - Polling: `Graphics.fetchStatus()` polls `api/diagramlayer3.json` on a timer (see `timeoutRefresh`) — be careful when modifying remote fetch behavior.

- Quick examples
  - To change the initial data source: edit `src/index.js` where `Layers.push('main', diagram, Data.fetch('api/diagramlayer3.json'))` is called.
  - To add a new UI toolbar action: inspect `src/ui/toolbar.js` and hook into `Toolbar.*` methods which `src/index.js` calls (e.g., `toggleToolbar`, `toggleFloatMode`).
  - To create a focused drill-down layer: mimic `Layers.drillDown.device()` or `Layers.drillDown.subnet()` which call `push(...)` with prepared promises.

- When editing code
  - Run `npm run serve` and open the served app to iterate quickly; the app expects `api/*.json` to be served from the same origin.
  - Preserve the D3 enter/update/exit semantics in `src/graphics.js` — visual bugs usually stem from incorrect data joins.
  - Keep `structuredClone`/`Set` conversions when manipulating config objects to match runtime shapes used across modules.

If any of the above is unclear or you want more examples (test harness, focused file list, or sample data), tell me which area to expand.

# RepoMentor AI

An interactive repository constellation with a temporary, on-demand backend for Team Code Blooded · VIT Code Apex 3.0.

## Run

Requires Node 22.12+ (validated with Node 26) and npm.

```sh
npm install
npm run dev
npm run build
npm test
npm run test:e2e
```

The Playwright configuration uses installed Google Chrome. Install Chrome, or change `channel` to a Playwright browser installed with `npx playwright install chromium`. The local preview runs on port 5173 for browser tests.

## Experience

- `/`: gamma landing page combining beta's interactive star field, centered hero, and Geist typography with alpha's reflective glass input. Recognized GitHub URLs smoothly split into an editable owner/repository capsule and a search bubble. The page fits one screen, with no lower sections or scrolling. A synchronized 2.6-second handoff moves the branding to the top, slides the headline apart, scatters the background fade, and docks the glass repository label above the scene controls. The scene prepares behind the landing page with its formation clock paused, then begins the central star bloom when the handoff completes. Hovering a background connection quickly eases its glow in and out. Reduced-motion preferences are respected.
- `/explore/demo`: 43 deterministic nodes, 49 explicit relationships, orbit/zoom/focus controls, search and keyboard node navigation, inspector, source viewer, and demonstration mentor.
- `/explore/:owner/:repo`: opens the actual public repository tree at a pinned revision through the Cloudflare API. Size limits are checked before the landing transition. Code, import analysis and AI answers load only when requested.
- `/not-found` and unknown routes: minimal recovery screen.

Drag to orbit, scroll/pinch to zoom, click a star to inspect. Use Cmd/Ctrl+K to search, M to open Mentor, and Escape to close. The node navigator makes the graph usable without WebGL or precise pointing.

## Data and evidence

`src/types/repository.ts` defines JSON-compatible contracts. `src/services/repositoryAdapter.ts` defines the boundary shared by the live REST implementation and local demo and a separate optional streaming interface. The renderer takes graph data; it never fetches repositories.

`mockRepositoryAdapter` serves only the explicit demo route. `liveRepositoryAdapter` uses the Cloudflare API for real repository routes and never substitutes demo data when the backend is missing. The backend uses expiring SQLite-backed Durable Objects, pinned GitHub blobs, static import parsing and Gemini/OpenAI structured answers. See [backend setup and architecture](backend/README.md).

The preview includes seven actual local sample sources in `demo-source/src`. Their import edges and citation ranges are backed by those files. Other nodes are explicitly marked structure-only, with source retrieval pending. The demo revision SHA is a fixed synthetic snapshot identifier, not a claim about an upstream Git commit. Mentor responses are prewritten and labeled; unsupported questions return uncertainty without citations.

## Architecture

- React + strict TypeScript + Vite + Tailwind CSS
- Three.js via React Three Fiber, instanced star geometry and batched edges
- Drei camera controls and adaptive DPR
- Motion transitions with reduced-motion support
- Zustand interaction state, a discriminated overlay union, and explicit landing/load phases
- Read-only CodeMirror 6 with monochromatic syntax and line-level citations
- React Router, Vitest, Testing Library, and Playwright
- Locally bundled Geist (landing), Inter, and JetBrains Mono; no hosted visual assets

The deterministic Fibonacci layout groups files near parent modules. At more than 300 eligible nodes the filtering layer progressively exposes modules and the selected branch. The canvas caps DPR, reduces resolution on mobile, pauses when hidden, cleans up geometry/listeners, and falls back to DOM navigation if WebGL fails. No frame loop updates React state. One shared entrance timeline forms the graph outward from the repository core. The central star keeps its existing opening. Equal-priority nodes across folders share a wave, with small deterministic variations in launch timing, bloom speed, and rim strength. Peer ignitions remain within about 130ms of one another. As each wave reaches full size, tiny light pulses depart immediately while its rims settle; destination stars begin a faster bloom just after the pulse passes halfway and are visible before it arrives. A short, faint tail follows each pulse, which dissolves into the star rather than lingering at an empty endpoint. Labels type in during arrival. Cross-file links join already-formed stars. Faster pulse travel, destination blooms, and typing stay synchronized to arrival. The full demo forms in 6–7 seconds, retaining the small star rim, original label font, and stable label positions. Auto-rotation begins after formation, accompanied by occasional faint meteor pulses on varied paths. At most two ambient pulses can be active, independent of graph size. Reduced-motion mode displays the completed graph immediately and disables ambient pulses.

## Tests

Unit/component tests cover URL parsing and deceptive hosts, paste/edit/submit behavior, selection, inspector navigation, search, filters, stable layouts at 30/100/300/600 nodes, evidence ranges, unknown repositories, aborts, and mentor output.

Browser tests cover desktop and mobile end-to-end journeys, glass splitting and editing, single-screen landing layouts, citation navigation, filters, reduced motion, source-unavailable states, and horizontal overflow. Separate dev-only fixtures render 30/100/300/600 nodes and attach frame-time measurements. These measurements are local checks, not a guarantee across devices. `tests/performance.html` is excluded from the production build.

Optional feature-detected WebMCP exposes `select_demo_node` using the same selection action as the UI. Unsupported browsers ignore it.

## Backend and temporary data

The backend implementation is in `backend/`; shared limits are in `shared/limits.ts`. Start with [the deployment guide](backend/README.md). It covers Cloudflare Free hosting, provider secrets, local setup, API routes, exact data-retention behavior and verification. Source caches expire after 15 idle minutes and never live longer than an hour. GitHub Pages remains the frontend host; it cannot run the backend itself.

## GitHub Pages deployment

For https://y8sidd.github.io/, Vite's default base `/` is correct. The source index.html must be built before deployment; GitHub Pages cannot execute src/main.tsx directly.

1. Deploy the Worker following `backend/README.md`. Set the GitHub repository variable `VITE_API_BASE_URL` to its HTTPS URL. Upload the complete updated project, preserving all paths.
2. In repository Settings → Pages → Build and deployment, set Source to **GitHub Actions**.
3. Commit to `main`, or open Actions → Deploy RepoMentor to GitHub Pages → Run workflow.
4. When the deployment completes, open https://y8sidd.github.io/. The direct demo link is https://y8sidd.github.io/#/explore/demo.

The workflow installs dependencies, builds with `VITE_GITHUB_PAGES=true`, and deploys only `dist`. This enables hash routing for Pages so refreshing a constellation route works. Local development and ordinary builds retain BrowserRouter and the existing clean URLs. The public favicon and fonts are included automatically. Never publish the raw source folder as the Pages artifact.

AI Mentor now uses each visitor’s own Gemini/OpenAI key, entered in the panel and kept only in memory until it closes. No owner AI key is needed for deployment. See the backend guide for the updated setup.

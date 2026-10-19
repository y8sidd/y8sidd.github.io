# RepoMentor AI

A frontend-only repository constellation for Team Code Blooded · VIT Code Apex 3.0.

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
- `/explore/:owner/:repo`: opens the constellation directly as a clearly labeled demo-data preview. The displayed graph keeps its demo identity; live repository analysis is not connected. The landing page verifies public repository existence through GitHub before navigating.
- `/not-found` and unknown routes: minimal recovery screen.

Drag to orbit, scroll/pinch to zoom, click a star to inspect. Use Cmd/Ctrl+K to search, M to open Mentor, and Escape to close. The node navigator makes the graph usable without WebGL or precise pointing.

## Data and evidence

`src/types/repository.ts` defines JSON-compatible contracts. `src/services/repositoryAdapter.ts` defines the boundary for a future REST implementation and a separate optional streaming interface. The renderer takes graph data; it never fetches repositories.

`mockRepositoryAdapter` only serves `demo/constellation-app`. Arbitrary GitHub URLs never receive the demo graph under their identity. The landing page calls GitHub’s public repository metadata endpoint to validate existence on submission. Missing or private repositories, rate limits, and connection failures keep the user on the landing page. There are no Python services, databases, embeddings, or LLM requests.

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

## Connecting a backend

Implement `RepositoryAdapter`, preserving repository identity, revision, evidence IDs, and validated citation ranges. Inject the real adapter into the exploration loader and mentor. Add authentication and server error handling at that boundary. Do not replace demo status labels with verified analysis claims until the backend supplies that evidence.

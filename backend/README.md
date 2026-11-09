# RepoMentor backend and free hosting

The website stays on **https://y8sidd.github.io**. GitHub Pages serves static files and cannot run the API or keep an AI key secret. The API runs separately on **Cloudflare Workers Free**, with SQLite-backed Durable Objects for isolated, expiring sessions. No Redis service, virtual server, paid database, vector database or always-running process is needed.

The implementation is ready to configure, but uploading these files to GitHub alone does not deploy the backend. A Cloudflare account is required to deploy; each visitor supplies their own provider key for AI. The free plan has quotas; this is not an unlimited service or an uptime guarantee. Leave Workers on its Free plan. Gemini can use an eligible free-tier project/model; OpenAI API access normally requires paid usage or available credits. Never enable provider billing if you want strictly zero AI spend.

## Deployment, in order — browser only

1. Upload the updated project to GitHub, preserving its folders and both lockfiles.
2. Keep Cloudflare Workers on its Free plan. Create an account-scoped **Edit Cloudflare Workers** API token and copy your Account ID.
3. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Run **Deploy RepoMentor API**.
4. Copy the deployed HTTPS Worker URL into GitHub repository **variable** `VITE_API_BASE_URL` (no `/v1` suffix).
5. Optionally add `GITHUB_TOKEN` as a Cloudflare Worker secret to improve public GitHub rate limits. No owner Gemini/OpenAI key or model is required.
6. Set Pages source to **GitHub Actions** and run **Deploy RepoMentor to GitHub Pages**.
7. Test a small repository, open Mentor, enter your own provider/model/API key, ask a question and open a citation.

## Each visitor supplies their own AI key

AI Mentor prompts for provider (Gemini/OpenAI), exact model ID and a password-masked API key before the first question. The visitor chooses a model accessible to their provider account, including free-tier eligibility where available. Provider usage and billing apply to that key's account. A ChatGPT/Gemini consumer subscription does not necessarily include API usage.

The key stays only in the mounted Mentor panel's memory. It is cleared on closing the panel, removing the key, navigating away or refreshing. It is never written to localStorage/sessionStorage, URLs, repository graphs or Durable Object storage. Each question transmits credentials in the HTTPS JSON request body to RepoMentor's backend; the backend forwards them only to the selected provider's fixed API endpoint. Application request/body logging is disabled. Infrastructure operators and the user's browser can still inspect in-flight requests; this is not an end-to-end encrypted provider connection.

The backend requires credentials on **every** question and has no owner-key fallback. Keys are structurally checked at entry and validated by the provider when a question is sent. Rejected credentials produce a sanitized error without forwarding provider error bodies. Service/session quotas still apply to protect the shared hosting resources. Repository browsing and source viewing need no AI key.

Old `GEMINI_API_KEY`/`OPENAI_API_KEY` Worker secrets and `AI_PROVIDER`/`AI_MODEL` vars are no longer used; remove them from an existing deployment. Users should enter keys only into the deployed site's Mentor form, never into GitHub files or chat.

### Bot verification (recommended before public promotion)

Create a free Cloudflare Turnstile widget for `y8sidd.github.io`. Add its **public** site key as the GitHub repository variable `VITE_TURNSTILE_SITE_KEY`. Store its **secret** as Worker secret `TURNSTILE_SECRET_KEY`, and set `TURNSTILE_HOSTNAME` to `y8sidd.github.io` in Wrangler vars. Redeploy both parts together. If enabled, direct links without a session ask visitors to start from the landing page for verification. For local testing, use Turnstile's test keys and matching localhost settings. Quotas still apply without Turnstile; CORS alone is not authentication or bot protection.

## Local development

Copy root `.env.example` to `.env.local`, and `backend/.dev.vars.example` to `backend/.dev.vars`. These local files are gitignored. Only optional GitHub/Turnstile secrets belong in `.dev.vars`. Enter a personal AI key in the Mentor panel; never use a `VITE_` prefix for any secret. Use separate terminals:

```sh
npm run backend:dev
npm run dev
```

The frontend uses port 5173 and the Worker 8787. The local environment example allows 5173 and 5174 origins. Production `ALLOWED_ORIGINS` is exactly `https://y8sidd.github.io`; add only origins you control if changing the site domain.

## Limits and behavior

| Resource | Bound |
| --- | --- |
| Public repository snapshot | 250 files, 300 total nodes, 10 MiB of file bytes |
| Tree response / hierarchy | 512 KiB, at most 12 path levels; truncated trees rejected |
| Displayed connections | 600 total, at most 40 imports added per file |
| Source file | 128 KiB, 5,000 lines, UTF-8 text only |
| Temporary source cache | At most 6 files per session |
| AI context per question | Up to 3 excerpts, 120 lines / 5,500 characters each |
| Question / answer | 1,500 characters / 1,800 output-token request cap |
| AI session budget | 20 attempts; the last 20 visible chat messages only |
| Session lifetime | 15 minutes idle, hard maximum 1 hour |
| Default service budgets | 200 session attempts / day; 100 AI attempts / day; 5,000 ordinary API requests / day |
| Per-IP budgets | 8 session attempts / hour; 30 AI attempts / day; 60 requests / minute |

Limits are deliberately conservative starting bounds, not a promise for all devices. Live-tree formation is capped to a roughly seven-second animation timeline while preserving the core star opening; the demo choreography stays unchanged. Renderer geometry is instanced/batched, code editor and panels are lazy chunks, source files never enter the main graph, and background rendering pauses in hidden tabs. Heavy actions run in a separate per-session Durable Object, not in the browser frame loop. Overlapping requests in one session receive a retryable busy message. Quota/provider failures preserve the existing map. GitHub calls time out after 20 seconds each and AI calls after 45 seconds; the client caps a full request at 115 seconds.

The backend obtains repository metadata, resolves the default branch to a **fixed commit SHA**, then fetches its recursive tree. It does not clone or execute repositories. Every file and folder is represented, including unsupported files, but contents are downloaded only on demand. Source availability is decided by byte size, mode and a text-extension allowlist; `.env`, key files, symlinks, submodules, binary data, invalid UTF-8 and Git LFS content are not opened.

**Analyze imports** statically parses only the chosen JS/TS file. It resolves local relative imports/re-exports and literal dynamic imports or `require` references to existing files. CommonJS `require` links are marked as possible relationships because the identifier may be locally shadowed. Package dependencies, custom aliases, generated code, arbitrary build systems and runtime call graphs are not inferred. A syntax-level relationship is not proof that a branch executes.

**AI Mentor** fetches only a few relevant files (selected file, known imports, path matches and likely entry points), clips them to bounded numbered excerpts, and submits a structured request to the configured provider. It does not send the entire repository or previous chat turns. Follow-up questions must be self-contained. File contents are treated as untrusted data, never executed. Citations must name an included excerpt and valid line range; invented/out-of-range citations cause an uncertainty response. Citation validation does not guarantee the model's interpretation is correct.

## Temporary data and privacy

Session IDs are random bearer tokens kept only in browser memory. One SQLite-backed Durable Object holds each session's metadata and bounded source cache. Leaving the repository requests deletion; tab close uses a best-effort keepalive request. Browsers cannot guarantee delivery on crashes or lost connectivity. Independent server-side alarms expire idle sessions, and expired sessions cannot be read or revived by delayed downloads. No accounts, analytics, full-repository indexes or permanent chat histories are added.

Rate-limit counters contain a daily SHA-256-derived IP identifier, never a raw IP in application storage, and expire after the UTC day. These identifiers are rate-limiting data, not anonymization guarantees. Application logging is disabled. Cloudflare may retain infrastructure logs/backups under its own policies, and AI providers have independent retention/data-use terms. OpenAI requests use `store:false`, which does not disable every provider retention mechanism. App deletion is not a promise of immediate physical erasure from provider backups. Public source excerpts are sent to the chosen AI provider only when a user asks Mentor.

## API contract

All `/v1` endpoints require an allowed `Origin`. JSON requests are capped at 8 KiB. Session calls use `X-Session-Token`; tokens never appear in URLs. Responses are `Cache-Control: no-store`.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Runtime liveness |
| `/v1/limits` | GET | Limits and AI configuration availability, no secrets |
| `/v1/sessions` | POST | `{owner, repo, challengeToken?}` → `{sessionId, graph, expiresAt}` |
| `/v1/session/graph` | GET | Current metadata graph |
| `/v1/session/source?path=...` | GET | One pinned source file |
| `/v1/session/imports` | POST | `{path}` → verified local syntax relationships |
| `/v1/session/mentor` | POST | `{question, nodeId?, credentials:{provider,model,apiKey}}` → answer and bounded citations |
| `/v1/session/close` | POST | `{sessionId}` → delete session |

Errors have `{error:{code,message}}`. Large repos use 413, expired sessions 410, rate/busy limits 429, unavailable configuration 503. GitHub/provider response bodies and credentials are never forwarded to the browser.

## Verification

```sh
npm test
npm run test:backend
npm run backend:check
npm run build
npm run backend:build
npm run test:runtime
npm run test:e2e
npm run test:pages
```

`backend:build` is a Cloudflare dry run and does not publish. `test:runtime` exercises the actual compiled Worker and SQLite-backed Durable Objects with controlled upstream HTTP fixtures, catching runtime differences that Node unit tests cannot. Backend tests cover pinned tree-only ingestion, byte/file/node caps, unsafe source formats, isolated sessions, cache bounds, cleanup during downloads, idle/absolute expiry, origin checks, quotas, and both providers' structured request/response contracts. `test:pages` builds the production hash-router site in an ignored folder and verifies a direct repository link and refresh with a controlled HTTPS API fixture. Browser tests use controlled API fixtures for reproducible errors and citation navigation; they do not prove production credentials work.

Before presenting the public deployment, open a genuinely small public repo, view a file, analyze an import-bearing JS/TS file, ask Mentor, open a citation, and return to the landing page. Also try an oversized repo and refresh a Pages hash route. Enter a visitor key in Mentor for the real AI acceptance check. Missing keys are rejected; no owner account is used.

## Official references

- [GitHub Pages is static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare SQLite / runtime limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Gemini pricing and free-tier eligibility](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini structured responses](https://ai.google.dev/api/generate-content)
- [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs)

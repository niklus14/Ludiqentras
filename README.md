# Ludiqentra

Game market intelligence for developers planning a Steam release.

Ludiqentra turns a game description into a reviewed set of comparable games and a market report. It combines live provider data with explainable scoring to help evaluate positioning, commercial assumptions, and launch timing.

**[Open the app](https://ludiqentras.vercel.app)** · [Documentation](docs/ARCHITECTURE.md) · [API reference](docs/API.md)

## What you can do

- Describe a game in natural language and refine its genre, mechanics, and multiplayer requirements.
- Review suggested comparable games before approving data collection.
- Compare available prices, release dates, reviews, revenue estimates, and similarity factors.
- Explore revenue ranges, market saturation, review reception, and weekly launch pressure.
- Save the latest analysis on your device, export a JSON snapshot, or print a PDF report.

## Product workflow

| Stage | What happens |
| --- | --- |
| **Game concept** | Interpret the description, answer clarifying questions, and review candidate games. |
| **Comparable games** | Approve the evidence cohort, collect current game details, and set launch-date and price assumptions. |
| **Launch intelligence** | Review the market report, inspect competing releases, and compare launch windows. |

Discovery and collection are separate steps. Only approved candidates are collected, and unavailable games are reported rather than silently replaced.

## Data and analysis

| Provider | Role |
| --- | --- |
| **IGDB MCP** | Semantic discovery, game metadata, Steam identity resolution, and upcoming releases. |
| **Steam** | Store details, prices, release dates, tags, review totals, and recent review comments. |
| **Gamalytic** | Available commercial estimates through its free list endpoint. |
| **Grok / xAI** | Concept interpretation, candidate ranking, and follow-up questions. |
| **Upstash Redis** | Temporary discovery previews shared across serverless instances. |

When Grok is unavailable, supported workflows can use keyword extraction and tag-based ranking. Live discovery still requires IGDB access. Provider failures can result in partial data or an unavailable report section.

The scoring layer uses explicit evidence:

- **Similarity** combines semantic evidence with mechanics, genre, theme, game mode, and price. Missing semantic evidence is omitted from the weighted calculation rather than replaced with tag overlap.
- **Revenue** uses available commercial observations weighted by similarity. Missing revenue evidence produces unavailable ranges instead of a zero-income forecast. Review-based estimates are identified as estimates.
- **Reception** uses comparable review evidence and reports confidence separately.
- **Saturation** reflects cohort density, commercial concentration, and upcoming competition.
- **Release risk** reflects measured upcoming competitor pressure and release-date confidence. Seasonal and historical factors are not presented as measured inputs.

Facts, estimates, and predictions carry provenance. Outputs depend on the quality and coverage of the selected games; they are decision aids rather than guaranteed sales or reception outcomes.

See [the scoring guide](docs/SCORING.md) for the evidence rules and implemented calculations.

## Run locally

Use a Node.js version supported by Next.js 16 and the package manager pinned in `package.json` (`pnpm@10.16.0`). Production currently runs on Node.js 24.

```bash
git clone https://github.com/niklus14/Ludiqentras.git
cd Ludiqentras
corepack pnpm install
cp .env.example .env.local
```

Fill in the provider credentials in `.env.local`, then start the app:

```bash
corepack pnpm dev
```

Open [localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Purpose |
| --- | --- |
| `IGDB_MCP_CLIENT_ID` | IGDB MCP credential for live discovery and enrichment. |
| `IGDB_MCP_CLIENT_SECRET` | Matching IGDB MCP secret. |
| `XAI_API_KEY` | Enables Grok-powered interpretation and ranking. |
| `XAI_MODEL` | Optional model override; the example file includes a configured model name. |
| `KV_REST_API_URL` | Upstash Redis REST endpoint for shared previews on Vercel. |
| `KV_REST_API_TOKEN` | Upstash Redis REST credential. |
| `STEAM_WEB_API_KEY` | Optional credential used by legacy corpus scripts. |
| `CORPUS_PATH` | Optional corpus directory; defaults to `./data`. |
| `OPENAI_API_KEY` | Optional credential for the legacy embedding pipeline. |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Optional credentials for legacy corpus tooling. |
| `DEMO_MODE` | Mode flag reported by the health endpoint. |

The interactive app uses live collection; the legacy corpus is not required for its primary workflow. The complete configuration template is [`.env.example`](.env.example).

Keep secrets in `.env.local` for development and Vercel environment settings for deployment. `.env.local` is excluded from Git and deployment uploads.

## Deploy on Vercel

1. Import `niklus14/Ludiqentras` into Vercel with the **Next.js** framework preset and the repository root as the root directory.
2. Configure the provider credentials in the production environment.
3. Connect an Upstash Redis instance and provide `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. Deploy `main` and verify `/api/health`, discovery, and approved collection.

Preview deployments need their own environment configuration if enabled.

Pending discovery previews expire after 30 minutes. Redis makes previews available across serverless instances and uses atomic state transitions to prevent concurrent collection and reuse. Without Redis, the development fallback keeps at most 100 previews in one process; it is unsuitable for a multi-instance deployment.

Collected game records are not persisted in Redis. Completed analysis snapshots are retained in the browser's local storage.

## Development commands

| Command | Purpose |
| --- | --- |
| `corepack pnpm dev` | Start the development server. |
| `corepack pnpm build` | Create a production build. |
| `corepack pnpm start` | Serve the production build locally. |
| `corepack pnpm typecheck` | Check TypeScript types. |
| `corepack pnpm lint` | Run ESLint. |
| `corepack pnpm test` | Run the test suite. |
| `corepack pnpm test:watch` | Run tests in watch mode. |
| `corepack pnpm test:coverage` | Generate coverage results. |

Most provider tests use isolated fixtures. Redis integration tests run against a temporary local Redis process when `redis-server` and `redis-cli` are installed; otherwise those tests are skipped. Live smoke commands call external providers and require credentials. See [the operations runbook](docs/backend-reference/operations-runbook.md).

## Repository structure

```text
app/                    Pages, layout, global styles, and API routes
components/             Landing, concept, comparables, analysis, and shared UI
lib/domain/             Contracts, validation schemas, and scoring functions
lib/application/        Concept, discovery, approval, and analysis workflows
lib/infrastructure/     Provider adapters, Redis previews, and corpus access
lib/api/                Response helpers and typed browser API client
lib/session/            Browser persistence and analysis snapshots
tests/                  Tests organized by application layer
scripts/                Provider smoke checks and corpus utilities
docs/                   Architecture, API, scoring, and operational guides
```

Domain scoring is independent of provider access. Route handlers adapt HTTP requests to application workflows, and browser components use the API client rather than importing provider implementations. Architecture tests enforce these boundaries.

## Main API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Provider configuration flags and preview-storage mode. |
| `POST` | `/api/concept/analyze` | Interpret a game concept. |
| `POST` | `/api/concept/import` | Import a concept from JSON or a text document. |
| `POST` | `/api/games/discover` | Validate a description and preview candidate games. |
| `POST` | `/api/games/discover/collect` | Collect details for an approved preview. |
| `POST` | `/api/games/collect` | Collect details for explicit Steam AppIDs. |
| `POST` | `/api/analyze` | Produce a market report from supplied competitor evidence. |
| `POST` | `/api/export/json` | Export an analysis snapshot. |

The health endpoint reports configuration, not upstream availability. Legacy corpus discovery and lookup routes remain available; consult the API and discovery guides for their contracts.

## Documentation

| Guide | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Layers, dependency boundaries, and request flow. |
| [Scoring](docs/SCORING.md) | Similarity, revenue, reception, saturation, and release risk. |
| [API](docs/API.md) | Runtime endpoints and transport contracts. |
| [Data sources](docs/DATA_SOURCES.md) | Provider ownership and provenance. |
| [Discovery](docs/discovery.md) | Validation, candidate approval, and preview lifecycle. |
| [Collector](docs/collector.md) | Live collection and partial provider failures. |
| [Testing](docs/TESTING.md) | Test organization and validation commands. |
| [Workspace design](docs/workspace-design.md) | Product workspace components and visual conventions. |
| [Operations](docs/backend-reference/operations-runbook.md) | Local setup and live verification. |

## Technology

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, Recharts, Zod, Vitest, the Vercel AI SDK with xAI, the MCP SDK, and Upstash Redis over REST.

# Two-stage live game discovery

Automatic discovery validates the user's game description, proposes search tags, previews matching names, and collects expensive statistics only after approval. Grok receives and ranks IGDB candidate data but does not call MCP itself; the backend owns all MCP calls and validation.

## 1. Validate and preview

```http
POST /api/games/discover
Content-Type: application/json

{"query":"multiplayer horror games","limit":10}
```

`query` contains 3–2000 characters and `limit` defaults to ten. A revised request may add up to three `clarifications` shaped as `{question,answer}`. Unknown properties are rejected.

Grok first returns a normalized description, confidence, explicit requirements, exclusions, and 2–12 discovery tags. Each tag has a category, required/preferred priority, and explicit/inferred basis. These are normalized discovery facets, not claims about Steam's canonical tags.

A description is searchable only when confidence is at least 0.65, it has at least two unique tags and one required tag, and Grok has no unanswered questions. Otherwise the API returns:

```json
{"ok":true,"data":{"status":"needs_clarification","previewId":null,"questions":["What does the player do?"],"validation":{}}}
```

No IGDB search occurs in that case. After clarification, the backend constructs semantic queries from the validated description and every accepted tag, searches IGDB MCP, and asks Grok to rank only those candidates. Candidate IDs and matched tags are checked against the supplied sets. Exact IGDB-to-Steam identities are required.

A ready response contains no prices, reviews, sales estimates, or full game descriptions:

```json
{
  "ok": true,
  "data": {
    "status": "ready_for_approval",
    "previewId": "uuid",
    "expiresAt": "ISO-8601 timestamp",
    "validation": {},
    "candidates": [
      {"steamAppId":739630,"igdbId":132516,"name":"Phasmophobia","reason":"...","matchedTags":["Horror","Online co-op"]}
    ],
    "discovery": {"requestedCount":10,"returnedCount":10,"complete":true,"issues":[]}
  },
  "meta": {"mode":"live","durationMs":0}
}
```

If no exact Steam matches exist, `status` is `no_matches` and no preview is stored. Fewer candidates may be returned rather than padding with unrelated games.

## 2. Approve and collect

Approve every displayed candidate:

```http
POST /api/games/discover/collect
Content-Type: application/json

{"previewId":"uuid","approveAll":true}
```

Or approve a subset:

```json
{"previewId":"uuid","selectedSteamAppIds":[739630,1966720]}
```

Exactly one approval form is required. IDs must be unique and belong to the stored preview. The collector then retrieves Steam descriptions, USD prices, release dates, tags, global review totals, up to three recent English comments, IGDB enrichment, and available Gamalytic estimates. Every returned game includes `match:{source:"xai",reason,matchedTags,candidateIgdbId}`.

Approved games are not replaced silently. A failed approved game appears in `failures`, while successful games remain in the response. Direct AppID collection at `POST /api/games/collect` remains available and does not call Grok.

## Preview lifecycle

Ready previews expire after 30 minutes. When `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured, Upstash Redis shares previews across serverless instances. Atomic Lua transitions claim a preview during collection, release it after an unexpected failure, and consume it after a normal result. State changes preserve the original expiry, and concurrent claims or reuse are rejected.

Without Redis configuration, the single-process development fallback holds at most 100 previews in memory and evicts expired or oldest records. Use Redis for Vercel deployments; memory previews disappear on restart and cannot be shared across instances. Full game statistics are never stored in either preview backend.

Lifecycle errors use `PREVIEW_NOT_FOUND` (404), `PREVIEW_EXPIRED` (410), `PREVIEW_BUSY` or `PREVIEW_CONSUMED` (409), and `INVALID_SELECTION` (400). AI and discovery-provider failures return sanitized 503 responses. Every response uses `Cache-Control: no-store`.

## Configuration and verification

Set `XAI_API_KEY`, `IGDB_MCP_CLIENT_ID`, and `IGDB_MCP_CLIENT_SECRET` in root `.env.local`. `XAI_MODEL` defaults to `grok-4.6`. Structured xAI responses use `store:false`, a 45-second timeout, one bounded transient retry, and per-call output limits — 4,000 tokens for description validation and 16,000 for ranking, because a reasoning model's reasoning tokens share that ceiling.

`pnpm discovery:smoke` exits non-zero whenever `complete` is false, which now includes degraded-but-usable runs where selections or matched tags were dropped. Read the printed JSON rather than the exit code.

```bash
corepack pnpm discovery:smoke "multiplayer horror games"
corepack pnpm discovery:smoke --approve-all "multiplayer horror games"
```

The first command prints only the preview. The second also collects all approved data. Both use live providers and write no game files. Market analysis, sales-history charts, and frontend integration remain separate work.

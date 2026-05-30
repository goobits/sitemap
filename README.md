# @goobits/sitemap

Reusable sitemap building blocks for SvelteKit (and any modern Fetch-API runtime). Pure filter/sort + visibility logic, XML and `sitemap-index.xml` generators, plus an operations layer for search-engine pings and URL HEAD validation. Zero runtime dependencies; consumers wire up route discovery in their host app.

## TL;DR

- Add as a pnpm workspace git submodule and import from `@goobits/sitemap/core`, `/server`, `/ops`, `/sveltekit`, or `/ui`.
- Build a `RouteInventory` in your host app (via `scanSvelteKitRoutes` or `createRouteInventory`), then pass it to the XML builders.
- Use `createSitemapXmlHandler` and `createRobotsTxtHandler` for drop-in SvelteKit endpoints.
- Use `<SitemapPage>` from `@goobits/sitemap/ui` for a ready-made, themable human-facing sitemap page.

## Highlights

- **Generic route inventory:** `SitemapEntry` types cover both page and API routes; host supplies the data, package supplies the transformations
- **Filter / sort / visibility:** pure functions for human-facing sitemap UIs with audience-aware tag filtering (`public` vs `internal`)
- **XML generators:** `sitemap.xml` and `sitemap-index.xml` (for sites that shard past the 50k-URL limit)
- **Origin resolution:** 3-tier fallback: explicit `baseUrl` → request origin (non-localhost) → caller-supplied default
- **Search-engine pings:** `pingSearchEngines` notifies a caller-supplied list of endpoints, with timeout + retry + per-engine result reporting
- **URL validation:** `validateSitemapUrls` HEAD-checks a sampled URL list, surfaces 404s and timeouts, runs concurrent batches
- **No runtime dependencies:** uses `fetch` from `globalThis`; pure functions everywhere else
- **Pluggable logger:** `ops/*` accept a `Logger` interface; bring your own (Pino, Winston, console, or silent)
- **ESM-only, TypeScript-native:** subpath exports for tree-shaking; runs on Node 22+, Bun, Deno, Cloudflare Workers

## Requirements

- Node ≥22

## Usage

`@goobits/sitemap` is distributed as a **git submodule with TypeScript source**: no build step, no `dist/`, no npm package. Consume it from a workspace whose bundler (Vite, esbuild, SvelteKit, Bun, Deno, etc.) handles `.ts` natively.

### Why source-only?

The package is built for SvelteKit-style consumers whose bundlers already compile `.ts` end-to-end. Shipping a pre-built `dist/` adds a build/version-dance step that buys nothing. Source-level distribution keeps fixes one diff away in either direction, and the consumer's existing typecheck/test pipeline sees real types through the boundary rather than `.d.ts` reconstructions.

### pnpm workspace (recommended)

```bash
# from your consumer repo root:
git submodule add git@github.com:goobits/sitemap.git packages/sitemap
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

```jsonc
// your app's package.json
"dependencies": {
  "@goobits/sitemap": "workspace:*"
}
```

```bash
pnpm install
```

### Pinning a version

`workspace:*` always tracks the submodule's current HEAD. For production, pin the submodule to a tagged commit:

```bash
cd packages/sitemap && git checkout v0.2.0 && cd ../..
git add packages/sitemap && git commit -m "chore: pin @goobits/sitemap to v0.2.0"
```

### Syncing from upstream

```bash
git submodule update --remote packages/sitemap
git add packages/sitemap && git commit -m "chore: bump @goobits/sitemap"
```

## Mental model

The package owns the *transformations*. The host application owns the *route inventory* (and decides which paths are public, what category they belong to, when each one was last modified). You build a `RouteInventory` from your filesystem scan / content store / DB / whatever; you hand it to the package helpers; you get filtered groups, XML, validation results back.

| Package owns | Host owns |
|---|---|
| `SitemapEntry`, `RouteInventory` types | Filesystem route scanning, route categorization |
| Filter / sort / visibility logic | Audience matching (`public` / `internal` / `hidden`) |
| XML generation (`sitemap.xml`, `sitemap-index.xml`) | `lastModified` source (git log, mtime, content store) |
| Origin resolution | Page UI, brand copy, presentation |
| Search-engine ping orchestration | Change detection (DB / cron / webhook) |
| URL HEAD validation | URL sampling strategy |

## At a glance

```ts
// runtime-agnostic types + filtering
import { getFilteredSitemapGroups, getRouteTags } from '@goobits/sitemap/core'

// server-side XML + origin resolution
import { buildSitemapXml, resolveSiteOrigin, toAbsoluteUrl } from '@goobits/sitemap/server'

// server-side ops (network-dependent)
import { pingSearchEngines, validateSitemapUrls } from '@goobits/sitemap/ops'
```

The `core` and `server` surfaces are also re-exported from the root for convenience. `ops` is intentionally *not* in the barrel so consumers that only build XML don't pull `fetch`-coupled code into client bundles.

---

## Building `sitemap.xml`

```ts
// src/routes/sitemap.xml/+server.ts
import { buildSitemapXml, resolveSiteOrigin, getBaseUrl, getPlatformEnv } from '@goobits/sitemap/server'

export const GET = async ({ url, platform }) => {
  const origin = resolveSiteOrigin({
    baseUrl: getBaseUrl(getPlatformEnv(platform)),
    requestUrl: url,
    fallbackOrigin: 'https://example.com'
  })

  const routes = await collectPublicRoutes()   // your host code

  const xml = buildSitemapXml(origin, routes)

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' }
  })
}
```

## Multi-shard sitemaps (`sitemap-index.xml`)

When a single sitemap would exceed the 50k-URL / 50MB protocol cap, shard your URLs into multiple files and emit an index:

```ts
import { buildSitemapIndexXml, toAbsoluteUrl } from '@goobits/sitemap/server'

const shards = [
  { path: '/sitemap-pages.xml', lastModified: '2026-05-20T00:00:00Z' },
  { path: '/sitemap-users.xml', lastModified: '2026-05-20T12:00:00Z' },
  { path: '/sitemap-posts.xml', lastModified: '2026-05-20T12:30:00Z' }
]

const indexXml = buildSitemapIndexXml(
  shards.map((s) => ({ loc: toAbsoluteUrl(origin, s.path), lastModified: s.lastModified }))
)
```

## Filtering and grouping (for a human-facing `/sitemap` page)

```ts
import {
  getFilteredSitemapGroups,
  getFilteredSitemapCount,
  getSitemapAudiencesForVisibility,
  getSitemapAvailableTags,
  type RouteInventory,
  type HumanSitemapVisibility
} from '@goobits/sitemap/core'

const inventory: RouteInventory = await scanRoutes()   // your host code
const visibility: HumanSitemapVisibility = canSeeInternal ? 'internal' : 'public'

const audiences = getSitemapAudiencesForVisibility(visibility)
const visibleGrouped = Object.fromEntries(
  Object.entries(inventory.grouped)
    .map(([category, entries]) => [
      category,
      entries.filter((e) => audiences.includes(e.sitemap))
    ])
    .filter(([, entries]) => entries.length > 0)
)

const filtered = getFilteredSitemapGroups(visibleGrouped, query, selectedTags, 'path')
const total = getFilteredSitemapCount(filtered)
const availableTags = getSitemapAvailableTags(canSeeInternal)
```

## Search-engine pings

```ts
import { pingSearchEngines } from '@goobits/sitemap/ops'

const results = await pingSearchEngines('https://example.com/sitemap.xml', {
  engines: [
    // Modern: IndexNow (Bing, Yandex, others)
    { name: 'IndexNow', baseUrl: 'https://api.indexnow.org/indexnow?url=' }
    // Historical Bing endpoint (kept around but increasingly unreliable):
    // ...HISTORICAL_PING_ENDPOINTS
  ],
  timeoutMs: 8000,
  retry: { retries: 1, delayMs: 200 }
})

for (const result of results) {
  if (!result.success) console.warn(`Ping to ${result.engine} failed:`, result.error)
}
```

ℹ️ **A note on search-engine ping endpoints.** Google retired its public sitemap ping in 2023; Bing has signaled its endpoint may follow. The package ships *no* default engine list. You opt into the targets you actually want to notify. `HISTORICAL_PING_ENDPOINTS` is exported as a reference, not a default.

## URL HEAD validation

For periodic smoke-testing of your live sitemap (e.g., from a cron job after each sitemap regenerate):

```ts
import { validateSitemapUrls } from '@goobits/sitemap/ops'

const sample = pickRandomUrls(allSitemapUrls, 100)   // your host code
const { valid, invalid, errors } = await validateSitemapUrls(sample, {
  concurrency: 8,
  timeoutMs: 4000,
  maxErrors: 20
})

if (invalid > 0) {
  console.warn(`Sitemap has ${invalid} broken URLs (of ${valid + invalid} checked):`)
  errors.forEach((e) => console.warn(`  ${e}`))
}
```

The validator takes URLs directly. The host samples whatever set it wants to check (recent posts, random users, every static page, etc.).

## Ready-made page (Svelte 5)

If you want a working, themable sitemap page in one line, import the bundled `<SitemapPage>` component. The `data` prop is just the standard SvelteKit page-load shape. Provide `grouped` + `stats` from your route inventory:

```ts
// src/routes/sitemap/+page.server.ts
import { getPublicRouteInventory } from '$lib/server/sitemap-routes'
import type { PageServerLoad } from './$types'

export const prerender = true

export const load: PageServerLoad = async () => {
  const inventory = getPublicRouteInventory()   // your host code
  return {
    grouped: inventory.grouped,
    stats: inventory.stats
  }
}
```

```svelte
<!-- src/routes/sitemap/+page.svelte -->
<script lang="ts">
  import { SitemapPage } from '@goobits/sitemap/ui'
  let { data } = $props()
</script>

<SitemapPage {data} eyebrow="Sitemap" title="A map of" titleAccent="everything here" />
```

Built-in: hero (eyebrow + accent title + count pill), search, sort segmented control (Path / Name / Recent), tag-filter chips, collapsible categories with badges, per-route tag chips + last-modified date (mm/dd/yyyy), public/internal visibility toggle, empty state with a clear-filters CTA, mobile-responsive layout.

### Theming

Set any `--gb-sitemap-*` custom property on `:root`, a wrapping element via `:global(.parent)`, or inline `style`. They inherit normally through the cascade with no shadowing:

```css
:root {
  --gb-sitemap-accent: #6f5af0;
  --gb-sitemap-bg: #faf8f3;
  --gb-sitemap-card-bg: #fff;
  --gb-sitemap-radius: 0.75rem;
}
```

Full variable list:

| Variable | Default | Purpose |
|---|---|---|
| `--gb-sitemap-bg` | `transparent` | Page background + chip backgrounds |
| `--gb-sitemap-card-bg` | `rgba(0,0,0,0.025)` | Toolbar + group card backgrounds |
| `--gb-sitemap-card-bg-strong` | `color-mix(currentColor 6% / transparent)` | Active sort button background |
| `--gb-sitemap-text` | `currentColor` | Primary text |
| `--gb-sitemap-muted` | `color-mix(currentColor 55% / transparent)` | Secondary text (path, dates, badges) |
| `--gb-sitemap-accent` | `currentColor` | Title accent, active chip, link hover, signal dot |
| `--gb-sitemap-accent-dim` | derived from `--gb-sitemap-accent` (70%) | Eyebrow, chip hover border |
| `--gb-sitemap-secondary` | `color-mix(currentColor 70% / transparent)` | Secondary-tone category accent, Auth/Internal tag color |
| `--gb-sitemap-border` | `color-mix(currentColor 12% / transparent)` | All hairline borders |
| `--gb-sitemap-radius` | `0.625rem` | All rounded corners (scaled for sub-elements) |
| `--gb-sitemap-font` | `inherit` | Font family for the page |
| `--gb-sitemap-font-mono` | `ui-monospace, ...` | Font family for paths + dates |
| `--gb-sitemap-spacing` | `1rem` | Vertical rhythm multiplier |

### Per-category icons + tones

```svelte
<script lang="ts">
  import { Compass, Sparkles } from '@lucide/svelte'
  import { SitemapPage, type CategoryMeta } from '@goobits/sitemap/ui'
  let { data } = $props()

  const categoryMeta: Record<string, CategoryMeta> = {
    Main: { tone: 'primary' },
    Beta: { tone: 'secondary' }
  }
</script>

<SitemapPage {data} {categoryMeta} categoryOrder={['Main', 'Beta']}>
  {#snippet categoryHead(category)}
    {#if category === 'Main'}<Compass size={18} />
    {:else if category === 'Beta'}<Sparkles size={18} />
    {/if}
  {/snippet}
</SitemapPage>
```

`tone='secondary'` swaps the category's accent for `--gb-sitemap-secondary`, useful for visually distinguishing API/admin sections from main pages.

### Other snippet overrides

```svelte
<SitemapPage {data}>
  {#snippet hero({ stats })}
    <div class="my-hero">
      <h1>Everything we have</h1>
      <p>{stats.total} routes</p>
    </div>
  {/snippet}
  {#snippet empty()}
    <p>No matches. Try clearing your filters?</p>
  {/snippet}
</SitemapPage>
```

The component pulls Svelte as an *optional* peer, so consumers using only `/core`, `/server`, or `/ops` don't bundle it.

## Drop-in SvelteKit endpoints

Tired of writing the `sitemap.xml/+server.ts` boilerplate every site? The package ships handler factories:

```ts
// src/routes/sitemap.xml/+server.ts
import { createSitemapXmlHandler } from '@goobits/sitemap/sveltekit'
import { getPublicRouteInventory, FALLBACK_ORIGIN } from '$lib/server/sitemap-routes'

export const prerender = false

export const GET = createSitemapXmlHandler({
  fallbackOrigin: FALLBACK_ORIGIN,
  getRoutes: () => getPublicRouteInventory().routes
})
```

```ts
// src/routes/robots.txt/+server.ts
import { createRobotsTxtHandler } from '@goobits/sitemap/sveltekit'
import { FALLBACK_ORIGIN } from '$lib/server/sitemap-routes'

export const GET = createRobotsTxtHandler({
  fallbackOrigin: FALLBACK_ORIGIN,
  // Optional:
  // extraLines: ['Disallow: /admin/']
})
```

Both factories handle origin resolution (`PUBLIC_BASE_URL` → request → fallback), set sensible `application/xml` / `text/plain` + `cache-control: public, max-age=3600` headers, and never throw.

## Auto-scan filesystem routes (SvelteKit)

Hand-maintained route lists drift the moment someone adds a `+page.svelte` and forgets to update the sitemap. The package can derive the inventory from a Vite `import.meta.glob` result:

```ts
// src/lib/server/sitemap-routes.ts
import { scanSvelteKitRoutes } from '@goobits/sitemap/sveltekit'
import { createRouteInventory } from '@goobits/sitemap/core'

const pageGlob = import.meta.glob('/src/routes/**' + '/+page.svelte')
const serverGlob = import.meta.glob('/src/routes/**' + '/+page.server.{ts,js}')

const ENTRIES = scanSvelteKitRoutes(pageGlob, {
  serverGlob,
  category: (path) => {
    if (path.startsWith('/blog') || path.startsWith('/docs')) return 'Content'
    if (path.startsWith('/shop')) return 'Shop'
    if (path === '/sign-in' || path === '/sign-up') return 'Account'
    return 'Main'
  },
  exclude: (path, raw) =>
    raw.includes('(protected)') ||
    raw.includes('local-only') ||
    path === '/sitemap' ||
    path.includes('thank-you') ||
    /\[token\]|\[email\]/.test(raw),
  lastModified: () => '2026-05-21T00:00:00Z'   // or query git/content store
})

export function getPublicRouteInventory() {
  return createRouteInventory(ENTRIES)
}
```

Defaults: `Pages` category for everything, title-cased name from the last path segment, `1970-01-01` lastModified (visibly "unset"), dynamic-route templates (`[slug]`, `[...rest]`) are skipped. Route-group parens (`(company)`) are stripped automatically.

## Build the inventory by hand

If your routes don't fit the auto-scan pattern (e.g., they come from a CMS), the same `createRouteInventory()` works on a hand-built list:

```ts
import { createPageEntry, createRouteInventory } from '@goobits/sitemap/core'

const ENTRIES = [
  createPageEntry('/', 'Home', 'Main', '2026-05-21T00:00:00Z', { hasServerLoad: true }),
  createPageEntry('/about', 'About', 'Main', '2026-05-21T00:00:00Z')
]

export function getPublicRouteInventory() {
  return createRouteInventory(ENTRIES)
}
```

`createPageEntry` / `createApiEntry` fill in sensible defaults (public, static, non-dynamic, no auth) so you only specify what differs. `createRouteInventory` handles the grouping + stats computation.

## Entrypoints

| Subpath | What's exported |
|---|---|
| `@goobits/sitemap` | Barrel: re-exports `core` + `server` (NOT `ops`, `sveltekit`, or `ui`) |
| `@goobits/sitemap/core` | Types + filter/sort/visibility helpers + `createPageEntry` / `createApiEntry` / `createRouteInventory` builders. Runtime-agnostic. |
| `@goobits/sitemap/server` | XML builders + origin resolution. Pure, no network. |
| `@goobits/sitemap/ops` | `pingSearchEngines` + `validateSitemapUrls`. Server-side, `fetch`-dependent. |
| `@goobits/sitemap/sveltekit` | `createSitemapXmlHandler`, `createRobotsTxtHandler`, `scanSvelteKitRoutes`. Requires `@sveltejs/kit ^2`. |
| `@goobits/sitemap/ui` | `<SitemapPage>` themable Svelte 5 component. Requires `svelte ^5`. |

## Per-module runtime compatibility

| Module | Node ≥22 | Bun | Deno | Cloudflare Workers |
|---|---|---|---|---|
| `core` | ✅ | ✅ | ✅ | ✅ |
| `server` | ✅ | ✅ | ✅ | ✅ |
| `ops` | ✅ | ✅ | ✅ | ✅ (uses global `fetch`) |

All modules use only `globalThis.fetch` for network operations. None import from `node:fs`, `node:http`, `node:net`, or any other Node-only built-ins.

> Continuous integration exercises Node 22. Bun, Deno, and Cloudflare Workers are validated manually; if you hit a runtime-specific issue, please open an issue with the runtime version and a minimal repro.

## License

MIT. See [LICENSE](./LICENSE).

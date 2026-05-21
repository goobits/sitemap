# Changelog

All notable changes to `@goobits/sitemap` are documented here. The format adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-21

Adds drop-in SvelteKit endpoints, a filesystem-route auto-scanner, and `core` builders. No breaking changes from v0.1.0.

### Added — SvelteKit helpers

- `@goobits/sitemap/sveltekit` subpath (declared as optional `@sveltejs/kit ^2` peer)
- `createSitemapXmlHandler({ fallbackOrigin, getRoutes, cacheControl? })` — drop-in SvelteKit `RequestHandler` for `src/routes/sitemap.xml/+server.ts`. Resolves origin from `PUBLIC_BASE_URL` → request → fallback, builds XML from your route inventory, returns a `Response` with `application/xml` + 1-hour cache by default
- `createRobotsTxtHandler({ fallbackOrigin, sitemapPath?, extraLines?, cacheControl? })` — drop-in `RequestHandler` for `src/routes/robots.txt/+server.ts`. Emits `User-agent: * / Allow: / / Sitemap: <origin>/<path>` with optional `Disallow:` lines
- `scanSvelteKitRoutes(pageGlob, options?)` — derives a `SitemapEntry[]` from a Vite `import.meta.glob('/src/routes/**' + '/+page.svelte')` result. Strips route groups (`(company)`), excludes dynamic routes by default, marks `hasServerLoad` from an optional `serverGlob`, applies caller-supplied `category` / `name` / `lastModified` / `exclude` rules. Eliminates the drift problem of hand-maintained inventories

### Added — core builders

- `createPageEntry(path, name, category, lastModified, overrides?)` — builds a `PageRouteEntry` with sensible public/static defaults
- `createApiEntry(path, name, category, httpMethods, lastModified, overrides?)` — builds an `ApiRouteEntry`
- `groupRoutesByCategory(entries)` — groups by category, preserving first-occurrence order
- `computeRouteStats(entries)` — derives `{ total, pages, api, dynamic, ssr, protected }` counts
- `createRouteInventory(entries)` — one-call composition of routes + grouped + stats

### Tests

- 30 new vitest specs covering builders + SvelteKit scanner + SvelteKit handlers (96 total passing, up from 65)

## [0.1.0] - 2026-05-20

Initial public release.

### Added — UI (Svelte 5)

- `@goobits/sitemap/ui` subpath ships a themable `<SitemapPage>` Svelte 5 component
- Built-in: animated hero (eyebrow + title + accent + signal pill), search input with built-in magnifier icon, sort segmented control (Path / Name / Recent), tag-filter chip row (auto-shown when `getSitemapAvailableTags()` returns any), per-route tag chips (with accent colors for SSR/API and secondary tones for Auth/Internal), collapsible category sections with badges + chevron, per-category tone (`primary` / `secondary`) via `categoryMeta`, public/internal visibility toggle (auto-hidden unless `canViewInternalRoutes=true`), per-route last-modified dates with overridable `formatDate` prop (default `mm/dd/yyyy`), empty state with "Clear filters" CTA, mobile-responsive layout (rows stack below 36rem)
- Stable category ordering via `categoryOrder` prop; unknown categories sort alphabetically after the known ones
- Theming via CSS custom properties prefixed `--gb-sitemap-*` (`-bg`, `-card-bg`, `-card-bg-strong`, `-text`, `-muted`, `-accent`, `-accent-dim`, `-secondary`, `-border`, `-radius`, `-font`, `-font-mono`, `-spacing`) — inherit normally through the cascade; set on `:root`, a wrapping element via `:global(.parent)`, or inline `style`. No preprocessor required.
- Snippet props (`hero`, `categoryHead`, `empty`) for per-consumer overrides where pure CSS isn't enough — `categoryHead` receives the category name; dispatch on it to render different icons per category
- Exported types: `CategoryTone`, `CategoryMeta`, `SortOption`
- `svelte ^5` declared as optional peer (consumers using only `/core` / `/server` / `/ops` don't pay for it)
- `svelte-check` integrated into the package's `typecheck` script
- Full WAI-ARIA semantics: `role="radiogroup"` + `role="radio"` on the sort/visibility controls, `aria-pressed` on tag chips, `aria-expanded` on collapsible category headers, `aria-live="polite"` on counts, visually-hidden labels where needed

### Added — data layer

- ESM-only TypeScript-native package, distributed via git submodule (consumed as TS source by the host's bundler — no build step, no `dist/`)
- Subpath exports for each capability:
  - `@goobits/sitemap/core` — types + filter/sort/visibility helpers (runtime-agnostic)
  - `@goobits/sitemap/server` — XML builders + origin resolution (server-side, pure)
  - `@goobits/sitemap/ops` — search-engine pings + URL HEAD validation (server-side, `fetch`-dependent)
- `core` surface:
  - Types: `RouteInventory`, `SitemapEntry` (= `PageRouteEntry | ApiRouteEntry`), `SitemapAudience`, `HumanSitemapVisibility`, `SitemapSort`, `SitemapRoute`, `RouteInventoryStats`
  - Functions: `getFilteredSitemapGroups`, `getFilteredSitemapCount`, `getRouteTags`, `getSitemapAvailableTags`, `getSitemapAudiencesForVisibility`
  - Constants: `baseSitemapTags`, `internalSitemapTags`
- `server` surface:
  - `buildSitemapXml(origin, routes)` — flat `sitemap.xml`
  - `buildSitemapIndexXml(entries)` — `sitemap-index.xml` for multi-shard sites
  - `escapeXml`, `formatSitemapLastMod`, `toAbsoluteUrl` — primitives
  - `resolveSiteOrigin({ baseUrl, requestUrl, fallbackOrigin })` — 3-tier origin resolution
  - `getBaseUrl(platformEnv)`, `getPlatformEnv(platform)` — env reading
- `ops` surface:
  - `pingSearchEngines(sitemapUrl, { engines, timeoutMs, retry, logger })` — notify search engines on update, returns per-engine results, never throws
  - `validateSitemapUrls(urls, { timeoutMs, concurrency, maxErrors, logger })` — HEAD-check sample URLs, surface 404s and timeouts
  - `HISTORICAL_PING_ENDPOINTS` — explicit (non-default) reference list of the historical Bing ping endpoint; consumers opt in
- Pluggable logger pattern: `ops/ping` and `ops/validate` accept an optional `logger` (info/warn/error). No hard dependency on any logging library.
- Comprehensive test suite (vitest) covering XML output, URL canonicalization, filter/sort/visibility, ping/validate with mocked fetch
- Strict TypeScript (`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`) covering both `src/` and `tests/`

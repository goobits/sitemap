/**
 * @goobits/sitemap
 *
 * Reusable sitemap building blocks for SvelteKit (and any modern
 * Fetch-API runtime).
 *
 * Subpath exports are the preferred entry points — each module is
 * tree-shakeable and only pulls the dependencies it needs:
 *
 *   - `@goobits/sitemap/core`   — types + filter/sort/visibility (anywhere)
 *   - `@goobits/sitemap/server` — XML builders + origin resolution (server)
 *   - `@goobits/sitemap/ops`    — search-engine pings + URL validation (server)
 *   - `@goobits/sitemap/ui`     — themable Svelte 5 `<SitemapPage>` component (consumer-side)
 *
 * The barrel below re-exports the framework-agnostic data surface
 * (core + server). `ops` is excluded so consumers who only build XML
 * don't pull `fetch`-dependent code into client bundles. `ui` is
 * excluded because it pulls Svelte; consumers opt in explicitly.
 *
 * @module @goobits/sitemap
 */

export * from './core.ts'
export * from './server.ts'

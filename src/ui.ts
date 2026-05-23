/**
 * Ready-made Svelte 5 UI for `@goobits/sitemap`. Pair with the data layer
 * (`/core` for filter/sort helpers, `/server` for XML) to ship a working,
 * themable sitemap page in a single Svelte component.
 *
 * Theming is entirely via CSS custom properties prefixed `--gb-sitemap-*`
 * — no Sass dependency, no preprocessor required. Set them on `:root`,
 * a wrapping element via `:global(.parent)`, or inline `style` — they
 * inherit normally through the cascade.
 *
 * Requires `svelte ^5` at the consumer level (declared as an optional
 * peer; consumers who only use `/core`, `/server`, or `/ops` don't pay
 * for it).
 *
 * @module @goobits/sitemap/ui
 */

export { default as SitemapPage } from './ui/SitemapPage.svelte'
export type { CategoryMeta, CategoryTone, SortOption } from './ui/types.ts'

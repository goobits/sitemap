/**
 * Type definitions for the `<SitemapPage>` Svelte component. Lifted into
 * a sibling `.ts` so consumers can import them with plain `tsc` without
 * needing the Svelte language plugin.
 *
 * @module @goobits/sitemap/ui
 */

import type { SitemapSort } from '../core.ts'

/** Visual tone for a category section. */
export type CategoryTone = 'primary' | 'secondary'

/** Per-category visual metadata. */
export type CategoryMeta = {
	tone?: CategoryTone
}

/** A single option in the sort segmented control. */
export type SortOption = { value: SitemapSort; label: string }

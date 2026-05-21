/**
 * Generic sitemap types. These describe a project's route inventory and the
 * shape of entries that flow through the filter, sort, and XML pipelines.
 *
 * The host application is responsible for producing a `RouteInventory` (via
 * its own filesystem scanning, content-store query, etc.) and handing it to
 * the package helpers.
 *
 * @module @goobits/sitemap/core
 */

/** Audience controlling visibility of a sitemap entry. */
export type SitemapAudience = 'public' | 'internal' | 'hidden'

/** Visibility filter applied to a human-facing sitemap view. */
export type HumanSitemapVisibility = 'public' | 'internal'

/** Sort order for a sitemap listing. */
export type SitemapSort = 'path' | 'name' | 'modified'

/** Sitemap entry for a UI/page route (renders HTML). */
export type PageRouteEntry = {
	path: string
	name: string
	type: 'page'
	hasServerLoad: boolean
	hasClientLoad: boolean
	hasLayout: boolean
	isDynamic: boolean
	hasAuth: boolean
	isNoIndex: boolean
	sitemap: SitemapAudience
	lastModified: string
	category: string
}

/** Sitemap entry for an API route (HTTP handler only). */
export type ApiRouteEntry = {
	path: string
	name: string
	type: 'api'
	httpMethods: string[]
	isDynamic: boolean
	sitemap: SitemapAudience
	lastModified: string
	category: string
}

/** Union of all sitemap entry shapes. */
export type SitemapEntry = PageRouteEntry | ApiRouteEntry

/** Summary counts the host can show in admin dashboards. */
export type RouteInventoryStats = {
	total: number
	pages: number
	api: number
	dynamic: number
	ssr: number
	protected: number
}

/** Aggregated host-supplied route inventory. */
export type RouteInventory = {
	routes: SitemapEntry[]
	grouped: Record<string, SitemapEntry[]>
	stats: RouteInventoryStats
}

/** Sitemap `<changefreq>` values per the sitemaps.org spec. */
export type SitemapChangeFreq =
	| 'always'
	| 'hourly'
	| 'daily'
	| 'weekly'
	| 'monthly'
	| 'yearly'
	| 'never'

/**
 * Minimal record needed to render a single `<url>` element.
 *
 * `changefreq` and `priority` are part of the sitemap spec but are now
 * largely ignored by major crawlers (Google explicitly says it doesn't
 * use them). They're supported as optional fields for consumers that
 * still emit them.
 */
export type SitemapRoute = {
	path: string
	lastModified: string
	changefreq?: SitemapChangeFreq
	/** A value in `[0.0, 1.0]`. Default per spec is `0.5`. */
	priority?: number
}

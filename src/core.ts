/**
 * Runtime-agnostic surface: types, filter/sort, audience mapping. Safe to
 * import from any module (server, client, edge, build script).
 *
 * @module @goobits/sitemap/core
 */

export type {
	ApiRouteEntry,
	HumanSitemapVisibility,
	PageRouteEntry,
	RouteInventory,
	RouteInventoryStats,
	SitemapAudience,
	SitemapEntry,
	SitemapRoute,
	SitemapSort
} from './core/types.js'

export {
	baseSitemapTags,
	getFilteredSitemapCount,
	getFilteredSitemapGroups,
	getRouteTags,
	getSitemapAudiencesForVisibility,
	getSitemapAvailableTags,
	internalSitemapTags
} from './core/viewmodel.js'

export {
	type ApiEntryOverrides,
	type PageEntryOverrides,
	computeRouteStats,
	createApiEntry,
	createPageEntry,
	createRouteInventory,
	groupRoutesByCategory
} from './core/builders.js'

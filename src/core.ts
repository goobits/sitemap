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
	RouteChannel,
	RouteChannelPolicy,
	RouteChannelPolicyIssues,
	RouteChannelTags,
	RouteInventory,
	RouteInventoryStats,
	SitemapAudience,
	SitemapChangeFreq,
	SitemapEntry,
	SitemapRoute,
	SitemapSort
} from './core/types.ts'

export {
	baseSitemapTags,
	getFilteredSitemapCount,
	getFilteredSitemapGroups,
	getRouteTags,
	getSitemapAudiencesForVisibility,
	getSitemapAvailableTags,
	internalSitemapTags
} from './core/viewmodel.ts'

export {
	type ApiEntryOverrides,
	type PageEntryOverrides,
	computeRouteStats,
	createApiEntry,
	createPageEntry,
	createRouteInventory,
	groupRoutesByCategory
} from './core/builders.ts'

export {
	type RouteChannelPolicyCheckOptions,
	type RouteChannelRouteType,
	checkRouteChannelPolicy,
	filterEntriesForRouteChannel,
	getRouteChannelTags,
	isRouteInChannel,
	normalizeRouteChannel
} from './core/channels.ts'

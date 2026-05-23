/**
 * Pure functions for filtering, sorting, and audience-tagging route entries.
 * All exports here are framework-agnostic and runtime-agnostic — they take
 * data in, give data out, and never reach for `process`, `fetch`, or
 * `globalThis`.
 *
 * @module @goobits/sitemap/core
 */

import type { HumanSitemapVisibility, SitemapAudience, SitemapEntry, SitemapSort } from './types.ts'

function localeSort(a: string, b: string) {
	return a.localeCompare(b)
}

function normalizeQuery(value: string) {
	return value.trim().toLowerCase()
}

function matchesQuery(query: string, values: string[]) {
	if (!query) return true
	return values.some((value) => value.toLowerCase().includes(query))
}

/** Tags surfaced to anonymous viewers. */
export const baseSitemapTags = [ 'SSR', 'CSR', 'Dynamic', 'Layout' ] as const

/** Tags surfaced to viewers with internal-routes permission. */
export const internalSitemapTags = [ 'SSR', 'CSR', 'Dynamic', 'Auth', 'NoIndex', 'API', 'Layout', 'Internal' ] as const

/** Returns the tag set a viewer should see based on their permission level. */
export function getSitemapAvailableTags(canViewInternalRoutes: boolean) {
	return canViewInternalRoutes ? [ ...internalSitemapTags ] : [ ...baseSitemapTags ]
}

/** Derives the tag list for a single route entry. */
export function getRouteTags(route: SitemapEntry) {
	const tags: string[] = []
	if (route.type === 'api') tags.push('API')
	if (route.type === 'page' && route.hasServerLoad) tags.push('SSR')
	if (route.type === 'page' && route.hasClientLoad) tags.push('CSR')
	if (route.isDynamic) tags.push('Dynamic')
	if (route.type === 'page' && route.hasAuth) tags.push('Auth')
	if (route.type === 'page' && route.isNoIndex) tags.push('NoIndex')
	if (route.type === 'page' && route.hasLayout) tags.push('Layout')
	if (route.sitemap === 'internal') tags.push('Internal')
	return tags
}

function sortRoutes(routes: SitemapEntry[], sortBy: SitemapSort) {
	return [ ...routes ].sort((a, b) => {
		switch (sortBy) {
			case 'name':
				return localeSort(a.name, b.name)
			case 'modified':
				return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
			case 'path':
			default:
				return localeSort(a.path, b.path)
		}
	})
}

function matchesSitemapFilters(route: SitemapEntry, query: string, selectedTags: string[]) {
	if (!matchesQuery(query, [ route.path, route.name ])) return false
	if (selectedTags.length === 0) return true
	const tags = getRouteTags(route)
	return selectedTags.every((tag) => tags.includes(tag))
}

/**
 * Filter and sort the host-supplied grouped routes for display.
 *
 * Returns a new mapping with empty groups dropped. Sort order is applied per
 * group; the caller decides the order of groups in the UI (via
 * `Object.keys()` order of the input mapping).
 */
export function getFilteredSitemapGroups(
	grouped: Record<string, SitemapEntry[]>,
	searchQuery: string,
	selectedTags: string[],
	sortBy: SitemapSort
) {
	const query = normalizeQuery(searchQuery)
	const result: Record<string, SitemapEntry[]> = {}

	for (const [ category, routes ] of Object.entries(grouped)) {
		const filtered = routes.filter((route) => matchesSitemapFilters(route, query, selectedTags))
		if (filtered.length > 0) {
			result[category] = sortRoutes(filtered, sortBy)
		}
	}

	return result
}

/** Sum of entries across all groups in a filtered mapping. */
export function getFilteredSitemapCount(grouped: Record<string, SitemapEntry[]>) {
	return Object.values(grouped).reduce((sum, routes) => sum + routes.length, 0)
}

/**
 * Returns the audience list a `HumanSitemapVisibility` choice expands to.
 * Internal viewers always see public routes too; the inverse is never true.
 */
export function getSitemapAudiencesForVisibility(visibility: HumanSitemapVisibility): SitemapAudience[] {
	return visibility === 'internal' ? [ 'public', 'internal' ] : [ 'public' ]
}

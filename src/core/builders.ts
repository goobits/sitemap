/**
 * Builders for `SitemapEntry` and `RouteInventory`. Hand-written route
 * inventories tend to grow boilerplate quickly — these helpers cut the
 * per-consumer code in half without giving up the "host owns the list"
 * boundary.
 *
 * @module @goobits/sitemap/core
 */

import type {
	ApiRouteEntry,
	PageRouteEntry,
	RouteInventory,
	RouteInventoryStats,
	SitemapEntry
} from './types.ts'

/** Optional overrides for the metadata flags on a page entry. */
export interface PageEntryOverrides {
	hasServerLoad?: boolean
	hasClientLoad?: boolean
	hasLayout?: boolean
	isDynamic?: boolean
	hasAuth?: boolean
	isNoIndex?: boolean
	sitemap?: PageRouteEntry['sitemap']
}

/** Optional overrides for the metadata flags on an API entry. */
export interface ApiEntryOverrides {
	isDynamic?: boolean
	sitemap?: ApiRouteEntry['sitemap']
}

/**
 * Build a `PageRouteEntry` with sensible defaults. The required fields are
 * the path, display name, category, and last-modified timestamp; everything
 * else defaults to a public, static page with no SSR / no layout / no auth.
 */
export function createPageEntry(
	path: string,
	name: string,
	category: string,
	lastModified: string,
	overrides: PageEntryOverrides = {}
): PageRouteEntry {
	return {
		path,
		name,
		type: 'page',
		hasServerLoad: overrides.hasServerLoad ?? false,
		hasClientLoad: overrides.hasClientLoad ?? false,
		hasLayout: overrides.hasLayout ?? false,
		isDynamic: overrides.isDynamic ?? false,
		hasAuth: overrides.hasAuth ?? false,
		isNoIndex: overrides.isNoIndex ?? false,
		sitemap: overrides.sitemap ?? 'public',
		lastModified,
		category
	}
}

/**
 * Build an `ApiRouteEntry` with sensible defaults. The required fields are
 * the path, display name, category, supported HTTP methods, and
 * last-modified timestamp.
 */
export function createApiEntry(
	path: string,
	name: string,
	category: string,
	httpMethods: string[],
	lastModified: string,
	overrides: ApiEntryOverrides = {}
): ApiRouteEntry {
	return {
		path,
		name,
		type: 'api',
		httpMethods,
		isDynamic: overrides.isDynamic ?? false,
		sitemap: overrides.sitemap ?? 'public',
		lastModified,
		category
	}
}

/**
 * Group entries by their `category` field, preserving the iteration order
 * of first-occurrence. Each category's entries appear in the order they
 * were passed in.
 */
export function groupRoutesByCategory(entries: SitemapEntry[]): Record<string, SitemapEntry[]> {
	const out: Record<string, SitemapEntry[]> = {}
	for (const entry of entries) {
		const list = out[entry.category] ?? []
		list.push(entry)
		out[entry.category] = list
	}
	return out
}

/** Compute summary counts (`total`, `pages`, `api`, `dynamic`, `ssr`, `protected`). */
export function computeRouteStats(entries: SitemapEntry[]): RouteInventoryStats {
	let pages = 0
	let api = 0
	let dynamic = 0
	let ssr = 0
	let protectedCount = 0
	for (const entry of entries) {
		if (entry.type === 'page') {
			pages++
			if (entry.hasServerLoad) ssr++
			if (entry.hasAuth) protectedCount++
		} else if (entry.type === 'api') {
			api++
		}
		if (entry.isDynamic) dynamic++
	}
	return { total: entries.length, pages, api, dynamic, ssr, protected: protectedCount }
}

/**
 * Compose entries into a `RouteInventory` (the shape consumed by the
 * `<SitemapPage>` UI and the package's filter/sort helpers).
 *
 * @example
 * ```ts
 * import { createPageEntry, createRouteInventory } from '@goobits/sitemap/core'
 *
 * const inventory = createRouteInventory([
 *   createPageEntry('/', 'Home', 'Main', '2026-05-21T00:00:00Z'),
 *   createPageEntry('/about', 'About', 'Main', '2026-05-21T00:00:00Z')
 * ])
 * ```
 */
export function createRouteInventory(entries: SitemapEntry[]): RouteInventory {
	return {
		routes: entries,
		grouped: groupRoutesByCategory(entries),
		stats: computeRouteStats(entries)
	}
}

import { describe, expect, it } from 'vitest'

import {
	baseSitemapTags,
	getFilteredSitemapCount,
	getFilteredSitemapGroups,
	getRouteTags,
	getSitemapAudiencesForVisibility,
	getSitemapAvailableTags,
	internalSitemapTags
} from '../src/core/viewmodel.js'
import type { SitemapEntry } from '../src/core/types.js'

function makePage(overrides: Partial<Extract<SitemapEntry, { type: 'page' }>> = {}): SitemapEntry {
	return {
		path: '/',
		name: 'Home',
		type: 'page',
		hasServerLoad: false,
		hasClientLoad: false,
		hasLayout: false,
		isDynamic: false,
		hasAuth: false,
		isNoIndex: false,
		sitemap: 'public',
		lastModified: '2026-01-01T00:00:00Z',
		category: 'Pages',
		...overrides
	}
}

function makeApi(overrides: Partial<Extract<SitemapEntry, { type: 'api' }>> = {}): SitemapEntry {
	return {
		path: '/api/health',
		name: 'Health',
		type: 'api',
		httpMethods: [ 'GET' ],
		isDynamic: false,
		sitemap: 'public',
		lastModified: '2026-01-01T00:00:00Z',
		category: 'API',
		...overrides
	}
}

describe('getRouteTags', () => {
	it('flags api routes with API', () => {
		expect(getRouteTags(makeApi())).toContain('API')
	})

	it('flags pages with SSR/CSR/Layout', () => {
		const route = makePage({ hasServerLoad: true, hasClientLoad: true, hasLayout: true })
		expect(getRouteTags(route)).toEqual(expect.arrayContaining([ 'SSR', 'CSR', 'Layout' ]))
	})

	it('flags dynamic routes regardless of type', () => {
		expect(getRouteTags(makePage({ isDynamic: true }))).toContain('Dynamic')
		expect(getRouteTags(makeApi({ isDynamic: true }))).toContain('Dynamic')
	})

	it('flags internal audience with Internal tag', () => {
		expect(getRouteTags(makePage({ sitemap: 'internal' }))).toContain('Internal')
	})

	it('flags pages with hasAuth and isNoIndex', () => {
		const route = makePage({ hasAuth: true, isNoIndex: true })
		expect(getRouteTags(route)).toEqual(expect.arrayContaining([ 'Auth', 'NoIndex' ]))
	})

	it('does not flag api routes with hasAuth / isNoIndex (those are page-only)', () => {
		// hasAuth/isNoIndex don't exist on api routes — make sure code uses the
		// type discriminant correctly and doesn't crash on missing properties.
		expect(() => getRouteTags(makeApi())).not.toThrow()
		expect(getRouteTags(makeApi())).not.toContain('Auth')
		expect(getRouteTags(makeApi())).not.toContain('NoIndex')
	})
})

describe('getSitemapAvailableTags', () => {
	it('returns base tags for anonymous viewers', () => {
		expect(getSitemapAvailableTags(false)).toEqual([ ...baseSitemapTags ])
	})

	it('returns internal tags when canViewInternalRoutes is true', () => {
		expect(getSitemapAvailableTags(true)).toEqual([ ...internalSitemapTags ])
	})

	it('returns a fresh array each call (does not leak refs to the freezable consts)', () => {
		const first = getSitemapAvailableTags(true)
		first.pop()
		expect(getSitemapAvailableTags(true)).toEqual([ ...internalSitemapTags ])
	})
})

describe('getSitemapAudiencesForVisibility', () => {
	it('expands public to just public', () => {
		expect(getSitemapAudiencesForVisibility('public')).toEqual([ 'public' ])
	})

	it('expands internal to public + internal', () => {
		expect(getSitemapAudiencesForVisibility('internal')).toEqual([ 'public', 'internal' ])
	})
})

describe('getFilteredSitemapGroups', () => {
	const grouped = {
		Pages: [
			makePage({ path: '/', name: 'Home' }),
			makePage({ path: '/about', name: 'About', hasServerLoad: true })
		],
		API: [ makeApi({ path: '/api/health', name: 'Health' }) ]
	}

	it('returns all groups when no filters applied', () => {
		const result = getFilteredSitemapGroups(grouped, '', [], 'path')
		expect(Object.keys(result)).toEqual([ 'Pages', 'API' ])
		expect(result['Pages']).toHaveLength(2)
	})

	it('drops empty groups after filtering', () => {
		const result = getFilteredSitemapGroups(grouped, '', [ 'API' ], 'path')
		expect(Object.keys(result)).toEqual([ 'API' ])
	})

	it('matches search query against path AND name (case-insensitive)', () => {
		const result = getFilteredSitemapGroups(grouped, 'ABOUT', [], 'path')
		expect(result['Pages']).toHaveLength(1)
		expect(result['Pages']?.[0]?.path).toBe('/about')
	})

	it('applies sort by name', () => {
		const result = getFilteredSitemapGroups(grouped, '', [], 'name')
		expect(result['Pages']?.map((r) => r.name)).toEqual([ 'About', 'Home' ])
	})

	it('applies sort by modified (newest first)', () => {
		const groupedByDate = {
			Pages: [
				makePage({ path: '/a', lastModified: '2026-01-01T00:00:00Z' }),
				makePage({ path: '/b', lastModified: '2026-05-01T00:00:00Z' }),
				makePage({ path: '/c', lastModified: '2025-12-01T00:00:00Z' })
			]
		}
		const result = getFilteredSitemapGroups(groupedByDate, '', [], 'modified')
		expect(result['Pages']?.map((r) => r.path)).toEqual([ '/b', '/a', '/c' ])
	})

	it('requires ALL selected tags to match (AND semantics)', () => {
		const g = {
			Pages: [
				makePage({ path: '/a', hasServerLoad: true, isDynamic: true }),
				makePage({ path: '/b', hasServerLoad: true }),
				makePage({ path: '/c', isDynamic: true })
			]
		}
		const result = getFilteredSitemapGroups(g, '', [ 'SSR', 'Dynamic' ], 'path')
		expect(result['Pages']).toHaveLength(1)
		expect(result['Pages']?.[0]?.path).toBe('/a')
	})
})

describe('getFilteredSitemapCount', () => {
	it('sums entries across all groups', () => {
		const grouped = {
			Pages: [ makePage(), makePage() ],
			API: [ makeApi() ]
		}
		expect(getFilteredSitemapCount(grouped)).toBe(3)
	})

	it('returns 0 for empty input', () => {
		expect(getFilteredSitemapCount({})).toBe(0)
	})
})

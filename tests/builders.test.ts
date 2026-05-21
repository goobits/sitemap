import { describe, expect, it } from 'vitest'

import {
	computeRouteStats,
	createApiEntry,
	createPageEntry,
	createRouteInventory,
	groupRoutesByCategory
} from '../src/core/builders.js'

const TS = '2026-05-21T00:00:00Z'

describe('createPageEntry', () => {
	it('builds a sensible default page entry', () => {
		const entry = createPageEntry('/about', 'About', 'Main', TS)
		expect(entry).toEqual({
			path: '/about',
			name: 'About',
			type: 'page',
			hasServerLoad: false,
			hasClientLoad: false,
			hasLayout: false,
			isDynamic: false,
			hasAuth: false,
			isNoIndex: false,
			sitemap: 'public',
			lastModified: TS,
			category: 'Main'
		})
	})

	it('honors overrides', () => {
		const entry = createPageEntry('/', 'Home', 'Main', TS, {
			hasServerLoad: true,
			hasLayout: true,
			sitemap: 'internal'
		})
		expect(entry.hasServerLoad).toBe(true)
		expect(entry.hasLayout).toBe(true)
		expect(entry.sitemap).toBe('internal')
	})
})

describe('createApiEntry', () => {
	it('builds a sensible default api entry', () => {
		const entry = createApiEntry('/api/health', 'Health', 'API', [ 'GET' ], TS)
		expect(entry).toEqual({
			path: '/api/health',
			name: 'Health',
			type: 'api',
			httpMethods: [ 'GET' ],
			isDynamic: false,
			sitemap: 'public',
			lastModified: TS,
			category: 'API'
		})
	})

	it('honors overrides', () => {
		const entry = createApiEntry('/api/users/[id]', 'User', 'API', [ 'GET', 'PATCH' ], TS, {
			isDynamic: true,
			sitemap: 'internal'
		})
		expect(entry.isDynamic).toBe(true)
		expect(entry.sitemap).toBe('internal')
		expect(entry.httpMethods).toEqual([ 'GET', 'PATCH' ])
	})
})

describe('groupRoutesByCategory', () => {
	it('groups entries by category preserving first-occurrence order', () => {
		const entries = [
			createPageEntry('/', 'Home', 'Main', TS),
			createPageEntry('/about', 'About', 'Main', TS),
			createApiEntry('/api/health', 'Health', 'API', [ 'GET' ], TS),
			createPageEntry('/contact', 'Contact', 'Main', TS)
		]
		const grouped = groupRoutesByCategory(entries)
		expect(Object.keys(grouped)).toEqual([ 'Main', 'API' ])
		expect(grouped['Main']).toHaveLength(3)
		expect(grouped['API']).toHaveLength(1)
	})

	it('returns an empty object for empty input', () => {
		expect(groupRoutesByCategory([])).toEqual({})
	})
})

describe('computeRouteStats', () => {
	it('counts pages, api, dynamic, ssr, protected correctly', () => {
		const entries = [
			createPageEntry('/', 'Home', 'Main', TS, { hasServerLoad: true }),
			createPageEntry('/about', 'About', 'Main', TS),
			createPageEntry('/account', 'Account', 'Main', TS, { hasAuth: true, hasServerLoad: true }),
			createPageEntry('/posts/[slug]', 'Post', 'Content', TS, { isDynamic: true }),
			createApiEntry('/api/health', 'Health', 'API', [ 'GET' ], TS),
			createApiEntry('/api/users/[id]', 'User', 'API', [ 'GET' ], TS, { isDynamic: true })
		]
		const stats = computeRouteStats(entries)
		expect(stats.total).toBe(6)
		expect(stats.pages).toBe(4)
		expect(stats.api).toBe(2)
		expect(stats.dynamic).toBe(2)
		expect(stats.ssr).toBe(2)
		expect(stats.protected).toBe(1)
	})

	it('returns zeros for empty input', () => {
		expect(computeRouteStats([])).toEqual({
			total: 0, pages: 0, api: 0, dynamic: 0, ssr: 0, protected: 0
		})
	})
})

describe('createRouteInventory', () => {
	it('composes routes + grouped + stats in one call', () => {
		const entries = [
			createPageEntry('/', 'Home', 'Main', TS, { hasServerLoad: true }),
			createPageEntry('/about', 'About', 'Main', TS)
		]
		const inventory = createRouteInventory(entries)
		expect(inventory.routes).toBe(entries)
		expect(inventory.grouped['Main']).toHaveLength(2)
		expect(inventory.stats.total).toBe(2)
		expect(inventory.stats.ssr).toBe(1)
	})
})

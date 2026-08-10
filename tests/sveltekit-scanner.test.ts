import { describe, expect, it } from 'vitest'

import { scanSvelteKitRoutes } from '../src/sveltekit/scanner.js'

const TS = '2026-05-21T00:00:00Z'

const mockGlob = (paths: string[]): Record<string, unknown> =>
	Object.fromEntries(paths.map((path) => [path, () => Promise.resolve({})]))

describe('scanSvelteKitRoutes', () => {
	it('derives deterministic static routes and baseline metadata from page globs', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([
				'/src/routes/zebra/+page.svelte',
				'/src/routes/+page.svelte',
				'/src/routes/(company)/about/+page.svelte',
				'/src/routes/blog/[slug]/+page.svelte'
			])
		)

		expect(entries.map((entry) => entry.path)).toEqual(['/', '/about', '/zebra'])
		expect(entries[0]).toMatchObject({
			path: '/',
			name: 'Home',
			type: 'page',
			hasServerLoad: false,
			hasClientLoad: false,
			hasLayout: false,
			isDynamic: false,
			hasAuth: false,
			isNoIndex: false,
			sitemap: 'public'
		})
	})

	it('derives readable default names', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([
				'/src/routes/+page.svelte',
				'/src/routes/about/+page.svelte',
				'/src/routes/beta/audio-recorder/+page.svelte',
				'/src/routes/(company)/privacy-policy/+page.svelte'
			])
		)
		const names = Object.fromEntries(entries.map((entry) => [entry.path, entry.name]))

		expect(names).toEqual({
			'/': 'Home',
			'/about': 'About',
			'/beta/audio-recorder': 'Audio Recorder',
			'/privacy-policy': 'Privacy Policy'
		})
	})

	it('includes dynamic templates only when requested', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob(['/src/routes/blog/+page.svelte', '/src/routes/blog/[year]/+page.svelte']),
			{ skipDynamic: false }
		)

		expect(entries).toHaveLength(2)
		expect(entries.find((entry) => entry.path === '/blog/[year]')?.isDynamic).toBe(true)
	})

	it('applies consumer exclusion, category, and name policy', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([
				'/src/routes/+page.svelte',
				'/src/routes/(protected)/account/+page.svelte',
				'/src/routes/blog/+page.svelte',
				'/src/routes/shop/+page.svelte',
				'/src/routes/sitemap/+page.svelte'
			]),
			{
				exclude: (path, raw) => raw.includes('(protected)') || path === '/sitemap',
				category: (path) => {
					if (path.startsWith('/blog')) return 'Content'
					if (path.startsWith('/shop')) return 'Shop'
					return 'Main'
				},
				name: (path) => (path === '/shop' ? 'Store' : path)
			}
		)

		expect(entries.map(({ path, name, category }) => ({ path, name, category }))).toEqual([
			{ path: '/', name: '/', category: 'Main' },
			{ path: '/blog', name: '/blog', category: 'Content' },
			{ path: '/shop', name: 'Store', category: 'Shop' }
		])
	})

	it('marks sibling server, universal, and local layout modules', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([
				'/src/routes/+page.svelte',
				'/src/routes/blog/+page.svelte',
				'/src/routes/docs/+page.svelte'
			]),
			{
				serverGlob: mockGlob(['/src/routes/blog/+page.server.ts', '/src/routes/+layout.server.ts']),
				clientGlob: mockGlob(['/src/routes/blog/+page.ts']),
				layoutGlob: mockGlob(['/src/routes/docs/+layout.svelte'])
			}
		)

		expect(entries.find((entry) => entry.path === '/')).toMatchObject({
			hasServerLoad: false,
			hasClientLoad: false,
			hasLayout: false
		})
		expect(entries.find((entry) => entry.path === '/blog')).toMatchObject({
			hasServerLoad: true,
			hasClientLoad: true,
			hasLayout: false
		})
		expect(entries.find((entry) => entry.path === '/docs')).toMatchObject({
			hasServerLoad: false,
			hasClientLoad: false,
			hasLayout: true
		})
	})

	it('matches sibling modules through route groups', () => {
		const entries = scanSvelteKitRoutes(mockGlob(['/src/routes/(company)/about/+page.svelte']), {
			serverGlob: mockGlob(['/src/routes/(company)/about/+page.server.ts'])
		})

		expect(entries[0]?.hasServerLoad).toBe(true)
	})

	it('lets consumer flags override inferred route metadata', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob(['/src/routes/account/+page.svelte', '/src/routes/internal/+page.svelte']),
			{
				clientGlob: mockGlob(['/src/routes/account/+page.ts']),
				flags: (path) =>
					path === '/account'
						? { hasAuth: true, hasClientLoad: false }
						: { sitemap: 'internal', isNoIndex: true }
			}
		)

		expect(entries.find((entry) => entry.path === '/account')).toMatchObject({
			hasAuth: true,
			hasClientLoad: false,
			sitemap: 'public'
		})
		expect(entries.find((entry) => entry.path === '/internal')).toMatchObject({
			isNoIndex: true,
			sitemap: 'internal'
		})
	})

	it('supports custom route roots and modification dates', () => {
		const entries = scanSvelteKitRoutes(mockGlob(['/apps/web/src/routes/about/+page.svelte']), {
			rootPrefix: '/apps/web/src/routes',
			lastModified: () => TS
		})

		expect(entries[0]).toMatchObject({ path: '/about', lastModified: TS })
	})

	it('returns an empty inventory for an empty glob', () => {
		expect(scanSvelteKitRoutes({})).toEqual([])
	})
})

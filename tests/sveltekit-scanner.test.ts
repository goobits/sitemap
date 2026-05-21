import { describe, expect, it } from 'vitest'

import { scanSvelteKitRoutes } from '../src/sveltekit/scanner.js'

const TS = '2026-05-21T00:00:00Z'

function mockGlob(paths: string[]): Record<string, unknown> {
	return Object.fromEntries(paths.map((p) => [ p, () => Promise.resolve({}) ]))
}

describe('scanSvelteKitRoutes', () => {
	it('strips /src/routes prefix and /+page.svelte suffix', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/+page.svelte',
			'/src/routes/about/+page.svelte',
			'/src/routes/beta/audio-recorder/+page.svelte'
		]))
		const paths = entries.map((e) => e.path).sort()
		expect(paths).toEqual([ '/', '/about', '/beta/audio-recorder' ])
	})

	it('strips route-group parens', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/(company)/about/+page.svelte',
			'/src/routes/(auth)/sign-in/+page.svelte'
		]))
		const paths = entries.map((e) => e.path).sort()
		expect(paths).toEqual([ '/about', '/sign-in' ])
	})

	it('derives sensible default names', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/+page.svelte',
			'/src/routes/about/+page.svelte',
			'/src/routes/beta/audio-recorder/+page.svelte',
			'/src/routes/(company)/privacy-policy/+page.svelte'
		]))
		const byPath = Object.fromEntries(entries.map((e) => [ e.path, e.name ]))
		expect(byPath['/']).toBe('Home')
		expect(byPath['/about']).toBe('About')
		expect(byPath['/beta/audio-recorder']).toBe('Audio Recorder')
		expect(byPath['/privacy-policy']).toBe('Privacy Policy')
	})

	it('skips dynamic routes by default', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/blog/+page.svelte',
			'/src/routes/blog/[year]/+page.svelte',
			'/src/routes/blog/[year]/[month]/[slug]/+page.svelte',
			'/src/routes/docs/[...slug]/+page.svelte'
		]))
		const paths = entries.map((e) => e.path).sort()
		expect(paths).toEqual([ '/blog' ])
	})

	it('includes dynamic routes when skipDynamic=false', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/blog/+page.svelte',
			'/src/routes/blog/[year]/+page.svelte'
		]), { skipDynamic: false })
		expect(entries).toHaveLength(2)
		const dynamic = entries.find((e) => e.path === '/blog/[year]')
		expect(dynamic?.isDynamic).toBe(true)
	})

	it('applies exclude predicate', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/+page.svelte',
			'/src/routes/(protected)/account/+page.svelte',
			'/src/routes/local-only/+page.svelte',
			'/src/routes/sitemap/+page.svelte'
		]), {
			exclude: (path, raw) =>
				raw.includes('(protected)') ||
				raw.includes('local-only') ||
				path === '/sitemap'
		})
		const paths = entries.map((e) => e.path).sort()
		expect(paths).toEqual([ '/' ])
	})

	it('applies category function', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/+page.svelte',
			'/src/routes/blog/+page.svelte',
			'/src/routes/shop/+page.svelte'
		]), {
			category: (path) => {
				if (path.startsWith('/blog')) return 'Content'
				if (path.startsWith('/shop')) return 'Shop'
				return 'Main'
			}
		})
		const byPath = Object.fromEntries(entries.map((e) => [ e.path, e.category ]))
		expect(byPath['/']).toBe('Main')
		expect(byPath['/blog']).toBe('Content')
		expect(byPath['/shop']).toBe('Shop')
	})

	it('marks hasServerLoad from serverGlob', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([
				'/src/routes/+page.svelte',
				'/src/routes/about/+page.svelte'
			]),
			{
				serverGlob: mockGlob([
					'/src/routes/+page.server.ts',
					'/src/routes/+layout.server.ts' // should NOT match (different suffix RE)
				])
			}
		)
		const byPath = Object.fromEntries(entries.map((e) => [ e.path, e.hasServerLoad ]))
		expect(byPath['/']).toBe(true)
		expect(byPath['/about']).toBe(false)
	})

	it('handles serverGlob route-group stripping', () => {
		const entries = scanSvelteKitRoutes(
			mockGlob([ '/src/routes/(company)/about/+page.svelte' ]),
			{ serverGlob: mockGlob([ '/src/routes/(company)/about/+page.server.ts' ]) }
		)
		expect(entries[0]?.hasServerLoad).toBe(true)
	})

	it('honors custom rootPrefix', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/apps/web/src/routes/about/+page.svelte'
		]), { rootPrefix: '/apps/web/src/routes' })
		expect(entries[0]?.path).toBe('/about')
	})

	it('applies custom lastModified resolver', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/about/+page.svelte'
		]), { lastModified: () => TS })
		expect(entries[0]?.lastModified).toBe(TS)
	})

	it('returns deterministic order (sorted by path)', () => {
		const entries = scanSvelteKitRoutes(mockGlob([
			'/src/routes/zebra/+page.svelte',
			'/src/routes/apple/+page.svelte',
			'/src/routes/+page.svelte',
			'/src/routes/mango/+page.svelte'
		]))
		expect(entries.map((e) => e.path)).toEqual([ '/', '/apple', '/mango', '/zebra' ])
	})

	it('returns empty array for empty glob', () => {
		expect(scanSvelteKitRoutes({})).toEqual([])
	})
})

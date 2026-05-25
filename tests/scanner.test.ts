import { describe, expect, it } from 'vitest'

import { scanSvelteKitRoutes } from '../src/sveltekit/scanner.js'

describe('scanSvelteKitRoutes', () => {
	it('derives static page routes from SvelteKit page globs', () => {
		const routes = scanSvelteKitRoutes({
			'/src/routes/+page.svelte': {},
			'/src/routes/(company)/about/+page.svelte': {},
			'/src/routes/blog/[slug]/+page.svelte': {}
		})

		expect(routes.map((route) => route.path)).toEqual([ '/', '/about' ])
		expect(routes[0]).toMatchObject({
			path: '/',
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

	it('marks routes with server load, universal load, and local layout siblings', () => {
		const routes = scanSvelteKitRoutes(
			{
				'/src/routes/+page.svelte': {},
				'/src/routes/blog/+page.svelte': {},
				'/src/routes/docs/+page.svelte': {}
			},
			{
				serverGlob: {
					'/src/routes/blog/+page.server.ts': {}
				},
				clientGlob: {
					'/src/routes/blog/+page.ts': {}
				},
				layoutGlob: {
					'/src/routes/docs/+layout.svelte': {}
				}
			}
		)

		expect(routes.find((route) => route.path === '/blog')).toMatchObject({
			hasServerLoad: true,
			hasClientLoad: true,
			hasLayout: false
		})
		expect(routes.find((route) => route.path === '/docs')).toMatchObject({
			hasServerLoad: false,
			hasClientLoad: false,
			hasLayout: true
		})
	})

	it('lets consumer flags override inferred route metadata', () => {
		const routes = scanSvelteKitRoutes(
			{
				'/src/routes/account/+page.svelte': {},
				'/src/routes/internal/+page.svelte': {}
			},
			{
				clientGlob: {
					'/src/routes/account/+page.ts': {}
				},
				flags: (path) => {
					if (path === '/account') {
						return { hasAuth: true, hasClientLoad: false }
					}

					return { sitemap: 'internal', isNoIndex: true }
				}
			}
		)

		expect(routes.find((route) => route.path === '/account')).toMatchObject({
			hasAuth: true,
			hasClientLoad: false,
			sitemap: 'public'
		})
		expect(routes.find((route) => route.path === '/internal')).toMatchObject({
			isNoIndex: true,
			sitemap: 'internal'
		})
	})
})

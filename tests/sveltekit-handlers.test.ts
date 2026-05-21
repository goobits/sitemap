import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRobotsTxtHandler, createSitemapXmlHandler } from '../src/sveltekit/handlers.js'

let originalBaseUrl: string | undefined
let originalPublicBaseUrl: string | undefined

beforeEach(() => {
	originalBaseUrl = process.env['BASE_URL']
	originalPublicBaseUrl = process.env['PUBLIC_BASE_URL']
	delete process.env['BASE_URL']
	delete process.env['PUBLIC_BASE_URL']
})

afterEach(() => {
	if (originalBaseUrl !== undefined) process.env['BASE_URL'] = originalBaseUrl
	else delete process.env['BASE_URL']
	if (originalPublicBaseUrl !== undefined) process.env['PUBLIC_BASE_URL'] = originalPublicBaseUrl
	else delete process.env['PUBLIC_BASE_URL']
})

function mkEvent(reqUrl = 'http://localhost:3000/sitemap.xml', platformEnv?: Record<string, string>) {
	return {
		url: new URL(reqUrl),
		platform: platformEnv ? { env: platformEnv } : undefined
	} as unknown as Parameters<ReturnType<typeof createSitemapXmlHandler>>[0]
}

describe('createSitemapXmlHandler', () => {
	it('returns valid XML for the supplied routes', async () => {
		const handler = createSitemapXmlHandler({
			fallbackOrigin: 'https://example.com',
			getRoutes: () => [
				{ path: '/about', lastModified: '2026-05-21T00:00:00Z' },
				{ path: '/contact', lastModified: '2026-05-21T00:00:00Z' }
			]
		})
		const response = await handler(mkEvent())
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
		const body = await response.text()
		expect(body).toContain('<?xml version="1.0"')
		expect(body).toContain('<url><loc>https://example.com/about/')
		expect(body).toContain('<url><loc>https://example.com/contact/')
	})

	it('uses default cache-control header', async () => {
		const handler = createSitemapXmlHandler({
			fallbackOrigin: 'https://example.com',
			getRoutes: () => []
		})
		const response = await handler(mkEvent())
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
	})

	it('honors custom cache-control', async () => {
		const handler = createSitemapXmlHandler({
			fallbackOrigin: 'https://example.com',
			getRoutes: () => [],
			cacheControl: 'public, max-age=60'
		})
		const response = await handler(mkEvent())
		expect(response.headers.get('cache-control')).toBe('public, max-age=60')
	})

	it('awaits async getRoutes', async () => {
		const handler = createSitemapXmlHandler({
			fallbackOrigin: 'https://example.com',
			getRoutes: async () => [ { path: '/async', lastModified: '2026-05-21T00:00:00Z' } ]
		})
		const body = await (await handler(mkEvent())).text()
		expect(body).toContain('/async/')
	})

	it('prefers PUBLIC_BASE_URL from platform env over the fallback', async () => {
		const handler = createSitemapXmlHandler({
			fallbackOrigin: 'https://fallback.example.com',
			getRoutes: () => [ { path: '/x', lastModified: '2026-01-01T00:00:00Z' } ]
		})
		const body = await (await handler(mkEvent('http://localhost:3000/sitemap.xml', {
			PUBLIC_BASE_URL: 'https://prod.example.com'
		}))).text()
		expect(body).toContain('https://prod.example.com/x/')
		expect(body).not.toContain('fallback.example.com')
	})
})

describe('createRobotsTxtHandler', () => {
	it('emits a default robots.txt pointing at /sitemap.xml', async () => {
		const handler = createRobotsTxtHandler({
			fallbackOrigin: 'https://example.com'
		})
		const response = await handler(mkEvent('http://localhost:3000/robots.txt'))
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
		const body = await response.text()
		expect(body).toContain('User-agent: *')
		expect(body).toContain('Allow: /')
		expect(body).toContain('Sitemap: https://example.com/sitemap.xml')
	})

	it('honors custom sitemapPath', async () => {
		const handler = createRobotsTxtHandler({
			fallbackOrigin: 'https://example.com',
			sitemapPath: '/sitemaps/index.xml'
		})
		const body = await (await handler(mkEvent('http://localhost:3000/robots.txt'))).text()
		expect(body).toContain('Sitemap: https://example.com/sitemaps/index.xml')
	})

	it('inserts extraLines between Allow and Sitemap', async () => {
		const handler = createRobotsTxtHandler({
			fallbackOrigin: 'https://example.com',
			extraLines: [ 'Disallow: /admin/', 'Disallow: /api/internal/' ]
		})
		const body = await (await handler(mkEvent('http://localhost:3000/robots.txt'))).text()
		const lines = body.split('\n')
		expect(lines).toContain('Disallow: /admin/')
		expect(lines).toContain('Disallow: /api/internal/')
		// Ordering: Allow comes before Disallow, which comes before Sitemap
		expect(lines.indexOf('Allow: /')).toBeLessThan(lines.indexOf('Disallow: /admin/'))
		expect(lines.indexOf('Disallow: /admin/')).toBeLessThan(lines.findIndex((l) => l.startsWith('Sitemap:')))
	})

	it('default cache-control', async () => {
		const handler = createRobotsTxtHandler({ fallbackOrigin: 'https://example.com' })
		const response = await handler(mkEvent('http://localhost:3000/robots.txt'))
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
	})
})

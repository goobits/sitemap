import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
	buildSitemapIndexXml,
	buildSitemapXml,
	escapeXml,
	formatSitemapLastMod,
	getBaseUrl,
	getPlatformEnv,
	resolveSiteOrigin,
	toAbsoluteUrl
} from '../src/server/xml.js'

describe('escapeXml', () => {
	it('escapes all five XML reserved characters', () => {
		expect(escapeXml('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
	})

	it('is idempotent on already-escaped strings only at the character level', () => {
		// Note: re-escaping IS double-encoding — that's expected (don't unescape arbitrarily).
		expect(escapeXml('&amp;')).toBe('&amp;amp;')
	})

	it('returns empty string for empty input', () => {
		expect(escapeXml('')).toBe('')
	})
})

describe('toAbsoluteUrl', () => {
	const origin = 'https://example.com'

	it('strips trailing slash from origin', () => {
		expect(toAbsoluteUrl('https://example.com/', '/about')).toBe('https://example.com/about/')
	})

	it('preserves bare root path', () => {
		expect(toAbsoluteUrl(origin, '/')).toBe('https://example.com/')
	})

	it('adds trailing slash to non-file directory paths', () => {
		expect(toAbsoluteUrl(origin, '/about')).toBe('https://example.com/about/')
		expect(toAbsoluteUrl(origin, '/blog/post-1')).toBe('https://example.com/blog/post-1/')
	})

	it('preserves file extensions (no trailing slash)', () => {
		expect(toAbsoluteUrl(origin, '/sitemap.xml')).toBe('https://example.com/sitemap.xml')
		expect(toAbsoluteUrl(origin, '/robots.txt')).toBe('https://example.com/robots.txt')
	})

	it('adds leading slash if missing', () => {
		expect(toAbsoluteUrl(origin, 'about')).toBe('https://example.com/about/')
	})

	it('preserves existing trailing slashes', () => {
		expect(toAbsoluteUrl(origin, '/blog/')).toBe('https://example.com/blog/')
	})
})

describe('formatSitemapLastMod', () => {
	it('passes through valid ISO strings', () => {
		expect(formatSitemapLastMod('2026-05-20T12:00:00Z')).toBe('2026-05-20T12:00:00.000Z')
	})

	it('returns now() for invalid input', () => {
		const before = Date.now()
		const out = formatSitemapLastMod('not-a-date')
		const after = Date.now()
		const outTime = new Date(out).getTime()
		expect(outTime).toBeGreaterThanOrEqual(before)
		expect(outTime).toBeLessThanOrEqual(after)
	})
})

describe('buildSitemapXml', () => {
	it('builds an empty urlset when given no routes', () => {
		expect(buildSitemapXml('https://example.com', [])).toBe(
			'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
		)
	})

	it('renders one url element per route', () => {
		const xml = buildSitemapXml('https://example.com', [
			{ path: '/about', lastModified: '2026-05-20T00:00:00Z' },
			{ path: '/contact', lastModified: '2026-05-20T00:00:00Z' }
		])
		expect(xml).toContain('<url><loc>https://example.com/about/</loc>')
		expect(xml).toContain('<url><loc>https://example.com/contact/</loc>')
	})

	it('XML-escapes characters in URLs', () => {
		const xml = buildSitemapXml('https://example.com', [
			{ path: '/search?q=a&b', lastModified: '2026-01-01T00:00:00Z' }
		])
		expect(xml).toContain('&amp;')
		expect(xml).not.toContain('q=a&b<')
	})
})

describe('buildSitemapIndexXml', () => {
	it('builds an empty sitemapindex when given no entries', () => {
		expect(buildSitemapIndexXml([])).toBe(
			'<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'
		)
	})

	it('renders one sitemap element per entry', () => {
		const xml = buildSitemapIndexXml([
			{ loc: 'https://example.com/sitemap-pages.xml', lastModified: '2026-05-20T00:00:00Z' },
			{ loc: 'https://example.com/sitemap-users.xml' }
		])
		expect(xml).toContain('<sitemap><loc>https://example.com/sitemap-pages.xml</loc>')
		expect(xml).toContain('<lastmod>2026-05-20T00:00:00.000Z</lastmod>')
		expect(xml).toContain('<sitemap><loc>https://example.com/sitemap-users.xml</loc></sitemap>')
	})

	it('escapes loc values', () => {
		const xml = buildSitemapIndexXml([ { loc: 'https://example.com/a&b' } ])
		expect(xml).toContain('&amp;')
	})
})

describe('resolveSiteOrigin', () => {
	const fallback = 'https://fallback.example.com'

	it('uses configured baseUrl when valid', () => {
		expect(
			resolveSiteOrigin({
				baseUrl: 'https://prod.example.com',
				requestUrl: new URL('https://localhost:3000/'),
				fallbackOrigin: fallback
			})
		).toBe('https://prod.example.com')
	})

	it('falls back to request origin when baseUrl is missing and request is non-local', () => {
		expect(
			resolveSiteOrigin({
				requestUrl: new URL('https://prod.example.com/about'),
				fallbackOrigin: fallback
			})
		).toBe('https://prod.example.com')
	})

	it('ignores localhost request origin', () => {
		expect(
			resolveSiteOrigin({
				requestUrl: new URL('http://localhost:3000/about'),
				fallbackOrigin: fallback
			})
		).toBe(fallback)
	})

	it('ignores .local request origin', () => {
		expect(
			resolveSiteOrigin({
				requestUrl: new URL('https://dev.local/about'),
				fallbackOrigin: fallback
			})
		).toBe(fallback)
	})

	it('ignores 127.0.0.1 request origin', () => {
		expect(
			resolveSiteOrigin({
				requestUrl: new URL('http://127.0.0.1:3000/about'),
				fallbackOrigin: fallback
			})
		).toBe(fallback)
	})

	it('ignores invalid baseUrl', () => {
		expect(
			resolveSiteOrigin({
				baseUrl: 'not-a-url',
				requestUrl: new URL('https://prod.example.com/'),
				fallbackOrigin: fallback
			})
		).toBe('https://prod.example.com')
	})

	it('strips trailing slash from fallback', () => {
		expect(
			resolveSiteOrigin({
				fallbackOrigin: 'https://fallback.example.com/'
			})
		).toBe('https://fallback.example.com')
	})
})

describe('getPlatformEnv', () => {
	it('returns env for SvelteKit-style platform', () => {
		expect(getPlatformEnv({ env: { FOO: 'bar' } })).toEqual({ FOO: 'bar' })
	})

	it('returns undefined for missing platform', () => {
		expect(getPlatformEnv(undefined)).toBeUndefined()
		expect(getPlatformEnv(null)).toBeUndefined()
	})

	it('returns undefined when platform has no env', () => {
		expect(getPlatformEnv({})).toBeUndefined()
	})
})

describe('getBaseUrl', () => {
	let originalProcessBaseUrl: string | undefined
	let originalProcessPublicBaseUrl: string | undefined

	beforeEach(() => {
		originalProcessBaseUrl = process.env['BASE_URL']
		originalProcessPublicBaseUrl = process.env['PUBLIC_BASE_URL']
		delete process.env['BASE_URL']
		delete process.env['PUBLIC_BASE_URL']
	})

	afterEach(() => {
		if (originalProcessBaseUrl !== undefined) process.env['BASE_URL'] = originalProcessBaseUrl
		else delete process.env['BASE_URL']
		if (originalProcessPublicBaseUrl !== undefined) process.env['PUBLIC_BASE_URL'] = originalProcessPublicBaseUrl
		else delete process.env['PUBLIC_BASE_URL']
	})

	it('prefers process.env.PUBLIC_BASE_URL over BASE_URL', () => {
		process.env['PUBLIC_BASE_URL'] = 'https://public.example.com'
		process.env['BASE_URL'] = 'https://internal.example.com'
		expect(getBaseUrl(undefined)).toBe('https://public.example.com')
	})

	it('falls back to BASE_URL when PUBLIC_BASE_URL absent', () => {
		process.env['BASE_URL'] = 'https://internal.example.com'
		expect(getBaseUrl(undefined)).toBe('https://internal.example.com')
	})

	it('falls back to platform env when process.env has neither', () => {
		expect(getBaseUrl({ PUBLIC_BASE_URL: 'https://platform.example.com' })).toBe('https://platform.example.com')
	})

	it('returns undefined when nothing is set', () => {
		expect(getBaseUrl(undefined)).toBeUndefined()
		expect(getBaseUrl({})).toBeUndefined()
	})

	it('treats "null" / "undefined" strings as unset', () => {
		process.env['PUBLIC_BASE_URL'] = 'null'
		expect(getBaseUrl(undefined)).toBeUndefined()
	})
})

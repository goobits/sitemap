/**
 * Server-side helpers: XML builder, origin resolution, URL canonicalization.
 *
 * Reads `process.env.PUBLIC_BASE_URL` and `process.env.BASE_URL` when no
 * platform-supplied env or explicit `baseUrl` is available; safe to call on
 * any runtime that exposes `process` (or that doesn't — in which case the
 * fallback chain handles `undefined` gracefully).
 *
 * @module @goobits/sitemap/server
 */

import type { SitemapRoute } from '../core/types.ts'

function trimTrailingSlash(value: string) {
	return value.endsWith('/') ? value.slice(0, -1) : value
}

function isLocalOrigin(origin: string) {
	try {
		const { hostname } = new URL(origin)
		return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
	} catch {
		return true
	}
}

function normalizeConfiguredBaseUrl(value: string | undefined) {
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	if (!trimmed) return undefined
	if (trimmed === 'null' || trimmed === 'undefined') return undefined
	return trimmed
}

function normalizeOrigin(value: string) {
	const trimmed = trimTrailingSlash(value)
	if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined
	return trimmed
}

/**
 * Resolve the canonical site origin (no trailing slash) using a 3-tier fallback:
 *
 * 1. Caller-supplied `baseUrl` (e.g. parsed from env at boot)
 * 2. The actual request origin (when not a localhost / `.local` dev origin)
 * 3. Caller-supplied `fallbackOrigin` (last-resort default)
 */
export function resolveSiteOrigin({
	baseUrl,
	requestUrl,
	fallbackOrigin
}: {
	baseUrl?: string
	requestUrl?: URL
	fallbackOrigin: string
}) {
	if (baseUrl) {
		try {
			const resolved = normalizeOrigin(new URL(baseUrl).origin)
			if (resolved) return resolved
		} catch {
			// Ignore invalid baseUrl; continue to the next tier.
		}
	}

	if (requestUrl && !isLocalOrigin(requestUrl.origin)) {
		const resolved = normalizeOrigin(requestUrl.origin)
		if (resolved) return resolved
	}

	return trimTrailingSlash(fallbackOrigin)
}

/**
 * Read SvelteKit-style platform env safely. Returns `undefined` if the
 * platform shape doesn't include an `env` record (e.g. plain Node, Bun).
 */
export function getPlatformEnv(platform: unknown): Record<string, string | undefined> | undefined {
	try {
		return (platform as { env?: Record<string, string | undefined> } | undefined)?.env
	} catch {
		return undefined
	}
}

/**
 * Pull `PUBLIC_BASE_URL` (preferred) or `BASE_URL` from either `process.env`
 * or platform env (whichever defines it first). Returns `undefined` if
 * neither is set.
 */
export function getBaseUrl(platformEnv: Record<string, string | undefined> | undefined) {
	const processEnv = typeof process !== 'undefined' ? process.env : undefined
	const processBaseUrl =
		normalizeConfiguredBaseUrl(processEnv?.['PUBLIC_BASE_URL']) ||
		normalizeConfiguredBaseUrl(processEnv?.['BASE_URL'])
	if (processBaseUrl) return processBaseUrl

	try {
		return (
			normalizeConfiguredBaseUrl(platformEnv?.['PUBLIC_BASE_URL']) ||
			normalizeConfiguredBaseUrl(platformEnv?.['BASE_URL'])
		)
	} catch {
		return undefined
	}
}

/** Format a stored `lastModified` value (ISO string or anything parseable). */
export function formatSitemapLastMod(isoString: string) {
	const date = new Date(isoString)
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

/** Escape XML reserved characters for safe inclusion in `<loc>` / `<lastmod>`. */
export function escapeXml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

/**
 * Build a canonical absolute URL from a site origin + path. Adds a trailing
 * slash to non-file, non-root paths (which most search engines treat as
 * directory URLs); preserves file extensions and the bare root.
 */
export function toAbsoluteUrl(origin: string, path: string) {
	const normalizedPath = path.startsWith('/') ? path : `/${ path }`
	const lastSegment = normalizedPath.split('/').pop() ?? ''
	const hasFileExtension = /\.[a-z0-9]+$/i.test(lastSegment)
	const canonicalPath =
		normalizedPath === '/' || hasFileExtension || normalizedPath.endsWith('/')
			? normalizedPath
			: `${ normalizedPath }/`
	return `${ trimTrailingSlash(origin) }${ canonicalPath }`
}

function clampPriority(value: number | undefined): string | undefined {
	if (typeof value !== 'number' || Number.isNaN(value)) return undefined
	const bounded = Math.max(0, Math.min(1, value))
	// Spec recommends one decimal; keep precision but trim trailing zeros.
	return bounded.toFixed(1)
}

/**
 * Render a flat URL set as a `sitemap.xml` document. For larger sites where
 * you split into multiple shards, render each shard separately and use
 * `buildSitemapIndexXml` to point at them.
 *
 * Each route's `changefreq` and `priority` (if set) are emitted alongside
 * `<loc>` + `<lastmod>`; major crawlers ignore those fields today but
 * they're part of the sitemaps.org spec and harmless to include.
 */
export function buildSitemapXml(origin: string, routes: SitemapRoute[]) {
	const urlEntries = routes.map((route) => {
		const loc = escapeXml(toAbsoluteUrl(origin, route.path))
		const lastMod = escapeXml(formatSitemapLastMod(route.lastModified))
		const changefreqPart = route.changefreq
			? `<changefreq>${ escapeXml(route.changefreq) }</changefreq>`
			: ''
		const priorityValue = clampPriority(route.priority)
		const priorityPart = priorityValue
			? `<priority>${ priorityValue }</priority>`
			: ''
		return `<url><loc>${ loc }</loc><lastmod>${ lastMod }</lastmod>${ changefreqPart }${ priorityPart }</url>`
	}).join('')

	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ urlEntries }</urlset>`
}

/**
 * A reference to a child sitemap file in a sitemap index (multi-file
 * sites). Each child sitemap stays under the 50k-URL / 50MB-uncompressed
 * limits per the sitemap protocol.
 */
export type SitemapIndexEntry = {
	loc: string
	lastModified?: string
}

/**
 * Render a `sitemap-index.xml` pointing at one or more child sitemap files.
 * Each `loc` should already be an absolute URL (pass through `toAbsoluteUrl`
 * first if you have only paths).
 */
export function buildSitemapIndexXml(entries: SitemapIndexEntry[]) {
	const sitemapEntries = entries.map((entry) => {
		const loc = escapeXml(entry.loc)
		const lastModPart = entry.lastModified
			? `<lastmod>${ escapeXml(formatSitemapLastMod(entry.lastModified)) }</lastmod>`
			: ''
		return `<sitemap><loc>${ loc }</loc>${ lastModPart }</sitemap>`
	}).join('')

	return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ sitemapEntries }</sitemapindex>`
}

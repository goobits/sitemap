/**
 * SvelteKit `+server.ts` factories for the two most common sitemap
 * endpoints. Saves ~20 lines of boilerplate per consumer and ensures
 * everyone gets the same caching headers + origin resolution.
 *
 * @module @goobits/sitemap/sveltekit
 */

import type { RequestHandler } from '@sveltejs/kit'
import type { SitemapRoute } from '../core/types.ts'
import {
	buildSitemapXml,
	getBaseUrl,
	getPlatformEnv,
	resolveSiteOrigin
} from '../server/xml.ts'

/** Options for `createSitemapXmlHandler`. */
export interface SitemapXmlHandlerOptions {
	/** Last-resort origin when neither `PUBLIC_BASE_URL`/`BASE_URL` nor the request origin yield a usable value. */
	fallbackOrigin: string
	/**
	 * Returns the routes to render. Called on every request; cache inside if
	 * your route source is expensive. Each entry must have a `path` and
	 * `lastModified` (ISO string).
	 */
	getRoutes: () => SitemapRoute[] | Promise<SitemapRoute[]>
	/**
	 * `cache-control` value for the response. Default: `'public, max-age=3600'`
	 * (cached by browsers and intermediaries for 1 hour).
	 */
	cacheControl?: string
}

/**
 * Build a SvelteKit `RequestHandler` that emits a fully-formed
 * `sitemap.xml` from the supplied route list.
 *
 * @example
 * ```ts
 * // src/routes/sitemap.xml/+server.ts
 * import { createSitemapXmlHandler } from '@goobits/sitemap/sveltekit'
 * import { getPublicRouteInventory, FALLBACK_ORIGIN } from '$lib/server/sitemap-routes'
 *
 * export const prerender = false
 * export const GET = createSitemapXmlHandler({
 *   fallbackOrigin: FALLBACK_ORIGIN,
 *   getRoutes: () => getPublicRouteInventory().routes
 * })
 * ```
 */
export function createSitemapXmlHandler(options: SitemapXmlHandlerOptions): RequestHandler {
	const cacheControl = options.cacheControl ?? 'public, max-age=3600'
	return async ({ url, platform }) => {
		const baseUrl = getBaseUrl(getPlatformEnv(platform))
		const origin = resolveSiteOrigin({
			...(baseUrl !== undefined ? { baseUrl } : {}),
			requestUrl: url,
			fallbackOrigin: options.fallbackOrigin
		})

		const routes = await options.getRoutes()
		const xml = buildSitemapXml(
			origin,
			routes.map((entry) => ({ path: entry.path, lastModified: entry.lastModified }))
		)

		return new Response(xml, {
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': cacheControl
			}
		})
	}
}

/** Options for `createRobotsTxtHandler`. */
export interface RobotsTxtHandlerOptions {
	/** Last-resort origin when env-supplied values are missing. */
	fallbackOrigin: string
	/** Path to the sitemap file (relative to origin). Default: `'/sitemap.xml'`. */
	sitemapPath?: string
	/**
	 * Extra `robots.txt` lines inserted between the standard `User-agent: * / Allow: /`
	 * block and the `Sitemap:` line. Each entry is rendered as its own line.
	 *
	 * @example
	 * ```ts
	 * extraLines: ['Disallow: /admin/', 'Disallow: /api/internal/']
	 * ```
	 */
	extraLines?: string[]
	/** `cache-control` value. Default: `'public, max-age=3600'`. */
	cacheControl?: string
}

/**
 * Build a SvelteKit `RequestHandler` that emits a `robots.txt` pointing
 * at the sitemap. Defaults: allow all crawlers, declare one sitemap.
 */
export function createRobotsTxtHandler(options: RobotsTxtHandlerOptions): RequestHandler {
	const sitemapPath = options.sitemapPath ?? '/sitemap.xml'
	const extraLines = options.extraLines ?? []
	const cacheControl = options.cacheControl ?? 'public, max-age=3600'
	return async ({ url, platform }) => {
		const baseUrl = getBaseUrl(getPlatformEnv(platform))
		const origin = resolveSiteOrigin({
			...(baseUrl !== undefined ? { baseUrl } : {}),
			requestUrl: url,
			fallbackOrigin: options.fallbackOrigin
		})

		const lines = [
			'User-agent: *',
			'Allow: /',
			...extraLines,
			'',
			`Sitemap: ${ origin }${ sitemapPath }`,
			''
		]

		return new Response(lines.join('\n'), {
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'cache-control': cacheControl
			}
		})
	}
}

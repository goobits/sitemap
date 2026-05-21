/**
 * Notify search engines that a sitemap has updated.
 *
 * Note on engine support: Google retired its public ping endpoint in 2023,
 * and Bing has also signaled it intends to deprecate. The recommended modern
 * channel is IndexNow (Bing, Yandex, others) and Google Search Console's
 * Indexing API. The package ships no default `engines[]` — callers opt into
 * the targets they actually want to notify. `HISTORICAL_PING_ENDPOINTS` is
 * exported as a reference list of legacy URL-based endpoints (e.g., Bing's
 * `/ping?sitemap=`), included for explicit opt-in only.
 *
 * @module @goobits/sitemap/ops
 */

import { type RetryOptions, fetchWithTimeout, retry } from './http.js'

/** A single search-engine ping target. `baseUrl` is the URL prefix; the sitemap URL is URL-encoded and appended. */
export type SearchEnginePingTarget = {
	name: string
	baseUrl: string
}

/** Result of pinging a single engine. */
export type SitemapPingResult = {
	engine: string
	success: boolean
	status?: number
	error?: string
}

/** Options for the orchestrator `pingSearchEngines`. */
export type PingSearchEnginesOptions = {
	/** Engines to notify. Caller supplies — no implicit default. */
	engines: SearchEnginePingTarget[]
	/** Per-request timeout in milliseconds. Default: 5000. */
	timeoutMs?: number
	/** Retry options applied to each individual ping. Default: `{ retries: 1, delayMs: 200 }`. */
	retry?: RetryOptions
	/** Optional logger; defaults to silent. */
	logger?: PingLogger
}

/** Minimal logger interface — bring your own or omit for silent operation. */
export type PingLogger = {
	info?: (message: string, context?: Record<string, unknown>) => void
	warn?: (message: string, context?: Record<string, unknown>) => void
	error?: (message: string, context?: Record<string, unknown>) => void
}

/**
 * Common search-engine ping endpoints. These are provided as a starting
 * point — Google's `/ping` endpoint has been retired (2023), Bing's may
 * follow. Most modern usage should switch to IndexNow or platform-specific
 * APIs. We expose this constant so callers can opt in explicitly rather
 * than baking historical defaults into the package.
 */
export const HISTORICAL_PING_ENDPOINTS: readonly SearchEnginePingTarget[] = Object.freeze([
	{ name: 'Bing', baseUrl: 'https://www.bing.com/ping?sitemap=' }
])

async function pingSearchEngine(
	engine: SearchEnginePingTarget,
	sitemapUrl: string,
	timeoutMs: number,
	retryOptions: RetryOptions,
	logger: PingLogger
): Promise<SitemapPingResult> {
	const target = `${ engine.baseUrl }${ encodeURIComponent(sitemapUrl) }`

	try {
		const response = await retry(
			async () => {
				const res = await fetchWithTimeout(target, { method: 'GET' }, timeoutMs)
				if (!res.ok && res.status >= 500) {
					throw new Error(`HTTP ${ res.status }: ${ res.statusText }`)
				}
				return res
			},
			retryOptions
		)

		const result: SitemapPingResult = {
			engine: engine.name,
			success: response.ok,
			status: response.status
		}
		if (!response.ok) result.error = `HTTP ${ response.status }: ${ response.statusText }`

		if (response.ok) logger.info?.(`Sitemap ping succeeded`, { engine: engine.name })
		else logger.warn?.(`Sitemap ping failed`, { engine: engine.name, status: response.status })

		return result
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error?.(`Sitemap ping errored`, { engine: engine.name, error: message })
		return { engine: engine.name, success: false, error: message }
	}
}

/**
 * Notify a list of search engines that the sitemap at `sitemapUrl` has
 * updated. Returns a per-engine result array; never throws (all errors are
 * captured into individual `SitemapPingResult` entries).
 *
 * @example
 * ```ts
 * const results = await pingSearchEngines('https://example.com/sitemap.xml', {
 *   engines: [
 *     { name: 'IndexNow', baseUrl: 'https://api.indexnow.org/indexnow?url=' }
 *   ],
 *   timeoutMs: 8000
 * })
 * ```
 */
export async function pingSearchEngines(
	sitemapUrl: string,
	options: PingSearchEnginesOptions
): Promise<SitemapPingResult[]> {
	const timeoutMs = options.timeoutMs ?? 5000
	const retryOptions: RetryOptions = options.retry ?? { retries: 1, delayMs: 200 }
	const logger: PingLogger = options.logger ?? {}

	if (!Array.isArray(options.engines) || options.engines.length === 0) return []

	return Promise.all(
		options.engines.map((engine) => pingSearchEngine(engine, sitemapUrl, timeoutMs, retryOptions, logger))
	)
}

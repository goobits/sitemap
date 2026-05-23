/**
 * Network-side surface: search-engine pings + URL HEAD validation. All
 * functions are fetch-dependent; import from server contexts only (Node,
 * SvelteKit `+server.ts`, edge runtimes with a global `fetch`).
 *
 * @module @goobits/sitemap/ops
 */

export {
	type PingLogger,
	type PingSearchEnginesOptions,
	type SearchEnginePingTarget,
	type SitemapPingResult,
	HISTORICAL_PING_ENDPOINTS,
	pingSearchEngines
} from './ops/ping.ts'

export {
	type SitemapUrlHeadResult,
	type SitemapValidationResult,
	type ValidateLogger,
	type ValidateSitemapUrlsOptions,
	validateSitemapUrls
} from './ops/validate.ts'

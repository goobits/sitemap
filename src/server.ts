/**
 * Server-side surface: XML builders + origin resolution. Pure functions, no
 * network. For network operations (ping, validate), import `/ops` instead.
 *
 * @module @goobits/sitemap/server
 */

export {
	type SitemapIndexEntry,
	buildSitemapIndexXml,
	buildSitemapXml,
	escapeXml,
	formatSitemapLastMod,
	getBaseUrl,
	getPlatformEnv,
	resolveSiteOrigin,
	toAbsoluteUrl
} from './server/xml.ts'

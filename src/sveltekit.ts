/**
 * SvelteKit-specific helpers: `+server.ts` factories for the standard
 * `sitemap.xml` + `robots.txt` endpoints, and a route scanner that
 * derives entries from a Vite `import.meta.glob` result so you don't
 * have to hand-maintain the inventory.
 *
 * Requires `@sveltejs/kit ^2` at the consumer level (declared as an
 * optional peer; consumers using only `/core`, `/server`, `/ops`, or
 * `/ui` don't pay for it).
 *
 * @module @goobits/sitemap/sveltekit
 */

export {
	type RobotsTxtHandlerOptions,
	type SitemapXmlHandlerOptions,
	createRobotsTxtHandler,
	createSitemapXmlHandler
} from './sveltekit/handlers.js'

export {
	type GlobResult,
	type ScanSvelteKitRoutesOptions,
	scanSvelteKitRoutes
} from './sveltekit/scanner.js'

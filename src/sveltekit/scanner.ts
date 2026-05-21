/**
 * Auto-discover SvelteKit page routes from a Vite `import.meta.glob` result.
 * Eliminates the drift problem of hand-maintained sitemap inventories —
 * call it once with your glob output and the categorization/exclusion
 * rules, and the package returns a ready-made `SitemapEntry[]`.
 *
 * The function is intentionally pure (no `import.meta.glob` call inside
 * the package): glob calls are Vite compile-time transforms and must
 * appear in the consumer's own source. The consumer supplies the result;
 * the package handles the per-route transformations.
 *
 * @module @goobits/sitemap/sveltekit
 */

import type { PageRouteEntry } from '../core/types.js'
import { createPageEntry } from '../core/builders.js'

/** A Vite `import.meta.glob` result. Keys are absolute-ish source paths. */
export type GlobResult = Record<string, unknown>

/** Options for `scanSvelteKitRoutes`. */
export interface ScanSvelteKitRoutesOptions {
	/**
	 * Determines the category for each route. Receives the cleaned route
	 * path (e.g. `/blog/category`, with route-group parens stripped).
	 * Default: every route lands in `'Pages'`.
	 */
	category?: (routePath: string) => string

	/**
	 * Derives the display name. Receives the cleaned route path. Default:
	 * title-cases the last path segment, replacing `-` with spaces
	 * (e.g. `/about` → `'About'`, `/beta/audio-recorder` → `'Audio Recorder'`,
	 * `/` → `'Home'`).
	 */
	name?: (routePath: string) => string

	/**
	 * Last-modified timestamp per route. Default: `'1970-01-01T00:00:00Z'`
	 * (clearly visible as "unset" in crawler tools — bump per-route or
	 * supply a global default from git/content-store).
	 */
	lastModified?: (routePath: string) => string

	/**
	 * Returns `true` to skip a route entirely. Useful for excluding
	 * `(protected)/*`, `[token]`-based pages, `thank-you/*` confirmations,
	 * `/sitemap` itself, etc. Defaults exclude nothing.
	 */
	exclude?: (routePath: string, raw: string) => boolean

	/**
	 * If true, dynamic routes (containing `[param]` or `[...rest]`) are
	 * skipped. Recommended `true` for static sitemaps where you can't
	 * enumerate the children. Default: `true`. Set `false` if you want
	 * the index template paths included (e.g. for a debug view).
	 */
	skipDynamic?: boolean

	/**
	 * If supplied, used to set `hasServerLoad: true` on entries whose
	 * route has a sibling `+page.server.{ts,js}` module. Pass the
	 * `import.meta.glob('/src/routes/**' + '/+page.server.{ts,js}')`
	 * result here.
	 */
	serverGlob?: GlobResult

	/**
	 * Roots stripped from glob keys before processing. Default: `['/src/routes']`.
	 * If your routes live elsewhere, pass that prefix.
	 */
	rootPrefix?: string
}

const PAGE_SUFFIX_RE = /\/\+page\.svelte$/
const SERVER_SUFFIX_RE = /\/\+page\.server\.(?:ts|js|mts|mjs)$/
const ROUTE_GROUP_RE = /\/\([^)]+\)/g
const DYNAMIC_RE = /\[[^/]+]/

function defaultCategory(): string {
	return 'Pages'
}

function defaultName(routePath: string): string {
	if (routePath === '/') return 'Home'
	const last = routePath.split('/').filter(Boolean).pop() ?? ''
	const cleaned = last.replace(/^\(.+\)$/, '')
	return cleaned
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ') || 'Home'
}

function defaultLastModified(): string {
	return '1970-01-01T00:00:00Z'
}

/**
 * Convert a glob key like `/src/routes/(company)/about/+page.svelte` to
 * a SvelteKit route path like `/about`. Strips the root prefix and the
 * trailing `+page.svelte`, then removes `(group)` segments.
 */
function rawToRoutePath(raw: string, rootPrefix: string): string {
	const noRoot = raw.startsWith(rootPrefix) ? raw.slice(rootPrefix.length) : raw
	const noSuffix = noRoot.replace(PAGE_SUFFIX_RE, '')
	const noGroups = noSuffix.replace(ROUTE_GROUP_RE, '')
	return noGroups === '' ? '/' : noGroups
}

/**
 * Same transform but for `+page.server.*` modules — used to detect
 * which routes have a server-side load function.
 */
function rawServerToRoutePath(raw: string, rootPrefix: string): string {
	const noRoot = raw.startsWith(rootPrefix) ? raw.slice(rootPrefix.length) : raw
	const noSuffix = noRoot.replace(SERVER_SUFFIX_RE, '')
	const noGroups = noSuffix.replace(ROUTE_GROUP_RE, '')
	return noGroups === '' ? '/' : noGroups
}

/**
 * Auto-discover routes from a `import.meta.glob('/src/routes/**' + '/+page.svelte')`
 * result, returning a `SitemapEntry[]` ready to hand to
 * `createRouteInventory()`.
 *
 * @example
 * ```ts
 * // src/lib/server/sitemap-routes.ts
 * import { scanSvelteKitRoutes } from '@goobits/sitemap/sveltekit'
 * import { createRouteInventory } from '@goobits/sitemap/core'
 *
 * const pageGlob = import.meta.glob('/src/routes/**' + '/+page.svelte')
 * const serverGlob = import.meta.glob('/src/routes/**' + '/+page.server.{ts,js}')
 *
 * const entries = scanSvelteKitRoutes(pageGlob, {
 *   serverGlob,
 *   category: (path) => {
 *     if (path.startsWith('/blog') || path.startsWith('/docs')) return 'Content'
 *     if (path.startsWith('/shop')) return 'Shop'
 *     return 'Main'
 *   },
 *   exclude: (path, raw) =>
 *     raw.includes('(protected)') ||
 *     path === '/sitemap' ||
 *     path.includes('thank-you') ||
 *     raw.includes('local-only')
 * })
 *
 * export function getPublicRouteInventory() {
 *   return createRouteInventory(entries)
 * }
 * ```
 */
export function scanSvelteKitRoutes(
	pageGlob: GlobResult,
	options: ScanSvelteKitRoutesOptions = {}
): PageRouteEntry[] {
	const rootPrefix = options.rootPrefix ?? '/src/routes'
	const category = options.category ?? defaultCategory
	const name = options.name ?? defaultName
	const lastModified = options.lastModified ?? defaultLastModified
	const exclude = options.exclude ?? (() => false)
	const skipDynamic = options.skipDynamic ?? true

	// Build a Set of route paths that have a server load (so we can stamp
	// `hasServerLoad: true` on the corresponding page entries).
	const serverRoutes = new Set<string>()
	if (options.serverGlob) {
		for (const rawKey of Object.keys(options.serverGlob)) {
			serverRoutes.add(rawServerToRoutePath(rawKey, rootPrefix))
		}
	}

	const out: PageRouteEntry[] = []

	for (const raw of Object.keys(pageGlob)) {
		const routePath = rawToRoutePath(raw, rootPrefix)
		if (exclude(routePath, raw)) continue

		const isDynamic = DYNAMIC_RE.test(routePath)
		if (skipDynamic && isDynamic) continue

		out.push(
			createPageEntry(routePath, name(routePath), category(routePath), lastModified(routePath), {
				hasServerLoad: serverRoutes.has(routePath),
				isDynamic
			})
		)
	}

	// Sort by path for deterministic output (especially helpful in tests).
	out.sort((a, b) => a.path.localeCompare(b.path))

	return out
}

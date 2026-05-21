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
	 * If supplied, used to set `hasClientLoad: true` on entries whose
	 * route has a sibling universal `+page.{ts,js}` module. Pass the
	 * `import.meta.glob('/src/routes/**' + '/+page.{ts,js}')` result here.
	 */
	clientGlob?: GlobResult

	/**
	 * If supplied, used to set `hasLayout: true` on entries that share
	 * a directory with a `+layout.svelte`. Pass the
	 * `import.meta.glob('/src/routes/**' + '/+layout.svelte')` result
	 * here. Useful as a signal for "this route defines a nested layout
	 * root", not "this route inherits one".
	 */
	layoutGlob?: GlobResult

	/**
	 * Per-route policy hook for flags the filesystem can't tell us
	 * about: `hasAuth`, `isNoIndex`, `sitemap` (`'public'` | `'internal'` |
	 * `'hidden'`). Receives the cleaned route path; return any subset of
	 * `PageEntryOverrides` to merge in. Use this to mark protected
	 * routes, intentionally non-indexed pages, or internal/admin entries.
	 *
	 * @example
	 * ```ts
	 * flags: (path) => {
	 *   if (path.startsWith('/account/')) return { hasAuth: true }
	 *   if (path === '/internal/debug') return { sitemap: 'internal', isNoIndex: true }
	 *   return {}
	 * }
	 * ```
	 */
	flags?: (routePath: string) => Partial<{
		hasAuth: boolean
		isNoIndex: boolean
		hasLayout: boolean
		hasClientLoad: boolean
		sitemap: 'public' | 'internal' | 'hidden'
	}>

	/**
	 * Roots stripped from glob keys before processing. Default: `['/src/routes']`.
	 * If your routes live elsewhere, pass that prefix.
	 */
	rootPrefix?: string
}

const PAGE_SUFFIX_RE = /\/\+page\.svelte$/
const SERVER_SUFFIX_RE = /\/\+page\.server\.(?:ts|js|mts|mjs)$/
const CLIENT_SUFFIX_RE = /\/\+page\.(?:ts|js|mts|mjs)$/
const LAYOUT_SUFFIX_RE = /\/\+layout\.svelte$/
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
 * Same transform but for sibling-module globs — used to detect server
 * load, universal load, or layout siblings of a `+page.svelte`.
 */
function rawSiblingToRoutePath(raw: string, rootPrefix: string, suffixRe: RegExp): string {
	const noRoot = raw.startsWith(rootPrefix) ? raw.slice(rootPrefix.length) : raw
	const noSuffix = noRoot.replace(suffixRe, '')
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

	// Build path-sets for each sibling-module glob so we can stamp the
	// corresponding flag on each page entry.
	const serverRoutes = new Set<string>()
	if (options.serverGlob) {
		for (const rawKey of Object.keys(options.serverGlob)) {
			serverRoutes.add(rawSiblingToRoutePath(rawKey, rootPrefix, SERVER_SUFFIX_RE))
		}
	}

	const clientRoutes = new Set<string>()
	if (options.clientGlob) {
		for (const rawKey of Object.keys(options.clientGlob)) {
			clientRoutes.add(rawSiblingToRoutePath(rawKey, rootPrefix, CLIENT_SUFFIX_RE))
		}
	}

	const layoutRoutes = new Set<string>()
	if (options.layoutGlob) {
		for (const rawKey of Object.keys(options.layoutGlob)) {
			layoutRoutes.add(rawSiblingToRoutePath(rawKey, rootPrefix, LAYOUT_SUFFIX_RE))
		}
	}

	const flagsFn: NonNullable<ScanSvelteKitRoutesOptions['flags']> = options.flags ?? (() => ({}))

	const out: PageRouteEntry[] = []

	for (const raw of Object.keys(pageGlob)) {
		const routePath = rawToRoutePath(raw, rootPrefix)
		if (exclude(routePath, raw)) continue

		const isDynamic = DYNAMIC_RE.test(routePath)
		if (skipDynamic && isDynamic) continue

		const consumerFlags = flagsFn(routePath)

		out.push(
			createPageEntry(routePath, name(routePath), category(routePath), lastModified(routePath), {
				hasServerLoad: serverRoutes.has(routePath),
				hasClientLoad: consumerFlags.hasClientLoad ?? clientRoutes.has(routePath),
				hasLayout: consumerFlags.hasLayout ?? layoutRoutes.has(routePath),
				isDynamic,
				...(consumerFlags.hasAuth !== undefined ? { hasAuth: consumerFlags.hasAuth } : {}),
				...(consumerFlags.isNoIndex !== undefined ? { isNoIndex: consumerFlags.isNoIndex } : {}),
				...(consumerFlags.sitemap !== undefined ? { sitemap: consumerFlags.sitemap } : {})
			})
		)
	}

	// Sort by path for deterministic output (especially helpful in tests).
	out.sort((a, b) => a.path.localeCompare(b.path))

	return out
}

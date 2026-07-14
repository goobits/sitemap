/**
 * Route-channel helpers. The package owns the validation and filtering
 * mechanics; host apps still own the actual channels and path policy.
 *
 * @module @goobits/sitemap/core
 */

import type {
	RouteChannel,
	RouteChannelPolicy,
	RouteChannelPolicyIssues,
	SitemapEntry
} from './types.ts'

export type RouteChannelRouteType = 'page' | 'api'

export interface RouteChannelPolicyCheckOptions {
	pageRoutes: Iterable<string>
	apiRoutes?: Iterable<string>
	ignoredRouteIds?: Iterable<string>
}

export function normalizeRouteChannel(
	policy: RouteChannelPolicy,
	channel: RouteChannel
): RouteChannel {
	if (!policy.channels.includes(channel)) {
		throw new Error(
			`Unknown route channel "${channel}". Expected one of: ${policy.channels.join(', ')}.`
		)
	}

	return channel
}

export function getRouteChannelTags(
	policy: RouteChannelPolicy,
	routeId: string,
	type: RouteChannelRouteType = 'page'
): readonly RouteChannel[] {
	if (type === 'api') {
		return policy.apiRouteTags?.[routeId] ?? policy.routeTags[routeId] ?? []
	}

	return policy.routeTags[routeId] ?? []
}

export function isRouteInChannel(
	policy: RouteChannelPolicy,
	routeId: string,
	channel: RouteChannel,
	type: RouteChannelRouteType = 'page'
): boolean {
	const normalizedChannel = normalizeRouteChannel(policy, channel)
	return getRouteChannelTags(policy, routeId, type).includes(normalizedChannel)
}

export function filterEntriesForRouteChannel<T extends SitemapEntry>(
	entries: readonly T[],
	policy: RouteChannelPolicy,
	channel: RouteChannel
): T[] {
	const normalizedChannel = normalizeRouteChannel(policy, channel)
	return entries.filter((entry) =>
		getRouteChannelTags(policy, entry.path, entry.type).includes(normalizedChannel)
	)
}

export function checkRouteChannelPolicy(
	policy: RouteChannelPolicy,
	options: RouteChannelPolicyCheckOptions
): RouteChannelPolicyIssues {
	const ignored = new Set(options.ignoredRouteIds ?? [])
	const pageRoutes = new Set(options.pageRoutes)
	const apiRoutes = new Set(options.apiRoutes ?? [])
	const missing: string[] = []
	const invalid: string[] = []
	const stale: string[] = []

	for (const routeId of pageRoutes) {
		if (ignored.has(routeId)) continue
		if (!getRouteChannelTags(policy, routeId, 'page').length) missing.push(routeId)
	}

	for (const routeId of apiRoutes) {
		if (ignored.has(routeId)) continue
		if (!getRouteChannelTags(policy, routeId, 'api').length) missing.push(routeId)
	}

	for (const [routeId, tags] of Object.entries(policy.routeTags)) {
		if (!pageRoutes.has(routeId) && !apiRoutes.has(routeId) && !ignored.has(routeId)) {
			stale.push(routeId)
		}
		for (const tag of tags) {
			if (!policy.channels.includes(tag)) invalid.push(`${routeId}: ${tag}`)
		}
	}

	for (const [routeId, tags] of Object.entries(policy.apiRouteTags ?? {})) {
		if (!apiRoutes.has(routeId) && !ignored.has(routeId)) stale.push(routeId)
		for (const tag of tags) {
			if (!policy.channels.includes(tag)) invalid.push(`${routeId}: ${tag}`)
		}
	}

	return {
		missing: uniqueSorted(missing),
		invalid: uniqueSorted(invalid),
		stale: uniqueSorted(stale)
	}
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort()
}

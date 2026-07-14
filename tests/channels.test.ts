import { describe, expect, it } from 'vitest'

import {
	checkRouteChannelPolicy,
	filterEntriesForRouteChannel,
	getRouteChannelTags,
	isRouteInChannel,
	normalizeRouteChannel
} from '../src/core/channels.js'
import { createApiEntry, createPageEntry } from '../src/core/builders.js'
import type { RouteChannelPolicy } from '../src/core/types.js'

const policy: RouteChannelPolicy = {
	channels: ['prod', 'dev', 'wip'],
	routeTags: {
		'/': ['prod', 'dev'],
		'/demo': ['dev'],
		'/demo/slow': ['dev', 'wip']
	},
	apiRouteTags: {
		'/api/demo': ['dev', 'wip']
	}
}

describe('route channel helpers', () => {
	it('normalizes known channels and rejects unknown channels', () => {
		expect(normalizeRouteChannel(policy, 'prod')).toBe('prod')
		expect(() => normalizeRouteChannel(policy, 'preview')).toThrow(
			'Unknown route channel "preview"'
		)
	})

	it('resolves page and API route channel tags', () => {
		expect(getRouteChannelTags(policy, '/', 'page')).toEqual(['prod', 'dev'])
		expect(getRouteChannelTags(policy, '/api/demo', 'api')).toEqual(['dev', 'wip'])
		expect(getRouteChannelTags(policy, '/missing', 'page')).toEqual([])
	})

	it('filters sitemap entries by channel', () => {
		const entries = [
			createPageEntry('/', 'Home', 'Main', '2026-06-07T00:00:00Z'),
			createPageEntry('/demo', 'Demo', 'Demos', '2026-06-07T00:00:00Z'),
			createApiEntry('/api/demo', 'Demo API', 'API', ['POST'], '2026-06-07T00:00:00Z')
		]

		expect(
			filterEntriesForRouteChannel(entries, policy, 'prod').map((entry) => entry.path)
		).toEqual(['/'])
		expect(isRouteInChannel(policy, '/api/demo', 'wip', 'api')).toBe(true)
	})

	it('reports missing, invalid, and stale channel policy entries', () => {
		const issues = checkRouteChannelPolicy(
			{
				channels: ['prod', 'dev'],
				routeTags: {
					'/': ['prod'],
					'/api/fallback': ['prod'],
					'/old': ['dev'],
					'/bad': ['preview']
				},
				apiRouteTags: {
					'/api/known': ['dev'],
					'/api/old': ['dev']
				}
			},
			{
				pageRoutes: ['/', '/bad', '/missing'],
				apiRoutes: ['/api/fallback', '/api/known', '/api/missing']
			}
		)

		expect(issues).toEqual({
			missing: ['/api/missing', '/missing'],
			invalid: ['/bad: preview'],
			stale: ['/api/old', '/old']
		})
	})
})

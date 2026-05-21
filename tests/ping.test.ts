import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HISTORICAL_PING_ENDPOINTS, pingSearchEngines } from '../src/ops/ping.js'

const originalFetch = globalThis.fetch

describe('pingSearchEngines', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
		vi.useRealTimers()
	})

	it('returns empty array for empty engines list', async () => {
		const fetchSpy = vi.fn()
		globalThis.fetch = fetchSpy as unknown as typeof fetch
		const results = await pingSearchEngines('https://example.com/sitemap.xml', { engines: [] })
		expect(results).toEqual([])
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it('pings each engine with the URL-encoded sitemap URL', async () => {
		const calls: string[] = []
		globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
			calls.push(String(url))
			return new Response('', { status: 200 })
		}) as unknown as typeof fetch

		const promise = pingSearchEngines('https://example.com/sitemap.xml', {
			engines: [
				{ name: 'EngineA', baseUrl: 'https://a.example/ping?u=' },
				{ name: 'EngineB', baseUrl: 'https://b.example/ping?u=' }
			]
		})
		await vi.runAllTimersAsync()
		const results = await promise

		expect(calls).toContain('https://a.example/ping?u=https%3A%2F%2Fexample.com%2Fsitemap.xml')
		expect(calls).toContain('https://b.example/ping?u=https%3A%2F%2Fexample.com%2Fsitemap.xml')
		expect(results).toHaveLength(2)
		expect(results.every((r) => r.success)).toBe(true)
	})

	it('reports per-engine success / failure without throwing on errors', async () => {
		globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
			if (String(url).includes('a.example')) return new Response('', { status: 200 })
			if (String(url).includes('b.example')) return new Response('', { status: 404, statusText: 'Not Found' })
			throw new Error('network down')
		}) as unknown as typeof fetch

		const promise = pingSearchEngines('https://example.com/sitemap.xml', {
			engines: [
				{ name: 'A', baseUrl: 'https://a.example/ping?u=' },
				{ name: 'B', baseUrl: 'https://b.example/ping?u=' },
				{ name: 'C', baseUrl: 'https://c.example/ping?u=' }
			],
			retry: { retries: 0 }
		})
		await vi.runAllTimersAsync()
		const results = await promise

		const a = results.find((r) => r.engine === 'A')
		const b = results.find((r) => r.engine === 'B')
		const c = results.find((r) => r.engine === 'C')
		expect(a?.success).toBe(true)
		expect(b?.success).toBe(false)
		expect(b?.status).toBe(404)
		expect(b?.error).toContain('HTTP 404')
		expect(c?.success).toBe(false)
		expect(c?.error).toContain('network down')
	})

	it('retries on 500+ responses', async () => {
		let attempts = 0
		globalThis.fetch = vi.fn(async () => {
			attempts++
			if (attempts < 2) return new Response('', { status: 503, statusText: 'Unavailable' })
			return new Response('', { status: 200 })
		}) as unknown as typeof fetch

		const promise = pingSearchEngines('https://example.com/sitemap.xml', {
			engines: [ { name: 'Flaky', baseUrl: 'https://x.example/ping?u=' } ],
			retry: { retries: 2, delayMs: 0 }
		})
		await vi.runAllTimersAsync()
		const results = await promise
		expect(attempts).toBe(2)
		expect(results[0]?.success).toBe(true)
	})

	it('does not retry on 4xx responses', async () => {
		let attempts = 0
		globalThis.fetch = vi.fn(async () => {
			attempts++
			return new Response('', { status: 404, statusText: 'Not Found' })
		}) as unknown as typeof fetch

		const promise = pingSearchEngines('https://example.com/sitemap.xml', {
			engines: [ { name: 'X', baseUrl: 'https://x.example/ping?u=' } ],
			retry: { retries: 3, delayMs: 0 }
		})
		await vi.runAllTimersAsync()
		const results = await promise
		expect(attempts).toBe(1)
		expect(results[0]?.success).toBe(false)
		expect(results[0]?.status).toBe(404)
	})

	it('invokes logger callbacks when provided', async () => {
		globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch
		const info = vi.fn()
		const warn = vi.fn()
		const error = vi.fn()
		const promise = pingSearchEngines('https://example.com/sitemap.xml', {
			engines: [ { name: 'A', baseUrl: 'https://a.example/?u=' } ],
			logger: { info, warn, error }
		})
		await vi.runAllTimersAsync()
		await promise
		expect(info).toHaveBeenCalledWith(expect.stringContaining('succeeded'), expect.objectContaining({ engine: 'A' }))
		expect(warn).not.toHaveBeenCalled()
		expect(error).not.toHaveBeenCalled()
	})

	it('exposes HISTORICAL_PING_ENDPOINTS but no implicit default', () => {
		expect(Array.isArray(HISTORICAL_PING_ENDPOINTS)).toBe(true)
		expect(HISTORICAL_PING_ENDPOINTS.length).toBeGreaterThan(0)
		// Caller must pass engines explicitly — there is no `engines?` overload.
	})
})

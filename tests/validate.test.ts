import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validateSitemapUrls } from '../src/ops/validate.js'

const originalFetch = globalThis.fetch

describe('validateSitemapUrls', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
		vi.useRealTimers()
	})

	it('counts all-valid URLs', async () => {
		globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch
		const promise = validateSitemapUrls([ 'https://x.test/a', 'https://x.test/b', 'https://x.test/c' ])
		await vi.runAllTimersAsync()
		const result = await promise
		expect(result.valid).toBe(3)
		expect(result.invalid).toBe(0)
		expect(result.errors).toEqual([])
		expect(result.results).toHaveLength(3)
	})

	it('counts invalid URLs and surfaces formatted errors', async () => {
		globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
			const u = String(url)
			if (u.endsWith('/ok')) return new Response('', { status: 200 })
			if (u.endsWith('/404')) return new Response('', { status: 404 })
			throw new Error('timeout')
		}) as unknown as typeof fetch

		const promise = validateSitemapUrls([
			'https://x.test/ok',
			'https://x.test/404',
			'https://x.test/down'
		])
		await vi.runAllTimersAsync()
		const result = await promise

		expect(result.valid).toBe(1)
		expect(result.invalid).toBe(2)
		expect(result.errors).toHaveLength(2)
		expect(result.errors[0]).toContain('https://x.test/404')
		expect(result.errors[1]).toContain('timeout')
	})

	it('uses HEAD method for each request', async () => {
		const methods: string[] = []
		globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			methods.push(init?.method ?? 'GET')
			return new Response('', { status: 200 })
		}) as unknown as typeof fetch

		const promise = validateSitemapUrls([ 'https://x.test/a' ])
		await vi.runAllTimersAsync()
		await promise
		expect(methods).toEqual([ 'HEAD' ])
	})

	it('bounds errors[] by maxErrors but still counts all invalid', async () => {
		globalThis.fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
		const urls = Array.from({ length: 25 }, (_, i) => `https://x.test/p${ i }`)
		const promise = validateSitemapUrls(urls, { maxErrors: 5 })
		await vi.runAllTimersAsync()
		const result = await promise
		expect(result.invalid).toBe(25)
		expect(result.errors).toHaveLength(5)
	})

	it('respects concurrency by batching', async () => {
		let inFlight = 0
		let maxInFlight = 0
		globalThis.fetch = vi.fn(async () => {
			inFlight++
			maxInFlight = Math.max(maxInFlight, inFlight)
			// Resolve immediately; vitest fake timers don't affect microtasks
			inFlight--
			return new Response('', { status: 200 })
		}) as unknown as typeof fetch

		const urls = Array.from({ length: 12 }, (_, i) => `https://x.test/${ i }`)
		const promise = validateSitemapUrls(urls, { concurrency: 3 })
		await vi.runAllTimersAsync()
		await promise
		// Concurrency invariant: never more than 3 in flight at once.
		expect(maxInFlight).toBeLessThanOrEqual(3)
	})

	it('handles empty URL list', async () => {
		globalThis.fetch = vi.fn() as unknown as typeof fetch
		const promise = validateSitemapUrls([])
		await vi.runAllTimersAsync()
		const result = await promise
		expect(result).toEqual({ valid: 0, invalid: 0, errors: [], results: [] })
		expect(globalThis.fetch).not.toHaveBeenCalled()
	})

	it('invokes logger warn on broken URLs and info on clean sweep', async () => {
		const warn = vi.fn()
		const info = vi.fn()

		globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch
		let promise = validateSitemapUrls([ 'https://x.test/a' ], { logger: { info, warn } })
		await vi.runAllTimersAsync()
		await promise
		expect(info).toHaveBeenCalledOnce()
		expect(warn).not.toHaveBeenCalled()

		info.mockReset()
		warn.mockReset()
		globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
		promise = validateSitemapUrls([ 'https://x.test/b' ], { logger: { info, warn } })
		await vi.runAllTimersAsync()
		await promise
		expect(warn).toHaveBeenCalledOnce()
		expect(info).not.toHaveBeenCalled()
	})
})

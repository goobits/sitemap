/**
 * Internal HTTP helpers — timeout-bound fetch + simple retry. Kept under
 * `ops/` because they're only used by ping + validate, both of which are
 * network-dependent.
 *
 * @internal
 */

export type RetryOptions = {
	retries?: number
	delayMs?: number
	shouldRetry?: (error: unknown) => boolean
}

/** `fetch` with a hard timeout. Aborts cleanly via `AbortController`. */
export async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)
	try {
		return await fetch(url, { ...init, signal: controller.signal })
	} finally {
		clearTimeout(timeout)
	}
}

/**
 * Run `task`, retrying up to `retries` extra times on rejection. The default
 * predicate retries on every error; pass a custom one to filter (e.g., only
 * retry on transient 5xx).
 */
export async function retry<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const retries = Math.max(0, options.retries ?? 1)
	const delayMs = Math.max(0, options.delayMs ?? 200)
	const shouldRetry = options.shouldRetry ?? (() => true)

	let lastError: unknown
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await task()
		} catch (error) {
			lastError = error
			if (attempt === retries || !shouldRetry(error)) break
			if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}
	throw lastError
}

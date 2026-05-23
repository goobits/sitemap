/**
 * HEAD-check a set of URLs from a sitemap, surfacing 404s and timeouts.
 * Useful as a periodic smoke test against the live site after a sitemap
 * regenerate, or as a CI gate.
 *
 * The validator takes URLs directly — it never reaches into the consumer's
 * data layer. The host application samples whatever it wants to validate
 * (e.g., recent posts, random users) and passes the resulting URL list to
 * `validateSitemapUrls`.
 *
 * @module @goobits/sitemap/ops
 */

import { fetchWithTimeout } from './http.ts'

/** Outcome for a single URL's HEAD probe. */
export type SitemapUrlHeadResult =
	| { url: string; ok: true; status: number }
	| { url: string; ok: false; status?: number; error?: string }

/** Aggregate result of `validateSitemapUrls`. */
export type SitemapValidationResult = {
	valid: number
	invalid: number
	errors: string[]
	results: SitemapUrlHeadResult[]
}

/** Options for `validateSitemapUrls`. */
export type ValidateSitemapUrlsOptions = {
	/** Per-request timeout in milliseconds. Default: 5000. */
	timeoutMs?: number
	/** Number of concurrent HEAD requests. Default: 6. */
	concurrency?: number
	/** Cap on `errors[]` size to keep output bounded. Default: 10. */
	maxErrors?: number
	/** Optional logger; defaults to silent. */
	logger?: ValidateLogger
}

/** Minimal logger interface — bring your own or omit for silent operation. */
export type ValidateLogger = {
	info?: (message: string, context?: Record<string, unknown>) => void
	warn?: (message: string, context?: Record<string, unknown>) => void
	error?: (message: string, context?: Record<string, unknown>) => void
}

async function headCheckUrl(url: string, timeoutMs: number): Promise<SitemapUrlHeadResult> {
	try {
		const response = await fetchWithTimeout(url, { method: 'HEAD' }, timeoutMs)
		return { url, ok: response.ok, status: response.status }
	} catch (error) {
		return {
			url,
			ok: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}
	}
}

function formatHeadCheckError(result: SitemapUrlHeadResult): string {
	if (result.ok) return `${ result.url }: OK`
	if (result.error) return `${ result.url }: ${ result.error }`
	return `${ result.url }: HTTP ${ result.status ?? 'unknown' }`
}

/**
 * HEAD-check each URL in `urls`, in small concurrent batches. Returns
 * counts plus a bounded `errors[]` summary plus the full per-URL
 * result array (`results[]`) for callers who want to do their own slicing.
 *
 * @example
 * ```ts
 * const sample = pickRandomUrls(allSitemapUrls, 100)
 * const { valid, invalid, errors } = await validateSitemapUrls(sample, {
 *   concurrency: 8,
 *   timeoutMs: 4000
 * })
 * if (invalid > 0) {
 *   console.warn(`Sitemap has ${invalid} broken URLs:`, errors)
 * }
 * ```
 */
export async function validateSitemapUrls(
	urls: string[],
	options: ValidateSitemapUrlsOptions = {}
): Promise<SitemapValidationResult> {
	const timeoutMs = Math.max(1, options.timeoutMs ?? 5000)
	const concurrency = Math.max(1, options.concurrency ?? 6)
	const maxErrors = Math.max(1, options.maxErrors ?? 10)
	const logger: ValidateLogger = options.logger ?? {}

	const errors: string[] = []
	const results: SitemapUrlHeadResult[] = []
	let valid = 0
	let invalid = 0

	for (let start = 0; start < urls.length; start += concurrency) {
		const chunk = urls.slice(start, start + concurrency)
		const chunkResults = await Promise.all(chunk.map((url) => headCheckUrl(url, timeoutMs)))

		for (const result of chunkResults) {
			results.push(result)
			if (result.ok) {
				valid++
			} else {
				invalid++
				if (errors.length < maxErrors) errors.push(formatHeadCheckError(result))
			}
		}
	}

	if (invalid > 0) logger.warn?.(`Sitemap URL validation found broken links`, { invalid, sampled: urls.length })
	else logger.info?.(`Sitemap URL validation clean`, { valid, sampled: urls.length })

	return { valid, invalid, errors, results }
}

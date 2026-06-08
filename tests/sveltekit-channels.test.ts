import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
	checkSvelteKitRouteChannelPolicy,
	generateSvelteKitRouteChannel,
	type SvelteKitRouteChannelPolicy
} from '../src/sveltekit/channels.js'

let tempRoots: string[] = []

async function createTempRoutes() {
	const root = await mkdtemp(path.join(tmpdir(), 'gb-sitemap-routes-'))
	tempRoots.push(root)
	const sourceRoutesRoot = path.join(root, 'src', 'routes')
	const generatedRoutesRoot = path.join(root, '.generated', 'routes')

	await writeFixture(sourceRoutesRoot, '+layout.svelte', '<slot />')
	await writeFixture(sourceRoutesRoot, '+page.svelte', 'dev home')
	await writeFixture(sourceRoutesRoot, 'demo/+page.svelte', 'demo')
	await writeFixture(sourceRoutesRoot, 'robots.txt/+server.ts', 'robots')
	await writeFixture(sourceRoutesRoot, '_styles/marketing.css', '.marketing {}')
	await writeFixture(sourceRoutesRoot, '_variants/prod/+page.svelte', 'prod home')

	return {
		sourceRoutesRoot,
		generatedRoutesRoot
	}
}

async function writeFixture(root: string, relativePath: string, content: string) {
	const filePath = path.join(root, relativePath)
	await mkdir(path.dirname(filePath), { recursive: true })
	await writeFile(filePath, content)
}

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
	tempRoots = []
})

describe('SvelteKit route channels', () => {
	const policy: SvelteKitRouteChannelPolicy = {
		channels: [ 'prod', 'dev', 'wip' ],
		routeTags: {
			'/': [ 'prod', 'dev' ],
			'/_styles': [ 'prod', 'dev' ],
			'/demo': [ 'dev' ],
			'/robots.txt': [ 'prod', 'dev' ]
		},
		copiedPrivateDirectories: [ '_styles' ]
	}

	it('generates a channel-specific route tree with variants and route assets', async () => {
		const { sourceRoutesRoot, generatedRoutesRoot } = await createTempRoutes()
		const result = await generateSvelteKitRouteChannel({
			sourceRoutesRoot,
			generatedRoutesRoot,
			channel: 'prod',
			policy
		})

		expect(result.includedRoutes).toEqual([ '/robots.txt' ])
		await expect(readFile(path.join(result.targetRoot, '+page.svelte'), 'utf8')).resolves.toBe(
			'prod home'
		)
		await expect(readFile(path.join(result.targetRoot, '+layout.svelte'), 'utf8')).resolves.toBe(
			'<slot />'
		)
		await expect(
			readFile(path.join(result.targetRoot, '_styles/marketing.css'), 'utf8')
		).resolves.toBe('.marketing {}')
		await expect(
			readFile(path.join(result.targetRoot, 'robots.txt/+server.ts'), 'utf8')
		).resolves.toBe('robots')
		await expect(readFile(path.join(result.targetRoot, 'demo/+page.svelte'), 'utf8')).rejects.toThrow()
	})

	it('checks channel policy coverage against the source routes', async () => {
		const { sourceRoutesRoot } = await createTempRoutes()
		await writeFixture(sourceRoutesRoot, 'missing/+page.svelte', 'missing')

		const issues = await checkSvelteKitRouteChannelPolicy({
			sourceRoutesRoot,
			policy: {
				channels: [ 'prod', 'dev' ],
				routeTags: {
					'/': [ 'prod' ],
					'/_styles': [ 'prod' ],
					'/demo': [ 'preview' ],
					'/old': [ 'dev' ]
				},
				apiRouteTags: {
					'/robots.txt': [ 'prod' ]
				},
				copiedPrivateDirectories: [ '_styles' ]
			}
		})

		expect(issues).toEqual({
			missing: [ '/missing' ],
			invalid: [ '/demo: preview' ],
			stale: [ '/old' ]
		})
	})
})

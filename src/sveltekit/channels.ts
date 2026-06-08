/**
 * Build-time SvelteKit route-channel generation. Host apps provide their
 * channel policy; this module handles filesystem route copying consistently.
 *
 * @module @goobits/sitemap/sveltekit
 */

import { access, cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

import {
	checkRouteChannelPolicy,
	getRouteChannelTags,
	normalizeRouteChannel
} from '../core/channels.ts'
import type { RouteChannelPolicy, RouteChannelPolicyIssues } from '../core/types.ts'

export interface SvelteKitRouteChannelPolicy extends RouteChannelPolicy {
	copiedPrivateDirectories?: readonly string[]
	variantsDirectory?: string
}

export interface GenerateSvelteKitRouteChannelOptions {
	sourceRoutesRoot: string
	generatedRoutesRoot: string
	channel: string
	policy: SvelteKitRouteChannelPolicy
	routeFiles?: readonly string[]
}

export interface CheckSvelteKitRouteChannelPolicyOptions {
	sourceRoutesRoot: string
	policy: SvelteKitRouteChannelPolicy
	routeFiles?: readonly string[]
}

export interface GenerateSvelteKitRouteChannelResult {
	channel: string
	targetRoot: string
	includedRoutes: string[]
}

interface RouteEntry {
	absolutePath: string
	relativePath: string
}

const defaultRouteFiles = new Set([
	'+error.svelte',
	'+layout.js',
	'+layout.server.js',
	'+layout.server.ts',
	'+layout.svelte',
	'+layout.ts',
	'+page.js',
	'+page.md',
	'+page.server.js',
	'+page.server.ts',
	'+page.svelte',
	'+page.ts',
	'+server.js',
	'+server.ts'
])

export function getSvelteKitGeneratedRoutesRoot(generatedRoutesRoot: string, channel: string): string {
	return path.join(generatedRoutesRoot, channel)
}

export async function generateSvelteKitRouteChannel({
	sourceRoutesRoot,
	generatedRoutesRoot,
	channel,
	policy,
	routeFiles = [ ...defaultRouteFiles ]
}: GenerateSvelteKitRouteChannelOptions): Promise<GenerateSvelteKitRouteChannelResult> {
	const normalizedChannel = normalizeRouteChannel(policy, channel)
	const targetRoot = getSvelteKitGeneratedRoutesRoot(generatedRoutesRoot, normalizedChannel)
	const routeFileSet = new Set(routeFiles)
	const copiedPrivateDirectories = new Set(policy.copiedPrivateDirectories ?? [])
	const variantsDirectory = policy.variantsDirectory ?? '_variants'
	const entries = await collectRouteEntries(sourceRoutesRoot, variantsDirectory)
	const includedDirectories = new Set<string>()

	await rm(targetRoot, { recursive: true, force: true })
	await mkdir(targetRoot, { recursive: true })

	for (const entry of entries) {
		if (!isRouteFile(entry.relativePath, routeFileSet)) {
			await copyStaticRouteFile(entry, targetRoot, copiedPrivateDirectories)
			continue
		}

		const routeId = routeIdFromRelativePath(entry.relativePath)
		const routeType = isApiRouteFile(entry.relativePath) ? 'api' : 'page'
		const tags = getRouteChannelTags(policy, routeId, routeType)
		if (!tags.includes(normalizedChannel)) continue

		includedDirectories.add(path.dirname(entry.relativePath))
		await copyRouteFile(entry, targetRoot, sourceRoutesRoot, variantsDirectory, normalizedChannel)
	}

	await copyAssetsForIncludedRoutes(entries, includedDirectories, targetRoot, routeFileSet)
	await copyLayoutsForIncludedRoutes(
		entries,
		includedDirectories,
		targetRoot,
		sourceRoutesRoot,
		variantsDirectory,
		normalizedChannel
	)

	return {
		channel: normalizedChannel,
		targetRoot,
		includedRoutes: [ ...includedDirectories ]
			.filter((directory) => directory !== '.')
			.map((directory) => `/${directory.split(path.sep).join('/')}`)
			.sort()
	}
}

export async function checkSvelteKitRouteChannelPolicy({
	sourceRoutesRoot,
	policy,
	routeFiles = [ ...defaultRouteFiles ]
}: CheckSvelteKitRouteChannelPolicyOptions): Promise<RouteChannelPolicyIssues> {
	const routeFileSet = new Set(routeFiles)
	const variantsDirectory = policy.variantsDirectory ?? '_variants'
	const entries = await collectRouteEntries(sourceRoutesRoot, variantsDirectory)
	const pageRoutes = new Set<string>()
	const apiRoutes = new Set<string>()
	const ignoredRouteIds = (policy.copiedPrivateDirectories ?? []).map((directory) => `/${directory}`)

	for (const entry of entries) {
		if (!isRouteFile(entry.relativePath, routeFileSet)) continue

		const routeId = routeIdFromRelativePath(entry.relativePath)
		if (isApiRouteFile(entry.relativePath)) {
			apiRoutes.add(routeId)
		} else {
			pageRoutes.add(routeId)
		}
	}

	return checkRouteChannelPolicy(policy, {
		pageRoutes,
		apiRoutes,
		ignoredRouteIds
	})
}

async function copyStaticRouteFile(
	entry: RouteEntry,
	targetRoot: string,
	copiedPrivateDirectories: Set<string>
) {
	const [firstSegment] = entry.relativePath.split(path.sep)
	if (!firstSegment || !copiedPrivateDirectories.has(firstSegment)) return

	await copyRouteFile(entry, targetRoot)
}

async function copyAssetsForIncludedRoutes(
	entries: RouteEntry[],
	includedDirectories: Set<string>,
	targetRoot: string,
	routeFiles: Set<string>
) {
	for (const entry of entries) {
		if (isRouteFile(entry.relativePath, routeFiles)) continue
		if (!includedDirectories.has(path.dirname(entry.relativePath))) continue

		await copyRouteFile(entry, targetRoot)
	}
}

async function copyRouteFile(
	entry: RouteEntry,
	targetRoot: string,
	sourceRoutesRoot?: string,
	variantsDirectory?: string,
	channel?: string
) {
	const targetPath = path.join(targetRoot, entry.relativePath)
	const sourcePath =
		sourceRoutesRoot && variantsDirectory && channel
			? await getVariantPath(sourceRoutesRoot, variantsDirectory, entry.relativePath, channel)
			: entry.absolutePath

	await mkdir(path.dirname(targetPath), { recursive: true })
	await cp(sourcePath, targetPath, { recursive: true })
}

async function copyLayoutsForIncludedRoutes(
	entries: RouteEntry[],
	includedDirectories: Set<string>,
	targetRoot: string,
	sourceRoutesRoot: string,
	variantsDirectory: string,
	channel: string
) {
	const layoutFiles = entries.filter((entry) => path.basename(entry.relativePath).startsWith('+layout'))

	for (const directory of includedDirectories) {
		let current = directory
		while (current !== '..') {
			for (const layoutFile of layoutFiles) {
				if (path.dirname(layoutFile.relativePath) === current) {
					await copyRouteFile(layoutFile, targetRoot, sourceRoutesRoot, variantsDirectory, channel)
				}
			}

			if (current === '.') break
			current = path.dirname(current)
		}
	}
}

async function collectRouteEntries(root: string, variantsDirectory: string): Promise<RouteEntry[]> {
	const entries: RouteEntry[] = []
	await collectRouteEntriesInto(root, root, entries, variantsDirectory)
	return entries
}

async function collectRouteEntriesInto(
	root: string,
	directory: string,
	entries: RouteEntry[],
	variantsDirectory: string
) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name)
		const relativePath = path.relative(root, absolutePath)

		if (entry.isDirectory()) {
			if (entry.name === variantsDirectory) continue
			await collectRouteEntriesInto(root, absolutePath, entries, variantsDirectory)
			continue
		}

		entries.push({
			absolutePath,
			relativePath
		})
	}
}

async function getVariantPath(
	sourceRoutesRoot: string,
	variantsDirectory: string,
	relativePath: string,
	channel: string
): Promise<string> {
	const variantPath = path.join(sourceRoutesRoot, variantsDirectory, channel, relativePath)

	try {
		await access(variantPath)
		return variantPath
	} catch {
		return path.join(sourceRoutesRoot, relativePath)
	}
}

function isRouteFile(relativePath: string, routeFiles: Set<string>): boolean {
	return routeFiles.has(path.basename(relativePath))
}

function isApiRouteFile(relativePath: string): boolean {
	return path.basename(relativePath).startsWith('+server')
}

function routeIdFromRelativePath(relativePath: string): string {
	const directory = path.dirname(relativePath)
	if (directory === '.') return '/'
	return `/${directory.split(path.sep).join('/')}`
}

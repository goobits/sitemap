import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = join(packageRoot, 'src')
const bemClass =
	/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/
const classSelector = /\.([a-z][a-z0-9_-]*)(?=[\s,:#[>+~{])/g

async function findSvelteFiles(directory) {
	const files = []
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) files.push(...(await findSvelteFiles(path)))
		else if (entry.name.endsWith('.svelte')) files.push(path)
	}
	return files
}

const violations = []
for (const file of await findSvelteFiles(sourceRoot)) {
	const source = await readFile(file, 'utf8')
	const styles = [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)]
		.map((match) => match[1])
		.join('\n')
		.replace(/\/\*[\s\S]*?\*\//g, '')
	const blocks = new Set()
	for (const match of styles.matchAll(classSelector)) {
		const className = match[1]
		if (!className || !bemClass.test(className)) {
			violations.push(`${relative(packageRoot, file)}: .${className ?? ''} is not BEM`)
			continue
		}
		blocks.add(className.split(/__|--/, 1)[0])
	}
	if (blocks.size > 2) {
		violations.push(`${relative(packageRoot, file)}: owns ${blocks.size} BEM blocks`)
	}
}

if (violations.length > 0) {
	console.error(violations.join('\n'))
	process.exit(1)
}

console.log('CSS conventions passed: Svelte selectors use focused BEM blocks.')

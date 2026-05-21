/**
 * Ambient declaration so `tsc` accepts `.svelte` imports from `src/ui.ts`.
 * The Svelte language plugin / `svelte-check` provides richer types when
 * the component is actually consumed; this declaration only exists to
 * unblock the package's own typecheck.
 */
declare module '*.svelte' {
	import type { Component } from 'svelte'
	const component: Component
	export default component
}

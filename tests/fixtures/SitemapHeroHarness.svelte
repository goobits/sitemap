<script lang="ts">
	import type { RouteInventory, RouteInventoryStats } from '../../src/core.js'
	import SitemapPage from '../../src/ui/SitemapPage.svelte'

	let { data }: { data: RouteInventory } = $props()
</script>

{#snippet hero({ stats }: { stats: RouteInventoryStats })}
	<output data-testid="hero-stats">{JSON.stringify(stats)}</output>
{/snippet}

<SitemapPage {data} {hero} />

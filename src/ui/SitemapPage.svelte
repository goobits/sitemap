<!--
@component
A ready-made, themable Svelte 5 sitemap page. Hand it a `RouteInventory`
(from your host code's route scanner) and you get a hero, search,
tag-filter chips, sort control, per-category icons/tones, collapsible
sections, per-route tags + last-modified dates, internal-vs-public
visibility toggle, and an empty state for free.

Theming is entirely via CSS custom properties prefixed `--gb-sitemap-*`.
Set them on `:root`, on a wrapping element via `:global(.parent)`, or
inline via `style` — they inherit normally through the cascade. No
preprocessor, no `@goobits/ui` dependency.

@example
```svelte
<script lang="ts">
  import { SitemapPage } from '@goobits/sitemap/ui'
  let { data } = $props()
</script>

<SitemapPage {data} eyebrow="MAP" title="Routes" titleAccent="indexed here" />
```
-->
<script lang="ts">
	import { type Snippet, untrack } from 'svelte'
	import {
		getFilteredSitemapCount,
		getFilteredSitemapGroups,
		getRouteTags,
		getSitemapAvailableTags,
		type HumanSitemapVisibility,
		type RouteInventoryStats,
		type SitemapEntry,
		type SitemapSort
	} from '../core.ts'
	import type { CategoryMeta, SortOption } from './types.ts'

	interface Props {
		/** The shape returned by `getPublicRouteInventory()` (or any host equivalent). */
		data: {
			grouped: Record<string, SitemapEntry[]>
			stats: RouteInventoryStats
		}
		/** Small label above the hero title. Default: none. */
		eyebrow?: string
		/** Main hero title. Default: "Sitemap". */
		title?: string
		/** Accented continuation of the title (rendered in `--gb-sitemap-accent`). */
		titleAccent?: string
		/** Sub-headline. Default: count-based ("`{n}` public pages."). */
		subtitle?: string | undefined
		/** Sort options. Default: `[{path}, {name}, {modified}]`. */
		sortOptions?: SortOption[]
		/** Initial sort. Default: `'path'`. */
		defaultSort?: SitemapSort
		/** Search input placeholder. Default: `"Search routes..."`. */
		searchPlaceholder?: string
		/** Optional class for the root element. */
		class?: string
		/** Whether category sections start collapsed. Default: false. */
		startCollapsed?: boolean
		/** Per-category visual metadata (currently `tone`), keyed by category name. */
		categoryMeta?: Record<string, CategoryMeta>
		/** Stable order for known categories. Unknown ones render after, alphabetically. */
		categoryOrder?: string[]
		/**
		 * When true, the public/internal visibility toggle is shown.
		 * Controlled by the host (likely based on session/permission).
		 * Default: false (toggle hidden, all entries treated as public-facing).
		 */
		canViewInternalRoutes?: boolean
		/** Initial visibility selection if the toggle is shown. Default: `'public'`. */
		defaultVisibility?: HumanSitemapVisibility
		/**
		 * Date formatter for the per-row last-modified display.
		 * Default: locale `en-US` short date (mm/dd/yyyy).
		 */
		formatDate?: (iso: string) => string
		/**
		 * Optional snippet for the hero area (replaces the default
		 * eyebrow/title/subtitle block). Receives `{ stats }`.
		 */
		hero?: Snippet<[{ stats: RouteInventoryStats }]>
		/**
		 * Optional snippet rendered alongside each category title (typically
		 * an icon). Receives the category name; dispatch on it internally.
		 */
		categoryHead?: Snippet<[string]>
		/** Optional snippet for the empty state. */
		empty?: Snippet
	}

	function defaultFormatDate(iso: string): string {
		const date = new Date(iso)
		if (Number.isNaN(date.getTime())) return ''
		return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
	}

	let {
		data,
		eyebrow,
		title = 'Sitemap',
		titleAccent,
		subtitle = undefined,
		sortOptions = [
			{ value: 'path' as const, label: 'Path' },
			{ value: 'name' as const, label: 'Name' },
			{ value: 'modified' as const, label: 'Recent' }
		],
		defaultSort = 'path',
		searchPlaceholder = 'Search routes...',
		class: className = '',
		startCollapsed = false,
		categoryMeta = {},
		categoryOrder = [],
		canViewInternalRoutes = false,
		defaultVisibility = 'public',
		formatDate = defaultFormatDate,
		hero,
		categoryHead,
		empty
	}: Props = $props()

	let query = $state('')
	let sortBy = $state<SitemapSort>(untrack(() => defaultSort))
	let selectedTags = $state<string[]>([])
	let visibility = $state<HumanSitemapVisibility>(untrack(() => defaultVisibility))
	let collapsed = $state<Record<string, boolean>>({})

	const visibleGrouped = $derived.by(() => {
		if (canViewInternalRoutes && visibility === 'internal') return data.grouped
		const out: Record<string, SitemapEntry[]> = {}
		for (const [ category, entries ] of Object.entries(data.grouped)) {
			const filtered = entries.filter((e) => e.sitemap === 'public')
			if (filtered.length > 0) out[category] = filtered
		}
		return out
	})

	const filteredGrouped = $derived(getFilteredSitemapGroups(visibleGrouped, query, selectedTags, sortBy))
	const filteredCount = $derived(getFilteredSitemapCount(filteredGrouped))
	const totalCount = $derived(data.stats.total)
	const availableTags = $derived(getSitemapAvailableTags(canViewInternalRoutes))
	const orderedCategoryEntries = $derived.by(() => {
		const known = categoryOrder.filter((cat) => cat in filteredGrouped)
		const unknown = Object.keys(filteredGrouped)
			.filter((cat) => !categoryOrder.includes(cat))
			.sort((a, b) => a.localeCompare(b))
		return [ ...known, ...unknown ].map((cat) => [ cat, filteredGrouped[cat]! ] as const)
	})
	const resolvedSubtitle = $derived(
		subtitle ?? `${ totalCount } public ${ totalCount === 1 ? 'page' : 'pages' }.`
	)

	function toggle(category: string) {
		collapsed[category] = !(collapsed[category] ?? startCollapsed)
	}

	function isCollapsed(category: string): boolean {
		return collapsed[category] ?? startCollapsed
	}

	function toggleTag(tag: string) {
		const idx = selectedTags.indexOf(tag)
		if (idx === -1) selectedTags = [ ...selectedTags, tag ]
		else selectedTags = selectedTags.filter((_, i) => i !== idx)
	}

	function clearFilters() {
		query = ''
		selectedTags = []
	}

	function getMeta(category: string): CategoryMeta {
		return categoryMeta[category] ?? {}
	}
</script>

<main class={[ 'gb-sitemap', className ].filter(Boolean).join(' ')}>
	<header class="gb-sitemap__hero">
		{#if hero}
			{@render hero({ stats: data.stats })}
		{:else}
			{#if eyebrow}
				<p class="gb-sitemap__eyebrow">{eyebrow}</p>
			{/if}
			<h1 class="gb-sitemap__title">
				<span>{title}</span>{#if titleAccent}<span class="gb-sitemap__title-accent">&nbsp;{titleAccent}</span>{/if}
			</h1>
			<p class="gb-sitemap__subtitle">{resolvedSubtitle}</p>
			<p class="gb-sitemap__signal">
				<span class="gb-sitemap__signal-dot" aria-hidden="true"></span>
				<span>{data.stats.total} routes indexed</span>
			</p>
		{/if}
	</header>

	<section class="gb-sitemap__toolbar" aria-label="Sitemap controls">
		<div class="gb-sitemap__toolbar-row">
			<label class="gb-sitemap__search">
				<span class="gb-sitemap__visually-hidden">Search routes</span>
				<svg class="gb-sitemap__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="11" cy="11" r="7"></circle>
					<path d="m21 21-4.3-4.3"></path>
				</svg>
				<input
					class="gb-sitemap__search-input"
					type="search"
					bind:value={query}
					placeholder={searchPlaceholder}
					aria-label="Search routes"
				/>
			</label>

			<div class="gb-sitemap__sort" role="radiogroup" aria-label="Sort routes">
				{#each sortOptions as option (option.value)}
					<button
						type="button"
						class="gb-sitemap__sort-btn"
						class:gb-sitemap__sort-btn--active={sortBy === option.value}
						role="radio"
						aria-checked={sortBy === option.value}
						onclick={() => (sortBy = option.value)}
					>{option.label}</button>
				{/each}
			</div>

			{#if canViewInternalRoutes}
				<div class="gb-sitemap__sort" role="radiogroup" aria-label="Visibility">
					<button
						type="button"
						class="gb-sitemap__sort-btn"
						class:gb-sitemap__sort-btn--active={visibility === 'public'}
						role="radio"
						aria-checked={visibility === 'public'}
						onclick={() => (visibility = 'public')}
					>Public</button>
					<button
						type="button"
						class="gb-sitemap__sort-btn"
						class:gb-sitemap__sort-btn--active={visibility === 'internal'}
						role="radio"
						aria-checked={visibility === 'internal'}
						onclick={() => (visibility = 'internal')}
					>Internal</button>
				</div>
			{/if}
		</div>

		{#if availableTags.length > 0}
			<div class="gb-sitemap__toolbar-row gb-sitemap__toolbar-row--chips">
				<span class="gb-sitemap__filter-label">Filters</span>
				<div class="gb-sitemap__chips" role="group" aria-label="Filter by tag">
					{#each availableTags as tag (tag)}
						<button
							type="button"
							class="gb-sitemap__chip"
							class:gb-sitemap__chip--active={selectedTags.includes(tag)}
							aria-pressed={selectedTags.includes(tag)}
							onclick={() => toggleTag(tag)}
						>{tag}</button>
					{/each}
				</div>
				<p class="gb-sitemap__count" aria-live="polite">
					{filteredCount} <span class="gb-sitemap__count-of">of {totalCount}</span>
				</p>
			</div>
		{:else}
			<p class="gb-sitemap__count gb-sitemap__count--solo" aria-live="polite">
				{filteredCount} <span class="gb-sitemap__count-of">of {totalCount}</span>
			</p>
		{/if}
	</section>

	{#if filteredCount === 0}
		<div class="gb-sitemap__empty">
			{#if empty}
				{@render empty()}
			{:else}
				<p>No routes match your search.</p>
				{#if query !== '' || selectedTags.length > 0}
					<button type="button" class="gb-sitemap__clear-btn" onclick={clearFilters}>Clear filters</button>
				{/if}
			{/if}
		</div>
	{:else}
		<div class="gb-sitemap__groups">
			{#each orderedCategoryEntries as [ category, entries ] (category)}
				{@const meta = getMeta(category)}
				{@const tone = meta.tone ?? 'primary'}
				<section
					class="gb-sitemap__group"
					class:gb-sitemap__group--collapsed={isCollapsed(category)}
					data-tone={tone}
				>
					<button
						type="button"
						class="gb-sitemap__group-header"
						aria-expanded={!isCollapsed(category)}
						onclick={() => toggle(category)}
					>
						<span class="gb-sitemap__group-title">
							{#if categoryHead}<span class="gb-sitemap__group-icon">{@render categoryHead(category)}</span>{/if}
							<span>{category}</span>
						</span>
						<span class="gb-sitemap__group-meta">
							<span class="gb-sitemap__badge">{entries.length}</span>
							<span class="gb-sitemap__chevron" aria-hidden="true">▾</span>
						</span>
					</button>

					{#if !isCollapsed(category)}
						<ul class="gb-sitemap__list">
							{#each entries as entry (entry.path)}
								{@const tags = getRouteTags(entry)}
								<li class="gb-sitemap__row">
									<a class="gb-sitemap__row-link" href={entry.path}>
										<span class="gb-sitemap__row-name">{entry.name}</span>
										<span class="gb-sitemap__row-path">{entry.path}</span>
									</a>
									<span class="gb-sitemap__tags" aria-hidden={tags.length === 0}>
										{#each tags as tag (tag)}
											<span class="gb-sitemap__tag" data-tag={tag}>{tag}</span>
										{/each}
									</span>
									{#if entry.lastModified}
										<time class="gb-sitemap__row-date" datetime={entry.lastModified}>
											{formatDate(entry.lastModified)}
										</time>
									{:else}
										<span class="gb-sitemap__row-date" aria-hidden="true"></span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<style>
	/*
	 * Theming model: NO `--gb-sitemap-*` assignments inside the component's
	 * scoped rules. Every property uses `var(--gb-sitemap-*, FALLBACK)` at
	 * its consumption site, so external declarations (`:root`,
	 * `:global(.parent)`, inline `style`) inherit and apply normally
	 * through the cascade without being shadowed by a scoped rule.
	 */

	.gb-sitemap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 2.5rem 1rem 5rem;
		background: var(--gb-sitemap-bg, transparent);
		color: var(--gb-sitemap-text, currentColor);
		font-family: var(--gb-sitemap-font, inherit);
		line-height: 1.5;
	}

	/* HERO */
	.gb-sitemap__hero {
		margin-bottom: calc(var(--gb-sitemap-spacing, 1rem) * 2.25);
	}

	.gb-sitemap__eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--gb-sitemap-accent-dim, color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 70%, transparent));
	}

	.gb-sitemap__title {
		margin: 0 0 0.4em;
		font-size: clamp(2rem, 5.5vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.05;
	}

	.gb-sitemap__title-accent {
		color: var(--gb-sitemap-accent, currentColor);
		font-style: italic;
		font-weight: 600;
	}

	.gb-sitemap__subtitle {
		margin: 0 0 0.6rem;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		font-size: 1.05rem;
		max-width: 40rem;
	}

	.gb-sitemap__signal {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.3rem 0.7rem;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		background: var(--gb-sitemap-card-bg, rgba(0, 0, 0, 0.025));
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: 999px;
	}

	.gb-sitemap__signal-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--gb-sitemap-accent, currentColor);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 25%, transparent);
	}

	/* TOOLBAR */
	.gb-sitemap__toolbar {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem;
		margin-bottom: calc(var(--gb-sitemap-spacing, 1rem) * 1.25);
		background: var(--gb-sitemap-card-bg, rgba(0, 0, 0, 0.025));
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: var(--gb-sitemap-radius, 0.625rem);
	}

	.gb-sitemap__toolbar-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.gb-sitemap__toolbar-row--chips {
		gap: 0.6rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
	}

	.gb-sitemap__search {
		position: relative;
		flex: 1 1 14rem;
		display: flex;
		align-items: center;
	}

	.gb-sitemap__search-icon {
		position: absolute;
		left: 0.75rem;
		width: 1rem;
		height: 1rem;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		pointer-events: none;
	}

	.gb-sitemap__search-input {
		flex: 1;
		min-width: 0;
		padding: 0.55rem 0.75rem 0.55rem 2.25rem;
		font: inherit;
		font-size: 0.95rem;
		color: inherit;
		background: var(--gb-sitemap-bg, transparent);
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: calc(var(--gb-sitemap-radius, 0.625rem) * 0.75);
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.gb-sitemap__search-input:focus {
		border-color: var(--gb-sitemap-accent, currentColor);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 18%, transparent);
	}

	.gb-sitemap__sort {
		display: inline-flex;
		gap: 0;
		padding: 2px;
		background: var(--gb-sitemap-bg, transparent);
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: calc(var(--gb-sitemap-radius, 0.625rem) * 0.75);
	}

	.gb-sitemap__sort-btn {
		padding: 0.4rem 0.85rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		background: transparent;
		border: 0;
		border-radius: calc(var(--gb-sitemap-radius, 0.625rem) * 0.5);
		cursor: pointer;
		transition: color 0.15s, background-color 0.15s;
	}

	.gb-sitemap__sort-btn:hover { color: var(--gb-sitemap-text, currentColor); }

	.gb-sitemap__sort-btn--active {
		color: var(--gb-sitemap-text, currentColor);
		background: var(--gb-sitemap-card-bg-strong, color-mix(in srgb, currentColor 6%, transparent));
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
	}

	.gb-sitemap__count {
		margin: 0 0 0 auto;
		font-size: 0.8rem;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.gb-sitemap__count--solo { margin-left: 0; }

	.gb-sitemap__count-of {
		font-weight: 400;
		color: color-mix(in srgb, var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent)) 75%, transparent);
	}

	.gb-sitemap__filter-label {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
	}

	.gb-sitemap__chips {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.gb-sitemap__chip {
		padding: 0.25rem 0.6rem;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		background: var(--gb-sitemap-bg, transparent);
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: 999px;
		cursor: pointer;
		transition: color 0.15s, background-color 0.15s, border-color 0.15s;
	}

	.gb-sitemap__chip:hover {
		color: var(--gb-sitemap-text, currentColor);
		border-color: var(--gb-sitemap-accent-dim, color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 70%, transparent));
	}

	.gb-sitemap__chip--active {
		color: var(--gb-sitemap-bg, transparent);
		background: var(--gb-sitemap-accent, currentColor);
		border-color: var(--gb-sitemap-accent, currentColor);
	}

	/* GROUPS */
	.gb-sitemap__groups {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.gb-sitemap__group {
		background: var(--gb-sitemap-card-bg, rgba(0, 0, 0, 0.025));
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-left: 3px solid var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor));
		border-radius: var(--gb-sitemap-radius, 0.625rem);
		overflow: hidden;
		transition: border-color 0.25s ease;
	}

	.gb-sitemap__group:hover {
		border-color: color-mix(in srgb, var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor)) 60%, var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent)));
		border-left-color: var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor));
	}

	.gb-sitemap__group[data-tone='secondary'] {
		--gb-sitemap-group-accent: var(--gb-sitemap-secondary, color-mix(in srgb, currentColor 70%, transparent));
	}

	.gb-sitemap__group[data-tone='primary'] {
		--gb-sitemap-group-accent: var(--gb-sitemap-accent, currentColor);
	}

	.gb-sitemap__group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.8rem 1rem;
		font: inherit;
		font-weight: 600;
		font-size: 0.95rem;
		color: inherit;
		background: transparent;
		border: 0;
		text-align: left;
		cursor: pointer;
	}

	.gb-sitemap__group-header:hover {
		background: color-mix(in srgb, var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor)) 4%, transparent);
	}

	.gb-sitemap__group-title {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}

	.gb-sitemap__group-icon {
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		border-radius: calc(var(--gb-sitemap-radius, 0.625rem) * 0.6);
		background: color-mix(in srgb, var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor)) 18%, transparent);
		color: var(--gb-sitemap-group-accent, var(--gb-sitemap-accent, currentColor));
	}

	.gb-sitemap__group-meta {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.gb-sitemap__badge {
		padding: 0.12rem 0.55rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		background: var(--gb-sitemap-bg, transparent);
		border: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: 999px;
		font-variant-numeric: tabular-nums;
	}

	.gb-sitemap__chevron {
		display: inline-block;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		transition: transform 0.15s ease;
	}

	.gb-sitemap__group--collapsed .gb-sitemap__chevron { transform: rotate(-90deg); }

	/* LIST + ROWS */
	.gb-sitemap__list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
	}

	.gb-sitemap__row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 1rem;
		border-top: 1px solid var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
	}

	.gb-sitemap__row:first-child { border-top: 0; }

	.gb-sitemap__row-link {
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		color: inherit;
		text-decoration: none;
	}

	.gb-sitemap__row-link:hover .gb-sitemap__row-name {
		color: var(--gb-sitemap-accent, currentColor);
	}

	.gb-sitemap__row-name {
		font-weight: 500;
		transition: color 0.15s;
	}

	.gb-sitemap__row-path {
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		font-family: var(--gb-sitemap-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 0.8rem;
	}

	.gb-sitemap__tags {
		display: inline-flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		justify-self: end;
	}

	/*
	 * Unified pastel pill — same shape/size/font for every tag, only hue varies.
	 * Formula: bg = pill-hue at 12%, border = pill-hue at 32%, text = pill-hue
	 * at 72% mixed toward foreground text. Each hue is overridable via a
	 * matching `--gb-sitemap-tag-<lower>-hue` custom property.
	 */
	.gb-sitemap__tag {
		--pill-hue: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		display: inline-flex;
		align-items: center;
		height: 1.25rem;
		padding: 0 0.55rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 1;
		white-space: nowrap;
		color: color-mix(in srgb, var(--pill-hue) 72%, var(--gb-sitemap-text, currentColor));
		background: color-mix(in srgb, var(--pill-hue) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--pill-hue) 32%, transparent);
		border-radius: 999px;
		font-variant-numeric: tabular-nums;
	}

	/* Per-tag default hues. Each can be overridden by a corresponding
	   `--gb-sitemap-tag-*-hue` custom property on a parent element. */
	.gb-sitemap__tag[data-tag='SSR']      { --pill-hue: var(--gb-sitemap-tag-ssr-hue, #3b82f6); }      /* blue */
	.gb-sitemap__tag[data-tag='CSR']      { --pill-hue: var(--gb-sitemap-tag-csr-hue, #8b5cf6); }      /* violet */
	.gb-sitemap__tag[data-tag='Dynamic']  { --pill-hue: var(--gb-sitemap-tag-dynamic-hue, #f59e0b); }  /* amber */
	.gb-sitemap__tag[data-tag='Layout']   { --pill-hue: var(--gb-sitemap-tag-layout-hue, #14b8a6); }   /* teal */
	.gb-sitemap__tag[data-tag='API']      { --pill-hue: var(--gb-sitemap-tag-api-hue, #64748b); }      /* slate */
	.gb-sitemap__tag[data-tag='Auth']     { --pill-hue: var(--gb-sitemap-tag-auth-hue, #f43f5e); }     /* rose */
	.gb-sitemap__tag[data-tag='NoIndex']  { --pill-hue: var(--gb-sitemap-tag-noindex-hue, #94a3b8); }  /* grey */
	.gb-sitemap__tag[data-tag='Internal'] { --pill-hue: var(--gb-sitemap-tag-internal-hue, var(--gb-sitemap-accent, #5d8c7b)); }
	.gb-sitemap__tag[data-tag='Hidden']   { --pill-hue: var(--gb-sitemap-tag-hidden-hue, #be123c); }   /* deep rose */

	.gb-sitemap__row-date {
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		font-family: var(--gb-sitemap-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		min-width: 5.5rem;
		text-align: right;
		justify-self: end;
	}

	/* EMPTY */
	.gb-sitemap__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2.5rem 1rem;
		text-align: center;
		color: var(--gb-sitemap-muted, color-mix(in srgb, currentColor 55%, transparent));
		background: var(--gb-sitemap-card-bg, rgba(0, 0, 0, 0.025));
		border: 1px dashed var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent));
		border-radius: var(--gb-sitemap-radius, 0.625rem);
	}

	.gb-sitemap__clear-btn {
		padding: 0.4rem 1rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--gb-sitemap-accent, currentColor);
		background: var(--gb-sitemap-bg, transparent);
		border: 1px solid color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 35%, var(--gb-sitemap-border, color-mix(in srgb, currentColor 12%, transparent)));
		border-radius: calc(var(--gb-sitemap-radius, 0.625rem) * 0.75);
		cursor: pointer;
	}

	.gb-sitemap__clear-btn:hover {
		background: color-mix(in srgb, var(--gb-sitemap-accent, currentColor) 10%, transparent);
	}

	/* UTILITY */
	.gb-sitemap__visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* RESPONSIVE */
	@media (max-width: 36rem) {
		.gb-sitemap { padding: 1.75rem 0.75rem 3rem; }
		.gb-sitemap__row { grid-template-columns: 1fr; gap: 0.35rem; }
		.gb-sitemap__row-link { flex-direction: column; align-items: flex-start; gap: 0.2rem; }
		.gb-sitemap__count { margin-left: 0; }
	}
</style>

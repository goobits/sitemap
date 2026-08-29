import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vitest'

import SitemapPage from '../src/ui/SitemapPage.svelte'
import type { RouteInventory, SitemapEntry } from '../src/core.js'
import SitemapHeroHarness from './fixtures/SitemapHeroHarness.svelte'

function page(
	path: string,
	name: string,
	sitemap: SitemapEntry['sitemap'],
	overrides: Partial<Extract<SitemapEntry, { type: 'page' }>> = {}
): SitemapEntry {
	return {
		path,
		name,
		type: 'page',
		hasServerLoad: false,
		hasClientLoad: false,
		hasLayout: false,
		isDynamic: false,
		hasAuth: false,
		isNoIndex: false,
		sitemap,
		lastModified: '2026-01-01T00:00:00Z',
		category: 'Pages',
		...overrides
	}
}

const routes = [
	page('/z-public', 'Zulu Public', 'public'),
	page('/a-public', 'Alpha Public', 'public', { hasServerLoad: true }),
	page('/internal', 'Internal Console', 'internal', { hasAuth: true }),
	page('/hidden', 'Hidden Operations', 'hidden')
]
const inventory: RouteInventory = {
	routes,
	grouped: { Pages: routes },
	stats: { total: 4, pages: 4, api: 0, dynamic: 0, ssr: 1, protected: 1 }
}

afterEach(cleanup)

describe('SitemapPage', () => {
	it('shows only public routes and derives public-facing counts from visible rows', () => {
		render(SitemapPage, { data: inventory })

		expect(screen.getByText('2 public routes.')).toBeTruthy()
		expect(screen.getByText('2 routes indexed')).toBeTruthy()
		expect(screen.getByRole('link', { name: /Alpha Public/ })).toBeTruthy()
		expect(screen.queryByText('Internal Console')).toBeNull()
		expect(screen.queryByText('Hidden Operations')).toBeNull()
	})

	it('passes only viewer-safe route statistics to custom heroes', () => {
		render(SitemapHeroHarness, { data: inventory })

		expect(JSON.parse(screen.getByTestId('hero-stats').textContent ?? '')).toEqual({
			total: 2,
			pages: 2,
			api: 0,
			dynamic: 0,
			ssr: 1,
			protected: 0
		})
	})

	it('adds internal routes for permitted viewers but never exposes hidden routes', async () => {
		render(SitemapPage, { data: inventory, canViewInternalRoutes: true })
		const visibility = screen.getByRole('radiogroup', { name: 'Visibility' })

		await fireEvent.click(within(visibility).getByRole('radio', { name: 'Internal' }))

		expect(screen.getByText('3 visible routes.')).toBeTruthy()
		expect(screen.getByRole('link', { name: /Internal Console/ })).toBeTruthy()
		expect(screen.queryByText('Hidden Operations')).toBeNull()
		expect(within(visibility).getByRole('radio', { name: 'Internal' }).getAttribute('aria-checked')).toBe(
			'true'
		)
	})

	it('supports search, clear, sorting, tag filtering, and collapsing', async () => {
		render(SitemapPage, { data: inventory })
		const search = screen.getByRole('searchbox', { name: 'Search routes' })

		await fireEvent.input(search, { target: { value: 'missing' } })
		expect(screen.getByText('No routes match your search.')).toBeTruthy()
		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

		await fireEvent.click(screen.getByRole('radio', { name: 'Name' }))
		const links = screen.getAllByRole('link').map((link) => link.textContent?.trim())
		expect(links).toEqual(['Alpha Public /a-public', 'Zulu Public /z-public'])

		await fireEvent.click(screen.getByRole('button', { name: 'SSR' }))
		expect(screen.queryByText('Zulu Public')).toBeNull()
		expect(screen.getByText('Alpha Public')).toBeTruthy()

		const group = screen.getByRole('button', { name: /Pages/ })
		await fireEvent.click(group)
		expect(group.getAttribute('aria-expanded')).toBe('false')
		expect(screen.queryByRole('link', { name: /Alpha Public/ })).toBeNull()
	})
})

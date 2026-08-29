import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [svelte()],
	test: {
		maxWorkers: 2,
		include: ['tests/**/*.test.ts'],
		environment: 'jsdom',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.{ts,svelte}'],
			thresholds: {
				lines: 80,
				functions: 80,
				statements: 80,
				branches: 75
			}
		}
	},
	resolve: { conditions: ['browser'] }
})

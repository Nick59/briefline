import { defineConfig, devices } from '@playwright/test';

const PORT = 5198;
const dataDir = '.e2e-data';

const chromium = (width: number, height: number) => ({
	...devices['Pixel 5'],
	viewport: { width, height },
	hasTouch: true,
	isMobile: true
});

export default defineConfig({
	testDir: 'e2e',
	outputDir: 'test-results',
	reporter: [['list'], ['html', { open: 'never' }]],
	workers: 1,
	timeout: 20_000,
	expect: { timeout: 5_000 },
	use: { baseURL: `http://localhost:${PORT}`, actionTimeout: 5_000 },
	projects: [
		{ name: 'mobile', use: chromium(360, 740) },
		{ name: 'phone', use: chromium(390, 844) },
		{ name: 'tablet', use: { ...chromium(768, 1024) } }
	],
	webServer: {
		command: `rm -rf ${dataDir} && mkdir -p ${dataDir} && pnpm exec vite dev --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			PM_DATABASE_PATH: `${dataDir}/project-manager.db`,
			BRIEFLINE_ATTACHMENTS_DIR: `${dataDir}/attachments`,
			PM_API_TOKEN: '',
			PM_SEED_DEMO: 'true',
			PM_PUBLIC_URL: `http://localhost:${PORT}`
		}
	}
});

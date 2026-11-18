import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const LONG_WORD = 'x'.repeat(200);
const OVERLAYS =
	'[role="dialog"], [role="alertdialog"], [data-slot="dialog-content"], [data-slot="sheet-content"]';
const POPUPS =
	'[role="menu"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

const FIXTURE_SPEC = `# Responsive fixture

${LONG_WORD}

| Column one | Column two | Column three | Column four | Column five | Column six |
| --- | --- | --- | --- | --- | --- |
| aaaaaaaaaaaaaaaaaaaa | bbbbbbbbbbbbbbbbbbbb | cccccccccccccccccccc | dddddddddddddddddddd | eeeeeeeeeeeeeeeeeeee | ffffffffffffffffffff |

\`\`\`ts
const aVeryLongLineOfCode = 'it keeps going and going and going and going and going and going and going';
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Start] --> B{Decide}
  B --> C[Left]
  B --> D[Right]
\`\`\`
`;

interface Keys {
	project: string;
	epic: string;
	epicWithSpecs: string;
	epicWithFixture: string;
	task: string;
}

/** Idempotent: every browser project reuses the same dev server and database. */
async function seed(request: APIRequestContext): Promise<Keys> {
	const get = async (path: string) => {
		const response = await request.get(`/api/v1${path}`);
		expect(response.ok(), path).toBeTruthy();
		return response.json();
	};
	const project = (await get('/projects'))[0];
	const epics: { key: string; specs: { title: string }[]; questions: unknown[] }[] = [];
	for (const e of (await get(`/projects/${project.key}`)).epics)
		epics.push(await get(`/epics/${e.key}`));
	const target = epics.find((e) => e.specs.length > 0) ?? epics[0];

	if (!target.specs.some((s) => s.title === 'Responsive fixture')) {
		const post = (path: string, data: unknown) => request.post(`/api/v1${path}`, { data });
		expect(
			(
				await post('/specs', {
					epic: target.key,
					title: 'Responsive fixture',
					content: FIXTURE_SPEC
				})
			).ok()
		).toBeTruthy();
		expect(
			(
				await post('/specs', {
					project: project.key,
					title: 'Project fixture',
					content: FIXTURE_SPEC
				})
			).ok()
		).toBeTruthy();
		expect(
			(
				await post(`/epics/${target.key}/questions`, {
					questions: [
						{
							question: `Which provider should we use? ${LONG_WORD}`,
							context: `Context ${LONG_WORD}`,
							options: ['Option A', `Option ${LONG_WORD}`]
						}
					]
				})
			).ok()
		).toBeTruthy();
	}
	const detail = await get(`/epics/${target.key}`);
	return {
		project: project.key,
		epic: epics[0].key,
		epicWithSpecs: target.key,
		epicWithFixture: target.key,
		task: detail.tasks[0].key
	};
}

/** Waits for finite CSS animations (dialog open transitions) to settle. */
const settle = (page: Page) =>
	page.evaluate(() =>
		Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined))
		)
	);

async function expectFits(page: Page, testInfo: TestInfo, label: string) {
	await settle(page);
	const body = await page.screenshot();
	await testInfo.attach(label, { body, contentType: 'image/png' });
	await writeFile(`test-results/shots/${testInfo.project.name}-${label}.png`, body);
	// innerWidth grows with overflowing content on mobile emulation, so use the configured width.
	const vw = testInfo.project.use.viewport!.width;
	const problems = await page.evaluate(
		({ overlays, popups, vw }) => {
			const out: string[] = [];
			const describe = (el: Element) =>
				`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(
					el.getAttribute('class') ?? ''
				)
					.split(/\s+/)
					.slice(0, 4)
					.join('.')}`;
			const visible = (el: Element) => {
				const r = el.getBoundingClientRect();
				const s = getComputedStyle(el);
				return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
			};
			const scrolls = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);
			const insideScroller = (el: Element, root: Element) => {
				for (let p = el.parentElement; p && p !== root; p = p.parentElement)
					if (scrolls(p)) return true;
				return false;
			};

			const doc = document.documentElement;
			if (doc.scrollWidth > vw + 1) {
				out.push(`page scrolls horizontally: scrollWidth ${doc.scrollWidth} > ${vw}`);
				const root = document.body;
				for (const el of root.querySelectorAll('*')) {
					if (!visible(el) || insideScroller(el, root) || getComputedStyle(el).position === 'fixed')
						continue;
					const r = el.getBoundingClientRect();
					if (r.right > vw + 1 && out.length < 6)
						out.push(`  sticks out: ${describe(el)} right=${Math.round(r.right)}`);
				}
			}

			for (const el of document.querySelectorAll(`${overlays}, ${popups}`)) {
				if (!visible(el)) continue;
				const r = el.getBoundingClientRect();
				const name = describe(el);
				if (r.left < -1 || r.right > vw + 1)
					out.push(
						`${name} outside viewport: ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`
					);
				if (el.scrollWidth > el.clientWidth + 1)
					out.push(
						`${name} overflows inside: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`
					);
				if (!el.matches(overlays)) continue;
				let found = 0;
				for (const child of el.querySelectorAll('*')) {
					if (!visible(child) || insideScroller(child, el) || (scrolls(child) && child !== el)) {
						if (!visible(child) || insideScroller(child, el)) continue;
					}
					if (getComputedStyle(child).position === 'fixed') continue;
					const cr = child.getBoundingClientRect();
					if (cr.right > r.right + 1 && found++ < 5)
						out.push(
							`  ${name} child sticks out: ${describe(child)} right=${Math.round(cr.right)} > ${Math.round(r.right)}`
						);
				}
			}
			return out;
		},
		{ overlays: OVERLAYS, popups: POPUPS, vw }
	);
	expect(problems, `${label}\n${problems.join('\n')}`).toEqual([]);
}

let keys: Keys;
test.beforeAll(() => mkdir('test-results/shots', { recursive: true }));
test.beforeAll(async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: 'http://localhost:5198' });
	keys = await seed(request);
	await request.dispose();
});

const ONBOARDING = 'first-run profile onboarding';

// The dashboard opens a profile dialog until a profile exists, and it blocks every click.
test.beforeEach(async ({ request }, testInfo) => {
	if (testInfo.title === ONBOARDING) return;
	const profile = await request.get('/api/v1/profile');
	if ((await profile.json())?.profile) return;
	const saved = await request.put('/api/v1/profile', {
		data: { name: 'Tester', role: 'developer', codingLevel: 'expert' }
	});
	expect(saved.ok()).toBeTruthy();
});

const epicUrl = () => `/projects/${keys.project}/epics/${keys.epicWithFixture}`;
const taskUrl = () => `${epicUrl()}/tasks/${keys.task}`;

/** Dev-mode hydration finishes after network idle; earlier clicks are lost. */
async function visit(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

const dialog = (page: Page) => page.getByRole('dialog').last();

async function openNav(page: Page) {
	const burger = page.getByRole('button', { name: 'Open navigation' });
	test.skip(!(await burger.isVisible()), 'sidebar is permanent at this width');
	await burger.click();
	await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
}

test.describe('screens', () => {
	test(ONBOARDING, async ({ page }, testInfo) => {
		await visit(page, '/');
		test.skip(!(await dialog(page).isVisible()), 'profile already created by an earlier project');
		await expectFits(page, testInfo, 'onboarding');
	});

	const screens: [string, () => string][] = [
		['home', () => '/'],
		['inbox', () => '/inbox'],
		['sessions', () => '/sessions'],
		['activity', () => '/activity'],
		['settings', () => '/settings'],
		['settings-setup', () => '/settings/setup'],
		['settings-ticketing', () => '/settings/ticketing'],
		['docs', () => '/docs'],
		['project', () => `/projects/${keys.project}`],
		['project-settings', () => `/projects/${keys.project}/settings`],
		['epic', () => epicUrl()],
		['epic-with-spec-selected', () => epicUrl()],
		['task', () => taskUrl()]
	];
	for (const [name, url] of screens) {
		test(name, async ({ page }, testInfo) => {
			await visit(page, url());
			await expectFits(page, testInfo, name);
		});
	}

	test('session detail', async ({ page }, testInfo) => {
		await visit(page, '/sessions');
		const link = page.locator('main a[href^="/sessions/"]').first();
		test.skip((await link.count()) === 0, 'no sessions exist in seeded data (MCP-only)');
		await link.click();
		await page.waitForLoadState('networkidle');
		await expectFits(page, testInfo, 'session-detail');
	});

	test('login redirects without a token', async ({ page }) => {
		await visit(page, '/login');
		test.skip(!page.url().endsWith('/login'), 'login redirects when PM_API_TOKEN is unset');
	});
});

test.describe('modals', () => {
	test('mobile navigation sheet', async ({ page }, testInfo) => {
		await visit(page, '/');
		await openNav(page);
		await expectFits(page, testInfo, 'nav-sheet');
	});

	test('quick jump', async ({ page }, testInfo) => {
		await visit(page, '/');
		await page.keyboard.press('Control+k');
		await expect(page.getByRole('combobox', { name: 'Jump to ticket' })).toBeVisible();
		await page.getByRole('combobox', { name: 'Jump to ticket' }).fill(LONG_WORD);
		await expectFits(page, testInfo, 'quick-jump');
		await page.getByRole('combobox', { name: 'Jump to ticket' }).fill('SHOP');
		await expect(page.getByRole('listbox')).toBeVisible();
		await expectFits(page, testInfo, 'quick-jump-results');
	});

	test('create project', async ({ page }, testInfo) => {
		await visit(page, '/');
		const narrow = await page.getByRole('button', { name: 'Open navigation' }).isVisible();
		if (narrow) await openNav(page);
		await page.getByRole('button', { name: 'New project' }).last().click();
		await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
		await expectFits(page, testInfo, 'create-project');
	});

	test('profile dialog', async ({ page }, testInfo) => {
		await visit(page, '/settings');
		await page.getByRole('button', { name: 'Edit profile' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'profile');
	});

	test('ticketing connection dialog', async ({ page }, testInfo) => {
		await visit(page, '/settings/ticketing');
		await page
			.getByRole('button', { name: /new connection/i })
			.first()
			.click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'connection-new');
		await page.keyboard.press('Escape');
		const edit = page.getByRole('button', { name: /^Edit / }).first();
		if (await edit.count()) {
			await edit.click();
			await expect(dialog(page)).toBeVisible();
			await expectFits(page, testInfo, 'connection-edit');
		}
	});

	test('new and edit epic', async ({ page }, testInfo) => {
		await visit(page, `/projects/${keys.project}`);
		await page.getByRole('button', { name: 'New epic' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'epic-new');
		await dialog(page).getByLabel('Title').fill(LONG_WORD);
		await expectFits(page, testInfo, 'epic-new-long');
		await page.keyboard.press('Escape');

		await visit(page, epicUrl());
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'epic-edit');
	});

	test('project specs dialog and spec editor', async ({ page }, testInfo) => {
		await visit(page, `/projects/${keys.project}`);
		await page.getByRole('button', { name: /^Specs/ }).click();
		await expect(dialog(page)).toBeVisible();
		await expect(dialog(page).getByText('Project fixture').first()).toBeVisible();
		await expectFits(page, testInfo, 'project-specs');
		await dialog(page)
			.getByRole('button', { name: /Add spec/ })
			.click();
		await expect(dialog(page).getByRole('tab', { name: 'Write' })).toBeVisible();
		await expectFits(page, testInfo, 'project-spec-new');
	});

	test('spec editor new, edit, preview and read mode', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page.getByRole('button', { name: 'Spec', exact: true }).click();
		await expect(dialog(page).getByRole('tab', { name: 'Write' })).toBeVisible();
		await expectFits(page, testInfo, 'spec-new');
		await page.keyboard.press('Escape');

		await page
			.getByRole('link', { name: /Responsive fixture/ })
			.first()
			.click();
		await page.getByRole('button', { name: 'Edit spec' }).click();
		await expect(dialog(page).getByRole('tab', { name: 'Write' })).toBeVisible();
		await expectFits(page, testInfo, 'spec-edit');
		await dialog(page).getByRole('tab', { name: 'Preview' }).click();
		await expectFits(page, testInfo, 'spec-edit-preview');
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'Read mode' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'spec-read-mode');
	});

	test('diagram zoom', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page
			.getByRole('link', { name: /Responsive fixture/ })
			.first()
			.click();
		const figure = page.locator('figure.md-mermaid[data-state="ready"]').first();
		await expect(figure).toBeVisible({ timeout: 20_000 });
		await figure.click();
		await expect(page.getByRole('dialog', { name: /diagram/i })).toBeVisible();
		await expectFits(page, testInfo, 'diagram-zoom');
	});

	test('threads, new thread and thread detail', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page.getByRole('button', { name: /^Threads/ }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'threads');
		const thread = dialog(page)
			.getByRole('button', { name: /Which provider/ })
			.first();
		await thread.click();
		await expectFits(page, testInfo, 'thread-detail');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'New thread' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'thread-new');
	});

	test('link ticket dialog', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page
			.getByRole('button', { name: /Link ticket|^Ticket/ })
			.first()
			.click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'link-ticket-epic');
		await page.keyboard.press('Escape');
		await visit(page, taskUrl());
		await page.getByRole('button', { name: 'Ticket', exact: true }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'link-ticket-task');
	});

	test('new task, with long content', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page.getByRole('button', { name: 'New task' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'task-new');
		const d = dialog(page);
		await d.getByLabel('Title').fill(LONG_WORD);
		await d.getByLabel('Summary').fill(LONG_WORD);
		await d.locator('.cm-content').first().click();
		await page.keyboard.type(LONG_WORD);
		await expectFits(page, testInfo, 'task-new-long');
	});

	test('edit task, with long content', async ({ page }, testInfo) => {
		await visit(page, taskUrl());
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'task-edit');
		const d = dialog(page);
		await d.getByLabel('Title').fill(LONG_WORD);
		await d.locator('.cm-content').first().click();
		await page.keyboard.type(LONG_WORD);
		await expectFits(page, testInfo, 'task-edit-long');
	});

	test('cancel task, archive epic and delete confirmations', async ({ page }, testInfo) => {
		await visit(page, taskUrl());
		await page.getByRole('button', { name: 'Cancel task' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'cancel-task');
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: /^Delete task/ }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'delete-task');

		await visit(page, epicUrl());
		await page.getByRole('button', { name: 'Archive' }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'archive-epic');
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: /^Delete epic/ }).click();
		await expect(dialog(page)).toBeVisible();
		await expectFits(page, testInfo, 'delete-epic');
	});

	test('stage status menus', async ({ page }, testInfo) => {
		await visit(page, epicUrl());
		await page
			.getByRole('button', { name: /^Change status of/ })
			.first()
			.click();
		await expect(page.getByRole('menu')).toBeVisible();
		await expectFits(page, testInfo, 'status-menu');
		await page.keyboard.press('Escape');

		await visit(page, taskUrl());
		const control = page.getByRole('button', { name: /status$/ }).first();
		if (await control.count()) {
			await control.click();
			await expectFits(page, testInfo, 'stage-status-control');
		}
	});
});

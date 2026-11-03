import type { Container } from './container.ts';
import type { CreateEpicInput } from '../shared/domain/schemas.ts';

export const PRODUCT_DISCOVERY_DEMO: CreateEpicInput = {
	title: 'Product discovery',
	summary: 'Help shoppers find the right products with search, filters and useful recommendations.',
	targetDate: '2026-12-04',
	externalRef: { provider: 'dry-run', key: 'SHOP-510' },
	specs: [
		{
			title: 'Product discovery technical spec',
			kind: 'spec',
			content: `# Product discovery

Shoppers need to find relevant products without browsing every category.

## Scope
- Search product names and descriptions with typo tolerance.
- Filter by category, price and availability; preserve filters in the URL.
- Suggest related, in-stock products on product detail pages.
- Release behind the \`product_discovery\` feature flag.

## Acceptance criteria
- [ ] Search results respond within 300 ms at p95.
- [ ] Filters survive page refreshes and shared links.
- [ ] Search and filters work with a keyboard and screen reader.
- [ ] Empty results offer a clear way to reset filters.

## Rollout
Start with 10% of shoppers and compare search-to-product click-through before expanding.

## Risks
- Stale inventory could recommend unavailable products.
- A slow search index could delay catalog updates.
`
		}
	],
	tasks: [
		{
			title: 'Review search queries and empty results',
			summary: 'Identify common queries that fail to lead shoppers to a product.',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Define catalog categories and filter attributes',
			summary: 'Agree on consistent categories, price ranges and stock availability filters.',
			priority: 'medium',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Build product search index and API',
			summary: 'Index product names and descriptions, with typo tolerance and stock updates.',
			priority: 'high',
			assignee: 'claude-code',
			stages: { dev: 'done', test: 'in_progress' }
		},
		{
			title: 'Add category, price and availability filters',
			summary: 'Keep selected filters in the URL so shoppers can share their results.',
			priority: 'high',
			assignee: 'claude-code',
			stages: { dev: 'in_progress' }
		},
		{
			title: 'Design helpful empty search results',
			summary: 'Suggest alternative queries and let shoppers reset restrictive filters.',
			priority: 'medium'
		},
		{
			title: 'Show related products on detail pages',
			summary:
				'Recommend in-stock products from the same category without repeating the current item.',
			priority: 'medium'
		},
		{
			title: 'Verify keyboard navigation and search performance',
			summary: 'Check screen reader announcements, filter focus and p95 search latency.',
			priority: 'high'
		},
		{
			title: 'Roll out discovery and track search conversions',
			summary:
				'Enable the feature for 10% of shoppers and review click-through before full rollout.',
			priority: 'low'
		}
	]
};

export const ORDER_TRACKING_DEMO: CreateEpicInput = {
	title: 'Order tracking',
	summary: 'Let customers follow their delivery and receive shipping updates.',
	targetDate: '2027-01-29',
	tasks: [
		{ title: 'Map delivery statuses and carrier events', priority: 'high' },
		{ title: 'Design the order tracking experience', priority: 'medium' },
		{ title: 'Integrate carrier tracking webhooks', priority: 'high' },
		{ title: 'Build the customer order tracking page', priority: 'high' },
		{ title: 'Send shipment and delivery notifications', priority: 'medium' },
		{ title: 'Test delayed, delivered and lost shipments', priority: 'high' },
		{ title: 'Enable tracking for all customers', priority: 'low' }
	]
};

export const STOREFRONT_FOUNDATION_DEMO: CreateEpicInput = {
	title: 'Storefront foundation',
	summary: 'The catalog, product pages and shopping cart that launched the store.',
	targetDate: '2026-09-30',
	tasks: [
		{
			title: 'Import the product catalog',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Launch product detail pages',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Build persistent shopping carts',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Validate pricing and stock at checkout',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Complete accessibility and mobile checks',
			priority: 'medium',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		},
		{
			title: 'Deploy the storefront to production',
			priority: 'high',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		}
	]
};

const CHECKOUT_SPEC = `# Checkout v2 — technical spec

Rebuild the checkout flow as a single page so customers can pay in under a minute. Today it takes four pages and 38% of carts are abandoned at the shipping step.

## Goals
- Cut checkout abandonment by a third within one quarter.
- Support Apple Pay and Google Pay alongside cards.

## Scope
- Replace the 4-step wizard with one page and inline validation.
- Add a \`PaymentIntent\` endpoint that is idempotent on \`cartId\`.
- Store the address book per customer (schema migration on \`customers\`).
- Ship behind the \`checkout_v2\` feature flag, 10% rollout first.

## Payment flow

\`\`\`mermaid
sequenceDiagram
  participant C as Customer
  participant UI as Checkout page
  participant API as Payments API
  C->>UI: Pay
  UI->>API: createIntent(cartId)
  API-->>UI: intent (same one on retry)
  UI-->>C: Order confirmed
\`\`\`

## Acceptance criteria
- [ ] A returning customer can pay in 3 clicks.
- [ ] Payment failures show a clear message and keep the cart.
- [ ] p95 latency of the payment endpoint stays under 400 ms.
- [ ] E2E tests cover card, Apple Pay and Google Pay.

## Risks
- Double charges if the client retries during a timeout.
- The migration locks the customers table for large tenants.

## Open questions
- Do we keep guest checkout in v2?
- TBD: which regions get wallet payments first

\`\`\`ts
await payments.createIntent({ cartId, amount, currency });
\`\`\`
`;

const TASK_SPEC = `# Idempotent payment intents

The endpoint must return the same intent when called twice with the same \`cartId\`.

## Implementation
- Add a unique index on \`(cart_id, status)\`.
- Return HTTP 200 with the existing intent instead of 409.

## Tests
- [ ] Two concurrent calls create one intent.
- [ ] Retry after a timeout does not charge twice.
`;

/** Creates a demo project the first time the app starts with an empty database. */
export function seedDemo(app: Container) {
	if (app.projects.list().length > 0) return;
	const actor = 'seed';
	const createDemoEpic: typeof app.epics.create = (project, input, actor) => {
		const epic = app.epics.create(
			project,
			{
				...input,
				tasks: input.tasks?.map((task) => ({ ...task, stages: undefined }))
			},
			actor
		);
		if (input.tasks?.some((task) => task.stages)) {
			app.epics.approveSpecs(epic.id, actor);
			input.tasks.forEach((task, index) => {
				if (task.stages) app.tasks.update(epic.tasks[index].id, { stages: task.stages }, actor);
			});
		}
		return app.epics.detail(epic.id);
	};

	const project = app.projects.create(
		{
			key: 'SHOP',
			name: 'Storefront',
			description: 'Customer-facing web shop. Demo data — delete it whenever you like.'
		},
		actor
	);
	const connection = app.connections.create({
		name: 'Demo tracker (dry run)',
		provider: 'dry-run',
		settings: { ticketUrlTemplate: 'https://tracker.example.com/browse/{key}' }
	});
	app.connections.setProjectTicketing(project.key, { connectionId: connection.id }, actor);

	createDemoEpic(project.key, STOREFRONT_FOUNDATION_DEMO, actor);

	const epic = createDemoEpic(
		project.key,
		{
			title: 'Checkout v2',
			summary: 'One-page checkout with wallet payments to reduce cart abandonment.',
			targetDate: '2026-12-15',
			externalRef: { provider: 'dry-run', key: 'SHOP-482' },
			specs: [{ title: 'Checkout v2 technical spec', kind: 'spec', content: CHECKOUT_SPEC }],
			tasks: [
				{
					title: 'Funnel analysis of current checkout',
					summary: 'Find the step where most customers give up.',
					priority: 'high',
					stages: { dev: 'done', test: 'done', deploy: 'done' }
				},
				{
					title: 'Idempotent payment intent endpoint',
					summary: 'Paying twice by accident becomes impossible.',
					priority: 'urgent',
					assignee: 'claude-code',
					stages: { dev: 'done', test: 'in_progress' },
					specs: [{ title: 'Payment intent design', kind: 'design', content: TASK_SPEC }]
				},
				{
					title: 'One-page checkout UI',
					summary: 'Customers see shipping, payment and review on one screen.',
					priority: 'high',
					assignee: 'claude-code',
					stages: { dev: 'in_progress' }
				},
				{
					title: 'Saved address book',
					summary: 'Returning customers skip typing their address.',
					priority: 'medium'
				},
				{ title: 'Wallet payments (Apple Pay, Google Pay)', priority: 'medium' },
				{ title: 'Ramp checkout_v2 flag to 100%', priority: 'low' }
			]
		},
		actor
	);

	const spec = epic.specs.find((s) => s.taskId === null);
	if (spec) void app.specs.translate(spec.id, actor, 'heuristic');

	createDemoEpic(project.key, ORDER_TRACKING_DEMO, actor);

	const discovery = createDemoEpic(project.key, PRODUCT_DISCOVERY_DEMO, actor);
	const discoverySpec = discovery.specs.find((s) => s.taskId === null);
	if (discoverySpec) void app.specs.translate(discoverySpec.id, actor, 'heuristic');
}

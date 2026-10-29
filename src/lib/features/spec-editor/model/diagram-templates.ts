export interface DiagramTemplate {
	id: string;
	label: string;
	source: string;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
	{
		id: 'flowchart',
		label: 'Flowchart',
		source: `flowchart LR
  user([Customer]) --> cart[Cart]
  cart --> pay{Payment ok?}
  pay -- yes --> done[Order confirmed]
  pay -- no --> cart`
	},
	{
		id: 'sequence',
		label: 'Sequence',
		source: `sequenceDiagram
  participant UI
  participant API
  participant DB
  UI->>API: POST /orders
  API->>DB: insert order
  DB-->>API: order id
  API-->>UI: 201 Created`
	},
	{
		id: 'state',
		label: 'State machine',
		source: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Draft: changes requested
  Review --> Published: approve
  Published --> [*]`
	},
	{
		id: 'er',
		label: 'Data model (ER)',
		source: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "is in"`
	},
	{
		id: 'gantt',
		label: 'Timeline (Gantt)',
		source: `gantt
  dateFormat YYYY-MM-DD
  section Build
  API        :a1, 2026-11-02, 10d
  UI         :a2, after a1, 7d
  section Release
  Rollout    :after a2, 5d`
	},
	{
		id: 'class',
		label: 'Class diagram',
		source: `classDiagram
  class PaymentService {
    +createIntent(cartId)
    +confirm(intentId)
  }
  PaymentService --> Gateway`
	}
];

/** Inserts a fenced block at the cursor, on its own lines. Returns the new text and cursor. */
export function insertBlock(
	text: string,
	cursor: number,
	source: string
): { text: string; cursor: number } {
	const before = text.slice(0, cursor);
	const after = text.slice(cursor);
	const lead =
		before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
	const trail = after.startsWith('\n') ? '\n' : '\n\n';
	const block = `${lead}\`\`\`mermaid\n${source}\n\`\`\`${trail}`;
	return { text: before + block + after, cursor: before.length + block.length };
}

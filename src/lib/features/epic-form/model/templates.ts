export interface PhaseTemplate {
	id: string;
	label: string;
	phases: string[];
}

export const PHASE_TEMPLATES: PhaseTemplate[] = [
	{
		id: 'delivery',
		label: 'Plan → Build → Verify → Release',
		phases: ['Plan', 'Build', 'Verify', 'Release']
	},
	{
		id: 'discovery',
		label: 'Discovery → Design → Build → Rollout',
		phases: ['Discovery', 'Design', 'Build', 'Rollout']
	},
	{ id: 'spike', label: 'Spike → Decision', phases: ['Spike', 'Decision'] },
	{ id: 'none', label: 'No phases yet', phases: [] }
];

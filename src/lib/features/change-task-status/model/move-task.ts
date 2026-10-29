import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import { STAGE_LABELS, STATUS_LABELS } from '#lib/shared/domain/constants.ts';
import { runOperation } from '#lib/shared/lib/run-operation.ts';

export function moveTask(taskId: string, stage: Stage, status: WorkStatus, note?: string) {
	return runOperation(
		'set_task_stage_status',
		{ task: taskId, stage, status, note },
		{
			success: `${STAGE_LABELS[stage]} → ${STATUS_LABELS[status]}`
		}
	);
}

import type { ApiErrorBody } from '../api/execute.ts';

export function errorResponse(
	status: number,
	code: string,
	message: string,
	headers: Record<string, string> = {}
) {
	const body: ApiErrorBody = { error: { code, message } };
	return Response.json(body, { status, headers });
}

export async function readJsonBody(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new SyntaxError('The request body is not valid JSON');
	}
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { handleMcp } from '../../mcp/handler.ts';
import { serveAttachment, uploadFromForm } from '../../http/attachments.ts';
import { SYNC_TRIGGERS } from '../ticketing/service.ts';
import { testApp } from '../../testing/app.ts';
import { detectImageMime, MAX_ATTACHMENT_BYTES, sanitizeFilename } from './service.ts';

const PNG = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	Buffer.from('rest-of-image')
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function setup() {
	const ctx = testApp();
	const { app } = ctx;
	app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
	app.epics.create('SHOP', { title: 'Checkout', tasks: [{ title: 'One' }] }, 'test');
	const spec = app.specs.createForProject('SHOP', { title: 'Plan', content: '' }, 'test');
	return { ...ctx, spec };
}

describe('image detection', () => {
	it('detects images by their bytes', () => {
		expect(detectImageMime(PNG)).toBe('image/png');
		expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
		expect(detectImageMime(Buffer.from('GIF89a....'))).toBe('image/gif');
		expect(detectImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
		expect(detectImageMime(SVG)).toBeNull();
		expect(detectImageMime(Buffer.from('hello'))).toBeNull();
	});

	it('sanitizes file names', () => {
		expect(sanitizeFilename('../../etc/pass\u0000wd.png')).toBe('passwd.png');
		expect(sanitizeFilename('C:\\x\\shot.png')).toBe('shot.png');
		expect(sanitizeFilename('a'.repeat(300))).toHaveLength(200);
		expect(sanitizeFilename('  ')).toBe('image');
	});
});

describe('attachment service', () => {
	it('stores the file and returns embeddable markdown', () => {
		const { app } = setup();
		const result = app.attachments.upload(
			{ target: { type: 'task', id: 'SHOP-1' }, filename: 'shot [1].png', data: PNG },
			'nick'
		);
		expect(result).toMatchObject({
			url: `/attachments/${result.id}`,
			markdown: `![shot 1.png](/attachments/${result.id})`,
			size: PNG.length,
			mime: 'image/png'
		});
		expect(readFileSync(app.attachments.path(result.id))).toEqual(PNG);
		expect(app.attachments.list({ type: 'task', id: 'SHOP-1' })).toHaveLength(1);
		expect(app.attachments.list({ type: 'project', id: 'SHOP' })).toHaveLength(0);
	});

	it('rejects svg, text, a spoofed type, empty files and oversized files', () => {
		const { app } = setup();
		const target = { type: 'project', id: 'SHOP' } as const;
		for (const data of [SVG, Buffer.from('plain text'), Buffer.alloc(0)]) {
			expect(() => app.attachments.upload({ target, filename: 'a.png', data }, 'n')).toThrow(
				/image|empty/
			);
		}
		const big = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
		expect(() => app.attachments.upload({ target, filename: 'a.png', data: big }, 'n')).toThrow(
			/larger/
		);
	});

	it('removes files after the owner is deleted, and on delete', () => {
		const { app, spec } = setup();
		const up = (type: 'project' | 'task' | 'spec', id: string) =>
			app.attachments.upload({ target: { type, id }, filename: 'a.png', data: PNG }, 'n').id;
		const taskFile = up('task', 'SHOP-1');
		const specFile = up('spec', spec.id);
		const projectFile = up('project', 'SHOP');
		const deletable = up('project', 'SHOP');
		const exists = (id: string) => existsSync(app.attachments.path(id));

		app.attachments.delete(deletable, 'n');
		expect(exists(deletable)).toBe(false);

		app.specs.delete(spec.id, 'n');
		expect([exists(specFile), exists(taskFile), exists(projectFile)]).toEqual([false, true, true]);
		app.tasks.delete('SHOP-1', 'n');
		expect([exists(taskFile), exists(projectFile)]).toEqual([false, true]);
		app.projects.delete('SHOP');
		expect(exists(projectFile)).toBe(false);
	});

	it('sweepOrphans removes files without a row and keeps the others', () => {
		const { app } = setup();
		const kept = app.attachments.upload(
			{ target: { type: 'project', id: 'SHOP' }, filename: 'a.png', data: PNG },
			'n'
		).id;
		const orphan = app.attachments.path('orphan');
		writeFileSync(orphan, 'x');
		app.attachments.sweepOrphans();
		expect(existsSync(orphan)).toBe(false);
		expect(existsSync(app.attachments.path(kept))).toBe(true);
	});
});

describe('attachment operations', () => {
	it('uploads, lists and deletes over the operations', async () => {
		const { app } = setup();
		const run = (name: string, input: object) =>
			execute(app, operationsByName.get(name)!, input, { actor: 'claude' }) as Promise<
				Record<string, unknown> & { id: string; markdown: string }
			>;
		const up = await run('upload_attachment', {
			target: { type: 'task', id: 'SHOP-1' },
			filename: 'screen.png',
			data: PNG.toString('base64')
		});
		expect(up.markdown).toBe(`![screen.png](/attachments/${up.id})`);
		const list = (await run('list_attachments', { type: 'task', id: 'SHOP-1' })) as unknown as {
			id: string;
		}[];
		expect(list.map((a) => a.id)).toEqual([up.id]);
		await run('delete_attachment', { attachment: up.id });
		expect(await run('list_attachments', { target: { type: 'task', id: 'SHOP-1' } })).toEqual([]);
		await expect(
			run('upload_attachment', {
				target: { type: 'task', id: 'SHOP-1' },
				filename: 'x.svg',
				data: SVG.toString('base64')
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('uploads through an MCP tool call', async () => {
		const { app } = setup();
		const reply = (await handleMcp(
			app,
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'upload_attachment',
					arguments: {
						target: { type: 'project', id: 'SHOP' },
						filename: 'a.png',
						data: PNG.toString('base64')
					}
				}
			},
			'claude'
		)) as { result: { structuredContent: { markdown: string } } };
		expect(reply.result.structuredContent.markdown).toMatch(/^!\[a\.png\]\(\/attachments\//);
	});
});

describe('attachment http', () => {
	it('serves the bytes with safe headers and 404s for unknown ids', async () => {
		const { app } = setup();
		const { id } = app.attachments.upload(
			{ target: { type: 'project', id: 'SHOP' }, filename: 'shot ü.png', data: PNG },
			'n'
		);
		const res = serveAttachment(app, id);
		expect(res.status).toBe(200);
		expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
		expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
		expect(res.headers.get('content-disposition')).toBe(
			"inline; filename*=UTF-8''shot%20%C3%BC.png"
		);
		expect(serveAttachment(app, 'nope').status).toBe(404);
		expect(serveAttachment(app, '../../etc/passwd').status).toBe(404);
	});

	it('accepts a multipart upload and rejects a non-image', async () => {
		const { app } = setup();
		const post = (file: Blob, name: string) => {
			const form = new FormData();
			form.set('file', file, name);
			form.set('targetType', 'task');
			form.set('targetId', 'SHOP-1');
			return uploadFromForm(
				app,
				new Request('http://x/attachments', { method: 'POST', body: form })
			);
		};
		const ok = await post(new Blob([PNG], { type: 'image/png' }), 'a.png');
		expect(ok.status).toBe(201);
		expect(((await ok.json()) as { markdown: string }).markdown).toContain('/attachments/');
		const bad = await post(new Blob([SVG], { type: 'image/png' }), 'a.png');
		expect(bad.status).toBe(400);
	});
});

describe('attachment activity', () => {
	const entries = (app: ReturnType<typeof setup>['app'], action: string) =>
		app.activity.list({ project: 'SHOP' }).items.filter((i) => i.action === action);
	const up = (
		app: ReturnType<typeof setup>['app'],
		type: 'project' | 'task' | 'spec',
		id: string
	) => app.attachments.upload({ target: { type, id }, filename: 'shot.png', data: PNG }, 'claude');

	it('records an upload on a task with its ids and message', () => {
		const { app } = setup();
		const task = app.tasks.get('SHOP-1');
		const result = up(app, 'task', 'SHOP-1');
		const [entry] = entries(app, 'attachment.added');
		expect(entry).toMatchObject({
			actor: 'claude',
			taskId: task.id,
			epicId: task.epicId,
			message: 'Added image “shot.png” to SHOP-1 “One”',
			data: {
				attachmentId: result.id,
				filename: 'shot.png',
				size: PNG.length,
				mime: 'image/png',
				target: { type: 'task', id: task.id },
				key: 'SHOP-1',
				title: 'One'
			}
		});
	});

	it('records uploads on a spec and on a project', () => {
		const { app, spec } = setup();
		up(app, 'spec', spec.id);
		up(app, 'project', 'SHOP');
		const messages = entries(app, 'attachment.added').map((i) => i.message);
		expect(messages).toContain('Added image “shot.png” to spec “Plan”');
		expect(messages).toContain('Added image “shot.png” to project');
	});

	it('records a task spec under its task and epic', () => {
		const { app } = setup();
		const task = app.tasks.get('SHOP-1');
		const taskSpec = app.specs.createForTask('SHOP-1', { title: 'Notes', content: '' }, 'test');
		up(app, 'spec', taskSpec.id);
		const [entry] = entries(app, 'attachment.added');
		expect(entry).toMatchObject({ taskId: task.id, epicId: task.epicId, data: { key: 'SHOP-1' } });
	});

	it('records uploads through the multipart route', async () => {
		const { app } = setup();
		const form = new FormData();
		form.set('targetType', 'task');
		form.set('targetId', 'SHOP-1');
		form.set('file', new File([PNG], 'drop.png', { type: 'image/png' }));
		const res = await uploadFromForm(
			app,
			new Request('http://x/attachments', { method: 'POST', body: form })
		);
		expect(res.status).toBe(201);
		expect(entries(app, 'attachment.added')[0].message).toContain('“drop.png”');
	});

	it('records delete_attachment over the operations', async () => {
		const { app } = setup();
		const { id } = up(app, 'task', 'SHOP-1');
		await execute(
			app,
			operationsByName.get('delete_attachment')!,
			{ attachment: id },
			{ actor: 'claude' }
		);
		const [entry] = entries(app, 'attachment.deleted');
		expect(entry).toMatchObject({
			actor: 'claude',
			message: 'Removed image “shot.png” from SHOP-1 “One”',
			data: { attachmentId: id }
		});
	});

	it('records nothing when the owner is deleted', () => {
		const { app } = setup();
		up(app, 'task', 'SHOP-1');
		app.tasks.delete('SHOP-1', 'n');
		expect(entries(app, 'attachment.deleted')).toEqual([]);
	});

	it('does not trigger ticket sync', () => {
		expect(SYNC_TRIGGERS.has('attachment.added')).toBe(false);
		expect(SYNC_TRIGGERS.has('attachment.deleted')).toBe(false);
	});
});

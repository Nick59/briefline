import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';

export type Db = DatabaseSync;
export type Params = Record<string, SQLInputValue>;

export function openDatabase(path: string): Db {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	migrate(db);
	return db;
}

function migrate(db: Db) {
	const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
		user_version: number;
	};
	for (let version = current; version < MIGRATIONS.length; version++) {
		transaction(db, () => {
			db.exec(MIGRATIONS[version]);
			db.exec(`PRAGMA user_version = ${version + 1}`);
		});
	}
}

export function transaction<T>(db: Db, fn: () => T): T {
	if (db.isTransaction) return fn();
	db.exec('BEGIN');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

export function all<T>(db: Db, sql: string, params: Params = {}): T[] {
	return db.prepare(sql).all(params) as T[];
}

export function one<T>(db: Db, sql: string, params: Params = {}): T | undefined {
	return db.prepare(sql).get(params) as T | undefined;
}

export function run(db: Db, sql: string, params: Params = {}) {
	return db.prepare(sql).run(params);
}

export function toJson(value: unknown): string | null {
	return value === null || value === undefined ? null : JSON.stringify(value);
}

export function fromJson<T>(value: unknown, fallback: T): T {
	if (typeof value !== 'string' || value === '') return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

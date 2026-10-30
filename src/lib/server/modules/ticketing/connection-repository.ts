import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

export interface StoredConnection {
	id: string;
	name: string;
	provider: string;
	settings: Record<string, string>;
	secretCiphertext: string | null;
	createdAt: string;
	updatedAt: string;
}

interface ConnectionRow {
	id: string;
	name: string;
	provider: string;
	settings: string;
	secret_ciphertext: string | null;
	created_at: string;
	updated_at: string;
}

const toConnection = (row: ConnectionRow): StoredConnection => ({
	id: row.id,
	name: row.name,
	provider: row.provider,
	settings: fromJson<Record<string, string>>(row.settings, {}),
	secretCiphertext: row.secret_ciphertext,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class ConnectionRepository {
	constructor(private readonly db: Db) {}

	list(): StoredConnection[] {
		return all<ConnectionRow>(
			this.db,
			'SELECT * FROM ticketing_connections ORDER BY name COLLATE NOCASE'
		).map(toConnection);
	}

	find(id: string): StoredConnection | undefined {
		const row = one<ConnectionRow>(this.db, 'SELECT * FROM ticketing_connections WHERE id = :id', {
			id
		});
		return row && toConnection(row);
	}

	insert(connection: StoredConnection) {
		run(
			this.db,
			`INSERT INTO ticketing_connections (id, name, provider, settings, secret_ciphertext, created_at, updated_at)
			 VALUES (:id, :name, :provider, :settings, :secret, :createdAt, :updatedAt)`,
			{ ...this.#params(connection), createdAt: connection.createdAt }
		);
	}

	update(connection: StoredConnection) {
		run(
			this.db,
			`UPDATE ticketing_connections SET name = :name, provider = :provider, settings = :settings,
			 secret_ciphertext = :secret, updated_at = :updatedAt WHERE id = :id`,
			this.#params(connection)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM ticketing_connections WHERE id = :id', { id });
	}

	/** Projects that select each connection, keyed by connection id. */
	usage(): Map<string, { key: string; name: string }[]> {
		const rows = all<{ connection_id: string; key: string; name: string }>(
			this.db,
			`SELECT ticketing_connection_id AS connection_id, key, name FROM projects
			 WHERE ticketing_connection_id IS NOT NULL ORDER BY name`
		);
		const usage = new Map<string, { key: string; name: string }[]>();
		for (const { connection_id, key, name } of rows) {
			usage.set(connection_id, [...(usage.get(connection_id) ?? []), { key, name }]);
		}
		return usage;
	}

	#params(connection: StoredConnection) {
		return {
			id: connection.id,
			name: connection.name,
			provider: connection.provider,
			settings: toJson(connection.settings) ?? '{}',
			secret: connection.secretCiphertext,
			updatedAt: connection.updatedAt
		};
	}
}

// pinner/db.ts

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

export function openOrCreateDatabase(dbPath: string): Database.Database {
	fs.mkdirSync(path.dirname(dbPath), { recursive: true })
	const db = new Database(dbPath)
	db.pragma("journal_mode = WAL")
	return db
}

export function createMetaHandlers(db: Database.Database): {
	getMeta: (key: string) => string | undefined
	setMeta: (key: string, value: string) => void
} {
	const set = db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
	const get = db.prepare(`SELECT value FROM meta WHERE key = ?`)

	return {
		getMeta: (key: string) => {
			const row = get.get(key) as { value: string } | undefined
			return row?.value
		},
		setMeta: (key: string, value: string) => {
			set.run(key, value)
		},
	}
}

export function initializeSchema(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS leaf_events (
			leaf_index INTEGER PRIMARY KEY,
			block_number INTEGER,
			cid TEXT NOT NULL,
			data BLOB NOT NULL,
			previous_insert_block INTEGER,
			combine_results TEXT,
			left_inputs TEXT,
			right_inputs TEXT,
			root_cid TEXT,
			pinned BOOLEAN DEFAULT 0
		);

		CREATE INDEX IF NOT EXISTS idx_block_number ON leaf_events(block_number);
		CREATE INDEX IF NOT EXISTS idx_root_cid ON leaf_events(root_cid);
		CREATE INDEX IF NOT EXISTS idx_cid ON leaf_events(cid);

		CREATE TABLE IF NOT EXISTS intermediate_nodes (
			cid TEXT PRIMARY KEY,
			data BLOB NOT NULL,
			pinned BOOLEAN DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS meta (
			key TEXT PRIMARY KEY,
			value TEXT
		);
	`)
}

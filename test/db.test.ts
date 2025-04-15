import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { openOrCreateDatabase, createMetaHandlers, initializeSchema } from "../source/pinner/db.ts"

const TEST_DB_PATH = path.join(__dirname, "testdb.sqlite")

describe("db.ts", () => {
	beforeEach(() => {
		if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH)
	})
	afterEach(() => {
		if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH)
	})

	it("openOrCreateDatabase creates a new database file and sets WAL mode", () => {
		const db = openOrCreateDatabase(TEST_DB_PATH)
		expect(fs.existsSync(TEST_DB_PATH)).toBe(true)
		const mode = db.pragma("journal_mode", { simple: true })
		expect(mode).toBe("wal")
		db.close()
	})

	it("createMetaHandlers can set and get meta values", () => {
		const db = openOrCreateDatabase(TEST_DB_PATH)
		db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
		const { setMeta, getMeta } = createMetaHandlers(db)
		setMeta("foo", "bar")
		expect(getMeta("foo")).toBe("bar")
		expect(getMeta("nonexistent")).toBeUndefined()
		db.close()
	})

	it("initializeSchema creates all required tables and indexes", () => {
		const db = openOrCreateDatabase(TEST_DB_PATH)
		initializeSchema(db)

		// Check that tables exist by querying sqlite_master
		const tables = (db.prepare(
			"SELECT name FROM sqlite_master WHERE type='table'"
		).all() as { name: string }[]).map(row => row.name)

		expect(tables).toContain("leaf_events")
		expect(tables).toContain("intermediate_nodes")
		expect(tables).toContain("meta")

		// Check indexes
		const indexes = (db.prepare(
			"SELECT name FROM sqlite_master WHERE type='index'"
		).all() as { name: string }[]).map(row => row.name)

		expect(indexes).toContain("idx_block_number")
		expect(indexes).toContain("idx_root_cid")
		expect(indexes).toContain("idx_cid")

		db.close()
	})
})


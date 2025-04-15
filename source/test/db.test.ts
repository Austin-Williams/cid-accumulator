import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import { openOrCreateDatabase, createMetaHandlers } from "../pinner/db.ts"

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
})

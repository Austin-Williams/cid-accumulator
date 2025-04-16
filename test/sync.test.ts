import { describe, it, expect, vi, beforeEach } from "vitest"
import { rebuildLocalDagForContiguousLeaves, syncForward } from "../source/pinner/sync.ts"

vi.mock("../source/shared/rpc.ts", () => ({
	retryRpcCall: vi.fn(),
}))
vi.mock("../source/shared/codec.ts", () => ({
	decodeLeafInsert: vi.fn(),
}))

import { retryRpcCall as _retryRpcCall } from "../source/shared/rpc.ts"
import { decodeLeafInsert as _decodeLeafInsert } from "../source/shared/codec.ts"

const retryRpcCall = _retryRpcCall as unknown as ReturnType<typeof vi.fn>
const decodeLeafInsert = _decodeLeafInsert as unknown as ReturnType<typeof vi.fn>

let pinner: any

describe("rebuildLocalDagForContiguousLeaves", () => {
	it("should skip update and insert if all row fields are present (needsUpdate false)", async () => {
		const insertIntermediate = { run: vi.fn() }
		const metaInsert = { run: vi.fn() }
		const update = { run: vi.fn() }
		const select = {
			get: vi.fn().mockReturnValue({
				data: Buffer.from([1]),
				cid: "cid",
				root_cid: "root",
				combine_results: "something",
				right_inputs: "somethingElse",
			}),
		}
		const db = {
			prepare: vi.fn((sql: string) => {
				if (sql.startsWith("SELECT")) return select
				if (sql.startsWith("UPDATE")) return update
				if (sql.startsWith("INSERT OR REPLACE INTO meta")) return metaInsert
				if (sql.startsWith("INSERT")) return insertIntermediate
			}),
		}
		const mmr = {
			addLeafWithTrail: vi.fn().mockResolvedValue({
				leafCID: "cid",
				rootCID: "root",
				combineResultsCIDs: ["c1"],
				rightInputsCIDs: ["r1"],
				combineResultsData: [new Uint8Array([1])],
				peakBaggingCIDs: [],
				peakBaggingData: [],
			}),
		}
		const pinner = {
			db,
			mmr,
			highestContiguousLeafIndex: vi.fn(() => 0),
		}
		await rebuildLocalDagForContiguousLeaves(pinner, 0, 0)
		expect(update.run).not.toHaveBeenCalled()
		expect(insertIntermediate.run).not.toHaveBeenCalled()
	})

	beforeEach(() => {
		insertIntermediate = { run: vi.fn() }
		update = { run: vi.fn() }
		select = { get: vi.fn() }
		db = {
			prepare: vi.fn((sql: string) => {
				if (sql.startsWith("SELECT")) return select
				if (sql.startsWith("UPDATE")) return update
				if (sql.startsWith("INSERT")) return insertIntermediate
			}),
		}
		mmr = {
			addLeafWithTrail: vi.fn().mockResolvedValue({
				leafCID: "cid",
				rootCID: "root",
				combineResultsCIDs: ["c1"],
				rightInputsCIDs: ["r1"],
				combineResultsData: [new Uint8Array([1])],
				peakBaggingCIDs: [],
				peakBaggingData: [],
			}),
		}
		pinner = {
			db,
			mmr,
			highestContiguousLeafIndex: vi.fn(() => 1),
		}
	})

	// --- NEW TEST: peakBaggingCIDs insertion ---
	it("should insert peakBaggingCIDs if present", async () => {
		mmr.addLeafWithTrail.mockResolvedValue({
			leafCID: "cid",
			rootCID: "root",
			combineResultsCIDs: ["c1"],
			rightInputsCIDs: ["r1"],
			combineResultsData: [new Uint8Array([1])],
			peakBaggingCIDs: ["pb1", "pb2"],
			peakBaggingData: [new Uint8Array([2]), new Uint8Array([3])],
		})
		select.get.mockReturnValue({ data: Buffer.from([1]), root_cid: "root" })
		await rebuildLocalDagForContiguousLeaves(pinner, 0, 0)
		expect(insertIntermediate.run).toHaveBeenCalledWith("pb1", new Uint8Array([2]))
		expect(insertIntermediate.run).toHaveBeenCalledWith("pb2", new Uint8Array([3]))
	})

	// --- NEW TEST: rootCID integrity check error ---
	it("should throw if rootCID does not match", async () => {
		select.get.mockReturnValue({ data: Buffer.from([1]), root_cid: "notroot" })
		await expect(rebuildLocalDagForContiguousLeaves(pinner, 0, 0)).rejects.toThrow(
			"Integrity check failed at leafIndex 0: expected rootCID notroot, got root",
		)
	})

	let pinner: any
	let db: any
	let mmr: any
	let select: any
	let update: any
	let insertIntermediate: any

	beforeEach(() => {
		insertIntermediate = { run: vi.fn() }
		update = { run: vi.fn() }
		select = { get: vi.fn() }
		db = {
			prepare: vi.fn((sql: string) => {
				if (sql.startsWith("SELECT")) return select
				if (sql.startsWith("UPDATE")) return update
				if (sql.startsWith("INSERT")) return insertIntermediate
			}),
		}
		mmr = {
			addLeafWithTrail: vi.fn().mockResolvedValue({
				leafCID: "cid",
				rootCID: "root",
				combineResultsCIDs: ["c1"],
				rightInputsCIDs: ["r1"],
				combineResultsData: [new Uint8Array([1])],
				peakBaggingCIDs: [],
				peakBaggingData: [],
			}),
		}
		pinner = {
			db,
			mmr,
			highestContiguousLeafIndex: vi.fn(() => 1),
		}
	})

	it("should skip if endLeaf is null", async () => {
		pinner.highestContiguousLeafIndex = vi.fn(() => null)
		const spy = vi.spyOn(console, "log").mockImplementation(() => {})
		await rebuildLocalDagForContiguousLeaves(pinner)
		expect(spy).toHaveBeenCalledWith("[pinner] No synced leaves to verify.")
		spy.mockRestore()
	})

	it("should skip if startLeaf > endLeaf", async () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {})
		await rebuildLocalDagForContiguousLeaves(pinner, 2, 1)
		expect(spy).toHaveBeenCalledWith("[pinner] No synced leaves to verify.")
		spy.mockRestore()
	})

	it("should warn if leaf is missing", async () => {
		select.get.mockReturnValue(undefined)
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		await rebuildLocalDagForContiguousLeaves(pinner, 0, 0)
		expect(warn).toHaveBeenCalledWith("[pinner] Leaf index 0 missing from DB unexpectedly.")
		warn.mockRestore()
	})

	it("should update and insert intermediates if needed", async () => {
		select.get.mockReturnValue({ data: Buffer.from([1]), root_cid: "root" })
		await rebuildLocalDagForContiguousLeaves(pinner, 0, 0)
		expect(update.run).toHaveBeenCalled()
		expect(insertIntermediate.run).toHaveBeenCalledWith("c1", new Uint8Array([1]))
	})
})

describe("syncForward", () => {
	it("should skip and then throw if logs have leafIndex < and > expectedLeafIndex in one batch (full branch coverage)", async () => {
		const provider = { getBlockNumber: vi.fn().mockResolvedValue(2), getLogs: vi.fn() }
		const processLeafEvent = vi.fn()
		const filters = { LeafInsert: () => ({ foo: "bar" }) }
		const contract = { filters }
		const pinner = { provider, processLeafEvent, contract }
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) return Promise.resolve(2)
			return Promise.resolve([
				{ blockNumber: 1, logIndex: 0 }, // first log
				{ blockNumber: 2, logIndex: 1 }, // second log
			])
		})
		// First call: leafIndex < expectedLeafIndex, second call: leafIndex > expectedLeafIndex
		let callCount = 0
		decodeLeafInsert.mockImplementation(() => {
			callCount++
			if (callCount === 1) return { leafIndex: 0, previousInsertBlockNumber: 0, newData: "0x00" }
			if (callCount === 2) return { leafIndex: 2, previousInsertBlockNumber: 0, newData: "0x00" }
		})
		await expect(syncForward(pinner as any, 0, 0, 2)).rejects.toThrow("LeafIndex gap detected")
		// First log is skipped, second throws, processLeafEvent is never called
		expect(processLeafEvent).not.toHaveBeenCalled()
	})

	// (keep the previous two tests for explicitness)
	it("should skip logs with leafIndex < expectedLeafIndex (continue branch)", async () => {
		const provider = { getBlockNumber: vi.fn().mockResolvedValue(2), getLogs: vi.fn() }
		const processLeafEvent = vi.fn()
		const filters = { LeafInsert: () => ({ foo: "bar" }) }
		const contract = { filters }
		const pinner = { provider, processLeafEvent, contract }
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) return Promise.resolve(2)
			return Promise.resolve([{ blockNumber: 1, logIndex: 0 }])
		})
		// leafIndex < expectedLeafIndex
		decodeLeafInsert.mockReturnValue({ leafIndex: 0, previousInsertBlockNumber: 0, newData: "0x00" })
		await syncForward(pinner as any, 0, 0, 2)
		expect(processLeafEvent).not.toHaveBeenCalled()
	})

	it("should throw if leafIndex > expectedLeafIndex (gap branch)", async () => {
		const provider = { getBlockNumber: vi.fn().mockResolvedValue(2), getLogs: vi.fn() }
		const processLeafEvent = vi.fn()
		const filters = { LeafInsert: () => ({ foo: "bar" }) }
		const contract = { filters }
		const pinner = { provider, processLeafEvent, contract }
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) return Promise.resolve(2)
			return Promise.resolve([{ blockNumber: 1, logIndex: 0 }])
		})
		// leafIndex > expectedLeafIndex
		decodeLeafInsert.mockReturnValue({ leafIndex: 2, previousInsertBlockNumber: 0, newData: "0x00" })
		await expect(syncForward(pinner as any, 0, 0, 2)).rejects.toThrow("LeafIndex gap detected")
	})

	// --- NEW TEST: contract filter object for getLogs ---
	it("should call getLogs with LeafInsert filter", async () => {
		const provider = { getBlockNumber: vi.fn(), getLogs: vi.fn().mockResolvedValue([]) }
		const processLeafEvent = vi.fn().mockResolvedValue(undefined)
		const filters = { LeafInsert: () => ({ foo: "bar" }) }
		const contract = { filters }
		const pinner = { provider, processLeafEvent, contract }
		const spy = vi.spyOn(filters, "LeafInsert")
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) {
				return Promise.resolve(1)
			}
			// Actually call fn to trigger LeafInsert
			return Promise.resolve(fn())
		})
		await syncForward(pinner as any, 0, -1, 2)
		expect(spy).toHaveBeenCalled()
		expect(provider.getLogs).toHaveBeenCalledWith({ foo: "bar", fromBlock: 0, toBlock: 1 })
	})

	let pinner: any
	let provider: any
	let processLeafEvent: any

	beforeEach(async () => {
		provider = { getBlockNumber: vi.fn(), getLogs: vi.fn() }
		processLeafEvent = vi.fn().mockResolvedValue(undefined)
		pinner = {
			provider,
			processLeafEvent,
		}
		// Mock contract.filters.LeafInsert for getLogs
		pinner.contract = {
			filters: {
				LeafInsert: () => ({}),
			},
		}
	})

	it("should process logs in batches", async () => {
		// Only one batch: mock retryRpcCall to return block number 1 and two logs
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) {
				return Promise.resolve(1)
			}
			return Promise.resolve([
				{ blockNumber: 1, data: "0x01" },
				{ blockNumber: 2, data: "0x02" },
			])
		})
		decodeLeafInsert
			.mockReturnValueOnce({ leafIndex: 0, previousInsertBlockNumber: 1, newData: "0x01", blockNumber: 1 })
			.mockReturnValueOnce({ leafIndex: 1, previousInsertBlockNumber: 2, newData: "0x02", blockNumber: 2 })

		await syncForward(pinner, 0, -1, 2)
		expect(processLeafEvent).toHaveBeenCalledTimes(2)
	})

	it("should throw on leaf index gap", async () => {
		// Only one batch: mock retryRpcCall to return block number 1 and two logs
		retryRpcCall.mockImplementation((fn: any) => {
			const fnStr = fn.toString()
			if (fnStr.includes("getBlockNumber")) {
				return Promise.resolve(1)
			}
			return Promise.resolve([
				{ blockNumber: 1, data: "0x01" },
				{ blockNumber: 2, data: "0x02" },
			])
		})
		decodeLeafInsert
			.mockReturnValueOnce({ leafIndex: 0, previousInsertBlockNumber: 1, newData: "0x01", blockNumber: 1 })
			.mockReturnValueOnce({ leafIndex: 2, previousInsertBlockNumber: 2, newData: "0x02", blockNumber: 2 }) // gap!

		await expect(syncForward(pinner, 0, -1, 2)).rejects.toThrow("LeafIndex gap detected")
	})
})

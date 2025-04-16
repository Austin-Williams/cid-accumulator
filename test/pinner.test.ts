import { describe, it, expect, vi, beforeEach } from "vitest"

describe("Pinner", () => {
	beforeEach(async () => {
		// Reset module registry and mocks for each test
		vi.resetModules()

		// Mock ethers
		vi.doMock("ethers", () => {
			const Contract = class {
				constructor() {}
				static getAddress(address: string) {
					return address
				}
				getAccumulatorData = vi.fn().mockResolvedValue([1n << 229n, {}])
			}
			const Interface = class {}
			return {
				ethers: { Contract, Interface },
				Contract,
				Interface,
			}
		})

		// Mock codec
		vi.doMock("../source/shared/codec.ts", () => ({
			decodeLeafInsert: () => ({
				leafCID: "cid",
				rootCID: "rootcid",
				combineResultsCIDs: [],
				rightInputsCIDs: [],
				combineResultsData: [],
				peakBaggingCIDs: [],
				peakBaggingData: [],
			}),
		}))

		// Mock fs.existsSync (can be overridden per test)
		vi.doMock("fs", () => {
			return {
				existsSync: vi.fn(() => false),
				default: { existsSync: vi.fn(() => false) },
			}
		})

		// Mock path
		vi.doMock("path", () => ({
			default: { join: vi.fn((...args: string[]) => args.join("/")) },
			join: vi.fn((...args: string[]) => args.join("/")),
		}))

		// Mock db
		vi.doMock("../source/pinner/db.ts", () => {
			return {
				openOrCreateDatabase: vi.fn(),
				initializeSchema: vi.fn(),
				createMetaHandlers: vi.fn(() => ({
					getMeta: vi.fn(() => undefined),
					setMeta: vi.fn(),
				})),
			}
		})
	})

	it("should create new DB and schema if DB does not exist", async () => {
		vi.resetModules()
		vi.doMock("../source/pinner/db.ts", () => ({
			openOrCreateDatabase: vi.fn(() => ({
				prepare: vi.fn((sql?: string) => ({ run: vi.fn(), all: vi.fn(() => []) })),
			})),
			initializeSchema: vi.fn(),
			createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
		}))
		const fs = await import("fs")
		vi.spyOn(fs, "existsSync").mockReturnValue(false)
		const db = await import("../source/pinner/db.ts")
		const { Pinner } = await import("../source/pinner/Pinner.ts")
		await Pinner.init("0xabc", { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any)
		expect(vi.mocked(db.openOrCreateDatabase)).toHaveBeenCalled()
		expect(vi.mocked(db.initializeSchema)).toHaveBeenCalled()
	})

	it("should load existing DB if present", async () => {
		vi.resetModules()
		vi.doMock("fs", () => ({
			existsSync: vi.fn(() => true),
			default: { existsSync: vi.fn(() => true) },
		}))
		vi.doMock("../source/pinner/db.ts", () => ({
			openOrCreateDatabase: vi.fn(() => ({ prepare: vi.fn(() => ({ all: vi.fn(() => []), run: vi.fn() })) })),
			initializeSchema: vi.fn(),
			createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
		}))
		const db = await import("../source/pinner/db.ts")
		const { Pinner } = await import("../source/pinner/Pinner.ts")
		await Pinner.init("0xabc", { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any)
		expect(vi.mocked(db.openOrCreateDatabase)).toHaveBeenCalled()
		expect(vi.mocked(db.initializeSchema)).not.toHaveBeenCalled()
	})

	it("should insert leaf event and update meta in processLeafEvent", async () => {
		// Patch the db module before calling Pinner.init
		const run = vi.fn()
		const prepare = vi.fn((sql?: string) => ({
			run,
			all: vi.fn(() => []), // Support .all() queries in highestContiguousLeafIndex
		}))
		vi.doMock("../source/pinner/db.ts", () => ({
			openOrCreateDatabase: vi.fn(() => ({ prepare })),
			initializeSchema: vi.fn(),
			createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
		}))

		const { Pinner } = await import("../source/pinner/Pinner.ts")
		const pinner = await Pinner.init("0xabc", { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any)
		pinner.mmr = {
			addLeafWithTrail: vi.fn().mockResolvedValue({
				leafCID: "cid",
				rootCID: "rootcid",
				combineResultsCIDs: [],
				combineResultsData: [],
				peakBaggingCIDs: [],
				peakBaggingData: [],
				leafIndex: 42,
			}),
			peaks: [],
			leafCount: 0,
			rootCIDWithTrail: vi.fn(),
			rootCID: vi.fn(),
		} as any
		pinner.syncedToLeafIndex = 41 // Set to leafIndex - 1 to match increment logic
		await pinner.processLeafEvent({ data: "0x123", leafIndex: 42 } as any)

		// Assert db.prepare called for meta
		expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO meta"))
		// Assert run called with correct args
		expect(run).toHaveBeenCalledWith("lastSyncedLeafIndex", "42")
	})

	it("should update meta with lastSyncedLeafIndex in processLeafEvent", async () => {
		vi.resetModules()
		const runIntermediate = vi.fn()
		const runMeta = vi.fn()
		const prepare = vi.fn((sql: string) => {
			if (sql.includes("meta")) {
				return { run: runMeta, all: vi.fn(() => []) }
			}
			return { run: runIntermediate, all: vi.fn(() => []) }
		})
		vi.doMock("../source/pinner/db.ts", () => ({
			openOrCreateDatabase: vi.fn(() => ({ prepare })),
			initializeSchema: vi.fn(),
			createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
		}))
		const { Pinner } = await import("../source/pinner/Pinner.ts")
		const pinner = await Pinner.init("0xabc", { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any)

		pinner.mmr = {
			addLeafWithTrail: vi.fn().mockResolvedValue({
				leafCID: "cid",
				rootCID: "rootcid",
				combineResultsCIDs: [],
				combineResultsData: [],
				peakBaggingCIDs: [],
				peakBaggingData: [],
				leafIndex: 99,
			}),
			peaks: [],
			leafCount: 0,
			rootCIDWithTrail: vi.fn(),
			rootCID: vi.fn(),
		} as any
		pinner.db = { prepare } as any
		pinner.syncedToLeafIndex = 98 // Set to leafIndex - 1 to match increment logic
		await pinner.processLeafEvent({ data: "0x123", leafIndex: 99 } as any)
		expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO meta"))
		expect(runMeta).toHaveBeenCalledWith("lastSyncedLeafIndex", "99")
	})

	describe("Pinner.init", () => {
		it("should throw if storedAddress does not match normalizedAddress", async () => {
			const mockGetMeta = vi
				.fn()
				.mockImplementationOnce(() => "0xdef") // storedAddress (mismatch)
				.mockImplementationOnce(() => undefined) // storedChainId
				.mockImplementationOnce(() => undefined) // storedDeployBlock
			const mockSetMeta = vi.fn()
			vi.doMock("../source/pinner/db.ts", () => ({
				createMetaHandlers: () => ({ getMeta: mockGetMeta, setMeta: mockSetMeta }),
				initializeSchema: vi.fn(),
				openOrCreateDatabase: vi.fn(() => ({})),
				__esModule: true,
			}))
			const mockGetAccumulatorData = vi.fn().mockResolvedValue([BigInt(0), null])
			vi.doMock("../source/shared/accumulator.ts", () => ({
				getAccumulatorData: mockGetAccumulatorData,
				__esModule: true,
			}))
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const provider = { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any
			await expect(Pinner.init("0xabc", provider)).rejects.toThrow("DB contract address mismatch")
		})
		it("should throw if storedChainId does not match actual chainId", async () => {
			const mockGetMeta = vi
				.fn()
				.mockImplementationOnce(() => undefined) // storedAddress
				.mockImplementationOnce(() => "999") // storedChainId (mismatch)
				.mockImplementationOnce(() => undefined) // storedDeployBlock
			const mockSetMeta = vi.fn()
			vi.doMock("../source/pinner/db.ts", () => ({
				createMetaHandlers: () => ({ getMeta: mockGetMeta, setMeta: mockSetMeta }),
				initializeSchema: vi.fn(),
				openOrCreateDatabase: vi.fn(() => ({})),
				__esModule: true,
			}))
			const mockGetAccumulatorData = vi.fn().mockResolvedValue([BigInt(0), null])
			vi.doMock("../source/shared/accumulator.ts", () => ({
				getAccumulatorData: mockGetAccumulatorData,
				__esModule: true,
			}))
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const provider = { getNetwork: vi.fn().mockResolvedValue({ chainId: 123 }) } as any
			await expect(Pinner.init("0xabc", provider)).rejects.toThrow("DB chain ID mismatch")
		})

		it("should throw if storedDeployBlock does not match computed deployBlockNumber", async () => {
			const mockGetMeta = vi
				.fn()
				.mockImplementationOnce(() => undefined) // storedAddress
				.mockImplementationOnce(() => undefined) // storedChainId
				.mockImplementationOnce(() => "1234") // storedDeployBlock (mismatch)
			const mockSetMeta = vi.fn()
			vi.doMock("../source/pinner/db.ts", () => ({
				createMetaHandlers: () => ({ getMeta: mockGetMeta, setMeta: mockSetMeta }),
				initializeSchema: vi.fn(),
				openOrCreateDatabase: vi.fn(() => ({})),
				__esModule: true,
			}))
			const mockGetAccumulatorData = vi.fn().mockResolvedValue([BigInt(5678 << 229), null])
			vi.doMock("../source/shared/accumulator.ts", () => ({
				getAccumulatorData: mockGetAccumulatorData,
				__esModule: true,
			}))
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const provider = { getNetwork: vi.fn().mockResolvedValue({ chainId: 1 }) } as any
			await expect(Pinner.init("0xabc", provider)).rejects.toThrow("DB deployBlockNumber mismatch")
		})
	})

	describe("getAccumulatorData", () => {
		it("should call getAccumulatorData with provider and contractAddress", async () => {
			const mockGetAccumulatorData = vi.fn().mockResolvedValue({ foo: "bar" })
			vi.doMock("../source/shared/accumulator.ts", () => ({
				getAccumulatorData: mockGetAccumulatorData,
				__esModule: true,
			}))
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const pinner = new Pinner()
			pinner.provider = {} as any
			pinner.contractAddress = "0xabc"
			const result = await pinner.getAccumulatorData()
			expect(mockGetAccumulatorData).toHaveBeenCalledWith(pinner.provider, pinner.contractAddress)
			expect(result).toEqual({ foo: "bar" })
		})
	})

	describe("rebuildLocalDag", () => {
		it("should call rebuildLocalDag with correct args", async () => {
			const mockRebuild = vi.fn().mockResolvedValue(undefined)
			vi.doMock("../source/pinner/sync.ts", () => ({
				rebuildLocalDag: mockRebuild,
				__esModule: true,
			}))
			vi.doMock("../source/pinner/db.ts", () => ({
				openOrCreateDatabase: vi.fn(() => ({ prepare: vi.fn(() => ({ all: vi.fn(() => []), run: vi.fn() })) })),
				initializeSchema: vi.fn(),
				createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
			}))
			vi.resetModules()
			vi.doMock("../source/pinner/db.ts", () => ({
				openOrCreateDatabase: vi.fn(() => ({ prepare: vi.fn(() => ({ all: vi.fn(() => []), run: vi.fn() })) })),
				initializeSchema: vi.fn(),
				createMetaHandlers: vi.fn(() => ({ getMeta: vi.fn(), setMeta: vi.fn() })),
			}))
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const pinner = new Pinner()
			// Assign a mock db property so pinner.db.prepare exists and select.get works
			pinner.db = {
				prepare: vi.fn(() => ({
					all: vi.fn(() => []),
					run: vi.fn(),
					get: vi.fn(() => ({ data: Buffer.from([]), root_cid: "", combine_results: "", right_inputs: "" })),
				})),
			} as any
			pinner.highestContiguousLeafIndex = vi.fn().mockReturnValue(5)
			// Mock addLeafWithTrail to avoid leafCount errors
			pinner.mmr.addLeafWithTrail = vi.fn().mockResolvedValue({
				leafCID: "",
				rootCID: "",
				combineResultsCIDs: [],
				combineResultsData: [],
				rightInputsCIDs: [],
				peakBaggingCIDs: [],
				peakBaggingData: [],
			})
			pinner.syncedToLeafIndex = 0
			// Mock processLeafEvent to avoid leafIndex/syncedToLeafIndex errors
			pinner.processLeafEvent = vi.fn().mockResolvedValue(undefined)
			// Mock rootCID to match the mock DB's root_cid
			pinner.mmr.rootCID = vi.fn().mockResolvedValue({ toString: () => "" })
			await pinner.rebuildLocalDag(1, 4)
			expect(mockRebuild).toHaveBeenCalledWith(pinner, 1, 4)
		})
	})

	describe("syncForward", () => {
		it("should call syncForward with correct arguments", async () => {
			const syncForwardMock = vi.fn()
			vi.doMock("../source/pinner/sync.ts", () => ({
				syncForward: syncForwardMock,
				__esModule: true,
			}))

			const { Pinner } = await import("../source/pinner/Pinner.ts")
			const pinner = new Pinner()

			await pinner.syncForward(10, 5, 100)

			expect(syncForwardMock).toHaveBeenCalledWith(pinner, 10, 5, 100)
		})
	})

	describe("highestContiguousLeafIndex", () => {
		let pinner: any
		beforeEach(async () => {
			const { Pinner } = await import("../source/pinner/Pinner.ts")
			pinner = new Pinner()
		})
		it("should return null for no rows", () => {
			pinner.db = { prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }) } as any
			expect(pinner.highestContiguousLeafIndex()).toBeNull()
		})
		it("should return highest index for contiguous rows", () => {
			pinner.db = {
				prepare: vi
					.fn()
					.mockReturnValue({ all: vi.fn().mockReturnValue([{ leaf_index: 0 }, { leaf_index: 1 }, { leaf_index: 2 }]) }),
			} as any
			expect(pinner.highestContiguousLeafIndex()).toBe(2)
		})
		it("should return index before gap", () => {
			pinner.db = {
				prepare: vi
					.fn()
					.mockReturnValue({ all: vi.fn().mockReturnValue([{ leaf_index: 0 }, { leaf_index: 2 }, { leaf_index: 3 }]) }),
			} as any
			expect(pinner.highestContiguousLeafIndex()).toBe(0)
		})
		it("should return null for no rows", () => {
			pinner.db = { prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }) } as any
			expect(pinner.highestContiguousLeafIndex()).toBeNull()
		})
		it("should return highest index for contiguous rows", () => {
			pinner.db = {
				prepare: vi
					.fn()
					.mockReturnValue({ all: vi.fn().mockReturnValue([{ leaf_index: 0 }, { leaf_index: 1 }, { leaf_index: 2 }]) }),
			} as any
			expect(pinner.highestContiguousLeafIndex()).toBe(2)
		})
		it("should return index before gap", () => {
			pinner.db = {
				prepare: vi
					.fn()
					.mockReturnValue({ all: vi.fn().mockReturnValue([{ leaf_index: 0 }, { leaf_index: 2 }, { leaf_index: 3 }]) }),
			} as any
			expect(pinner.highestContiguousLeafIndex()).toBe(0)
		})
		it("should return null if first row missing", () => {
			pinner.db = {
				prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([{ leaf_index: 1 }, { leaf_index: 2 }]) }),
			} as any
			expect(pinner.highestContiguousLeafIndex()).toBeNull()
		})
	})
})

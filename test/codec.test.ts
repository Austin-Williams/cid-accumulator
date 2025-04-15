// test/codec.test.ts
import { test, expect } from "vitest"
import { encodeBlock, decodeLeafInsert } from "../source/shared/codec.ts"
import { MINIMAL_ACCUMULATOR_INTERFACE } from "../source/shared/constants.ts"
import type { Log } from "ethers"
import { vi } from "vitest"

test("encodeBlock encodes value into CID and bytes", async () => {
	const input = { foo: "bar" }
	const { cid, bytes } = await encodeBlock(input)

	expect(cid).toBeDefined()
	expect(bytes).toBeInstanceOf(Uint8Array)
	expect(bytes.length).toBeGreaterThan(0)
})

test("decodeLeafInsert parses valid LeafInsert log", () => {
	const iface = MINIMAL_ACCUMULATOR_INTERFACE
	const event = iface.getEvent("LeafInsert")
	if (!event) throw new Error("LeafInsert event not found in ABI")

	const log = iface.encodeEventLog(event, [
		1,
		64,
		"0x1234",
		["0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"],
		["0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa"],
	])

	const wrappedLog: Partial<Log> = {
		topics: log.topics,
		data: log.data,
		address: "0x1234567890abcdef1234567890abcdef12345678",
	}

	const result = decodeLeafInsert(wrappedLog as Log)

	expect(result.leafIndex).toBe(1)
	expect(result.previousInsertBlockNumber).toBe(64)
	expect(result.newData).toBe("0x1234")
	expect(result.combineResults).toEqual(["0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"])
	expect(result.rightInputs).toEqual(["0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa"])
})

test("decodeLeafInsert throws on malformed log", () => {
	const badLog = {
		topics: [],
		data: "0x",
		address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
	}

	// Cast through `unknown` to suppress strict type complaints in test
	expect(() => decodeLeafInsert(badLog as unknown as Log)).toThrow(/Unexpected or unrecognized log/)
})

test("decodeLeafInsert throws if parsed log event name is not LeafInsert", () => {
	const iface = MINIMAL_ACCUMULATOR_INTERFACE
	const event = iface.getEvent("LeafInsert")
	if (!event) throw new Error("LeafInsert event not found in ABI")

	const log = iface.encodeEventLog(event, [1, 64, "0x1234", [], []])

	const wrappedLog: Log = {
		topics: log.topics,
		data: log.data,
		address: "0x1234567890abcdef1234567890abcdef12345678",
		blockNumber: 123,
		transactionHash: "0xabcdef",
		blockHash: "0xdeadbeef",
		removed: false,
		index: 0,

		transactionIndex: 0,
		provider: null as unknown as import("ethers").Provider,
		toJSON: () => ({}),
		getBlock: async () => ({}) as any,
		getTransaction: async () => ({}) as any,
		getTransactionReceipt: async () => ({}) as any,
		removedEvent: () => ({}) as any,
	}

	const fakeResult = {
		name: "NotLeafInsert",
		args: {},
		event: undefined,
		eventSignature: undefined,
		signature: undefined,
		raw: undefined,
		decode: undefined,
		decodeError: undefined,
	} as unknown as ReturnType<typeof iface.parseLog>

	const spy = vi.spyOn(iface, "parseLog").mockReturnValue(fakeResult)

	expect(() => decodeLeafInsert(wrappedLog as Log)).toThrow(/Unexpected or unrecognized log/)

	spy.mockRestore()
})

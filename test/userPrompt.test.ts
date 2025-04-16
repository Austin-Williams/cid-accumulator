import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Helper to mock readline
function mockReadline(answers: string[]) {
	let call = 0
	const rl = {
		question: vi.fn((_q: string) => Promise.resolve(answers[call++])),
		close: vi.fn(),
	}
	const createInterface = vi.fn(() => rl)
	vi.doMock("readline/promises", () => ({
		default: { createInterface },
		createInterface,
	}))
	return rl
}

describe("promptYesNo", () => {
	let originalExit: any
	let exitMock: any
	beforeEach(() => {
		vi.resetModules()
		exitMock = vi.fn((code?: number) => {
			throw new Error(`exit:${code}`)
		})
		originalExit = process.exit
		// @ts-ignore
		process.exit = exitMock
	})
	afterEach(() => {
		// @ts-ignore
		process.exit = originalExit
		vi.clearAllMocks()
	})

	function mockReadline(answers: string[]) {
		let call = 0
		const rl = {
			question: vi.fn((_q: string) => Promise.resolve(answers[call++])),
			close: vi.fn(),
		}
		const createInterface = vi.fn(() => rl)
		vi.doMock("readline/promises", () => ({
			default: { createInterface },
			createInterface,
		}))
		return rl
	}

	it("accepts y as yes", async () => {
		mockReadline(["y"])
		const { promptYesNo } = await import("../source/shared/userPrompt.ts")
		const result = await promptYesNo("Proceed?")
		expect(result).toBe(true)
	})

	it("accepts yes as yes", async () => {
		mockReadline(["yes"])
		const { promptYesNo } = await import("../source/shared/userPrompt.ts")
		const result = await promptYesNo("Proceed?")
		expect(result).toBe(true)
	})

	it("accepts n as no", async () => {
		mockReadline(["n"])
		const { promptYesNo } = await import("../source/shared/userPrompt.ts")
		const result = await promptYesNo("Proceed?")
		expect(result).toBe(false)
	})

	it("accepts no as no", async () => {
		mockReadline(["no"])
		const { promptYesNo } = await import("../source/shared/userPrompt.ts")
		const result = await promptYesNo("Proceed?")
		expect(result).toBe(false)
	})

	it("reprompts on invalid input", async () => {
		mockReadline(["maybe", "yes"])
		const { promptYesNo } = await import("../source/shared/userPrompt.ts")
		const result = await promptYesNo("Proceed?")
		expect(result).toBe(true)
	})
})

describe("promptUserChoice", () => {
	it("returns any input if acceptableValues is empty and abortOnInvalid is false", async () => {
		mockReadline(["42"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		const result = await promptUserChoice("Enter a number:", [], false)
		expect(result).toBe("42")
	})

	it("validates input if acceptableValues is non-empty", async () => {
		mockReadline(["nope", "yes"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		const result = await promptUserChoice("Pick:", ["yes", "no"], false)
		expect(result).toBe("yes")
	})

	it("aborts if abortOnInvalid is true and input is invalid", async () => {
		mockReadline(["bad"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		await expect(promptUserChoice("Pick:", ["a", "b"], true)).rejects.toThrow("exit:1")
	})
	let originalExit: any
	let exitMock: any
	beforeEach(() => {
		vi.resetModules()
		exitMock = vi.fn((code?: number) => {
			throw new Error(`exit:${code}`)
		})
		originalExit = process.exit
		// @ts-ignore
		process.exit = exitMock
	})
	afterEach(() => {
		// @ts-ignore
		process.exit = originalExit
		vi.clearAllMocks()
	})

	it("returns valid input", async () => {
		mockReadline(["2"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		const result = await promptUserChoice("Pick:", ["1", "2", "3"])
		expect(result).toBe("2")
	})

	it("aborts on invalid input if abortOnInvalid is true", async () => {
		mockReadline(["x"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		await expect(promptUserChoice("Pick:", ["1", "2"], true)).rejects.toThrow("exit:1")
		expect(exitMock).toHaveBeenCalledWith(1)
	})

	it("re-prompts on invalid input if abortOnInvalid is false", async () => {
		mockReadline(["x", "2"])
		const { promptUserChoice } = await import("../source/shared/userPrompt.ts")
		const result = await promptUserChoice("Pick:", ["1", "2"], false)
		expect(result).toBe("2")
	})
})

import { test, expect, vi } from "vitest"
import { retryRpcCall } from "../source/shared/rpc.ts"

test("retryRpcCall returns result on first try", async () => {
	const mockFn = vi.fn().mockResolvedValue("ok")
	const result = await retryRpcCall(mockFn)
	expect(result).toBe("ok")
	expect(mockFn).toHaveBeenCalledTimes(1)
})

test("retryRpcCall retries on failure and eventually succeeds", async () => {
	const mockFn = vi
		.fn()
		.mockRejectedValueOnce(new Error("fail 1"))
		.mockRejectedValueOnce(new Error("fail 2"))
		.mockResolvedValue("success on 3rd try")

	const result = await retryRpcCall(mockFn, 3, 10)
	expect(result).toBe("success on 3rd try")
	expect(mockFn).toHaveBeenCalledTimes(3)
})

test("retryRpcCall throws after max retries", async () => {
	const mockFn = vi.fn().mockRejectedValue(new Error("permanent failure"))

	await expect(retryRpcCall(mockFn, 2, 5)).rejects.toThrow("permanent failure")
	expect(mockFn).toHaveBeenCalledTimes(3) // initial + 2 retries
})

test("retryRpcCall respects backoff and jitter", async () => {
	const mockFn = vi.fn().mockRejectedValue(new Error("fail"))

	// Override Math.random to a fixed value to make backoff predictable
	vi.spyOn(global.Math, "random").mockReturnValue(0.5)

	// Spy on setTimeout so we don't actually delay
	const timeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation((fn) => {
		// @ts-ignore
		fn()
		return 0 as unknown as NodeJS.Timeout
	})

	await expect(retryRpcCall(mockFn, 1, 10)).rejects.toThrow()

	expect(timeoutSpy).toHaveBeenCalled()
	expect(timeoutSpy.mock.calls[0][1]).toBeGreaterThanOrEqual(10) // base backoff
	expect(timeoutSpy.mock.calls[0][1]).toBeLessThanOrEqual(10 * 2 + 1000) // + jitter

	// Restore mocked functions
	timeoutSpy.mockRestore()
	vi.restoreAllMocks()
})

import { describe, it, expect } from "vitest"
import * as pinnerIndex from "../source/pinner/index.ts"

describe("pinner/index.ts", () => {
	it("should re-export Pinner and other modules without error", () => {
		// Check Pinner class exists
		expect(typeof pinnerIndex.Pinner).toBe("function")
		// Instantiate Pinner (basic smoke test)
		// Do not call any methods or access DB properties on a raw Pinner instance!
		// For DB operations, always use: await Pinner.init(...)
		const pinner = new pinnerIndex.Pinner()
		expect(pinner).toBeInstanceOf(pinnerIndex.Pinner)

		// Check that a function from sync.ts is present
		expect(typeof pinnerIndex.syncForward).toBe("function")
	})
})

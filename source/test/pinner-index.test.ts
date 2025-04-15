import { describe, it, expect } from "vitest"
import * as pinnerIndex from "../pinner/index.ts"

describe("pinner/index.ts", () => {
  it("should re-export Pinner and other modules without error", () => {
    // Check Pinner class exists
    expect(typeof pinnerIndex.Pinner).toBe("function")
    // Instantiate Pinner (basic smoke test)
    const pinner = new pinnerIndex.Pinner()
    expect(pinner).toBeInstanceOf(pinnerIndex.Pinner)
  
    // Check that a function from sync.ts is present
    expect(typeof pinnerIndex.syncFromEvents).toBe("function")
  })
})

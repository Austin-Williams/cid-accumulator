import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper to mock readline
function mockReadline(answers: string[]) {
  let call = 0
  const rl = {
    question: vi.fn((_q: string) => Promise.resolve(answers[call++])),

    close: vi.fn()
  }
  const createInterface = vi.fn(() => rl)
  vi.doMock('readline/promises', () => ({
    default: { createInterface },
    createInterface
  }))
  return rl
}

describe('promptUserChoice', () => {
  let originalExit: any
  let exitMock: any
  beforeEach(() => {
    vi.resetModules()
    exitMock = vi.fn((code?: number) => { throw new Error(`exit:${code}`); })
    originalExit = process.exit
    // @ts-ignore
    process.exit = exitMock
  })
  afterEach(() => {
    // @ts-ignore
    process.exit = originalExit
    vi.clearAllMocks()
  })

  it('returns valid input', async () => {
    mockReadline(['2'])
    const { promptUserChoice } = await import('../shared/userPrompt.ts')
    const result = await promptUserChoice('Pick:', ['1', '2', '3'])
    expect(result).toBe('2')
  })

  it('aborts on invalid input if abortOnInvalid is true', async () => {
    mockReadline(['x'])
    const { promptUserChoice } = await import('../shared/userPrompt.ts')
    await expect(promptUserChoice('Pick:', ['1', '2'], true)).rejects.toThrow('exit:1')
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('re-prompts on invalid input if abortOnInvalid is false', async () => {
    mockReadline(['x', '2'])
    const { promptUserChoice } = await import('../shared/userPrompt.ts')
    const result = await promptUserChoice('Pick:', ['1', '2'], false)
    expect(result).toBe('2')
  })
})

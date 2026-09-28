/**
 * Unit tests for src/main.ts. `@actions/core` is replaced by the fixture in
 * __fixtures__/core.ts so that tests never touch a real runner.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { run, parseMode } = await import('../src/main.js')

describe('parseMode', () => {
  it('defaults to shadow when the input is empty', () => {
    expect(parseMode('')).toBe('shadow')
  })

  it.each(['shadow', 'opt-in'])('accepts %s', (mode) => {
    expect(parseMode(mode)).toBe(mode)
  })

  it.each(['default-on', 'SHADOW', 'approve'])('rejects %s', (mode) => {
    expect(() => parseMode(mode)).toThrow(/Unknown mode/)
  })
})

describe('run', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('reports the mode it is running in', async () => {
    core.getInput.mockReturnValue('opt-in')

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('mode', 'opt-in')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('fails the step on an unknown mode', async () => {
    core.getInput.mockReturnValue('default-on')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Unknown mode "default-on"/)
    )
  })
})

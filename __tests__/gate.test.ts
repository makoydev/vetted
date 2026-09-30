import { decide, parseMode, type GateInput } from '../src/gate.js'

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

describe('decide', () => {
  const base: GateInput = {
    mode: 'opt-in',
    action: 'opened',
    labels: ['ai-review'],
    reviewLabel: 'ai-review',
    isFork: false,
    hasApiKey: true
  }

  // mode × label × fork × key: what may this run do?
  it.each`
    mode        | labels           | isFork   | hasApiKey | run      | post     | real
    ${'shadow'} | ${[]}            | ${false} | ${true}   | ${true}  | ${false} | ${true}
    ${'shadow'} | ${['ai-review']} | ${false} | ${true}   | ${true}  | ${false} | ${true}
    ${'shadow'} | ${[]}            | ${true}  | ${true}   | ${true}  | ${false} | ${false}
    ${'shadow'} | ${[]}            | ${false} | ${false}  | ${true}  | ${false} | ${false}
    ${'opt-in'} | ${[]}            | ${false} | ${true}   | ${false} | ${false} | ${false}
    ${'opt-in'} | ${['other']}     | ${false} | ${true}   | ${false} | ${false} | ${false}
    ${'opt-in'} | ${['ai-review']} | ${false} | ${true}   | ${true}  | ${true}  | ${true}
    ${'opt-in'} | ${['ai-review']} | ${true}  | ${true}   | ${true}  | ${true}  | ${false}
    ${'opt-in'} | ${['ai-review']} | ${false} | ${false}  | ${true}  | ${true}  | ${false}
  `(
    '$mode, labels $labels, fork $isFork, key $hasApiKey → run $run, post $post, real model $real',
    ({ mode, labels, isFork, hasApiKey, run, post, real }) => {
      const decision = decide({ ...base, mode, labels, isFork, hasApiKey })
      expect(decision).toMatchObject({
        run,
        postComments: post,
        useRealModel: real
      })
    }
  )

  it('never posts comments in shadow mode, whatever the labels', () => {
    for (const labels of [[], ['ai-review'], ['ai-review', 'x']]) {
      expect(decide({ ...base, mode: 'shadow', labels }).postComments).toBe(
        false
      )
    }
  })

  it('does not re-run when an unrelated label is added in opt-in mode', () => {
    const decision = decide({
      ...base,
      action: 'labeled',
      eventLabel: 'bug',
      labels: ['ai-review', 'bug']
    })
    expect(decision.run).toBe(false)
  })

  it('runs when the review label itself is added', () => {
    const decision = decide({
      ...base,
      action: 'labeled',
      eventLabel: 'ai-review'
    })
    expect(decision.run).toBe(true)
  })

  it('explains why fork pull requests use the mock model', () => {
    expect(decide({ ...base, isFork: true }).reason).toMatch(/Fork/)
  })
})

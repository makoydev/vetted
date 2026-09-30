import {
  parseModelOutput,
  placeFindings,
  type Finding
} from '../src/findings.js'
import type { PreparedFile } from '../src/pipeline/index.js'

const finding: Finding = {
  path: 'src/a.ts',
  line: 2,
  severity: 'medium',
  confidence: 'high',
  category: 'bug',
  title: 'Off-by-one',
  rationale: 'The loop skips the last element.'
}
const valid = (findings: unknown[] = [finding]) =>
  JSON.stringify({ summary: 'ok', findings })

describe('parseModelOutput', () => {
  it('accepts output that matches the schema', () => {
    expect(parseModelOutput(valid())).toEqual({
      ok: true,
      summary: 'ok',
      findings: [finding]
    })
  })

  it.each([
    ['no text', null],
    ['text that is not JSON', 'Sure! Here are my findings: ...'],
    ['an extra field', valid([{ ...finding, approve: true }])],
    ['a missing field', valid([{ ...finding, rationale: undefined }])],
    ['an unknown severity', valid([{ ...finding, severity: 'critical' }])],
    [
      'a title longer than 120 characters',
      valid([{ ...finding, title: 'x'.repeat(121) }])
    ],
    ['more than 10 findings', valid(Array(11).fill(finding))],
    ['a line of 0', valid([{ ...finding, line: 0 }])],
    [
      'a top-level extra field',
      JSON.stringify({ summary: 'ok', findings: [], decision: 'APPROVE' })
    ]
  ])('rejects %s', (_, text) => {
    expect(parseModelOutput(text as string | null).ok).toBe(false)
  })
})

describe('placeFindings', () => {
  const files = [
    { path: 'src/a.ts', commentable: new Set([1, 2, 3]) }
  ] as PreparedFile[]

  it('keeps findings on commentable lines inline and moves the rest to the body', () => {
    const placed = placeFindings(
      [
        finding,
        { ...finding, line: 40 },
        { ...finding, path: 'src/elsewhere.ts' }
      ],
      files
    )
    expect(placed.inline).toEqual([finding])
    expect(placed.general).toHaveLength(2)
  })

  it('orders by severity, then confidence', () => {
    const low = { ...finding, severity: 'low' as const }
    const high = {
      ...finding,
      severity: 'high' as const,
      confidence: 'low' as const
    }
    const highSure = { ...finding, severity: 'high' as const }
    expect(placeFindings([low, high, highSure], files).inline).toEqual([
      highSure,
      high,
      low
    ])
  })
})

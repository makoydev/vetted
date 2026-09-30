import { parsePatch } from '../src/diff/patch.js'
import { applySpans, joinLines, mergeSpans } from '../src/pipeline/redact.js'

describe('mergeSpans', () => {
  it('merges overlapping spans and keeps the label of the longer one', () => {
    expect(
      mergeSpans([
        { start: 5, end: 10, label: 'short' },
        { start: 0, end: 20, label: 'long' },
        { start: 30, end: 35, label: 'apart' }
      ])
    ).toEqual([
      { start: 0, end: 20, label: 'long' },
      { start: 30, end: 35, label: 'apart' }
    ])
  })

  it('merges a chain of overlaps into one span', () => {
    expect(
      mergeSpans([
        { start: 0, end: 4, label: 'a' },
        { start: 3, end: 8, label: 'b' },
        { start: 7, end: 9, label: 'c' }
      ])
    ).toEqual([{ start: 0, end: 9, label: 'b' }])
  })
})

describe('applySpans', () => {
  const lines = parsePatch(
    '@@ -0,0 +1,3 @@\n+key = abc123\n+-----BEGIN KEY-----\n+MIIsecret\n'
  )

  it('replaces a span within one line', () => {
    const { text } = joinLines(lines)
    const start = text.indexOf('abc123')
    const out = applySpans(lines, [
      { start, end: start + 6, label: 'SECRET:x' }
    ])
    expect(out[1].text).toBe('key = <SECRET:x>')
    expect(out[1].newLine).toBe(1)
  })

  it('replaces a multi-line span on every line it touches, keeping line numbers', () => {
    const { text } = joinLines(lines)
    const start = text.indexOf('-----BEGIN')
    const end = text.indexOf('secret') + 'secret'.length
    const out = applySpans(lines, [{ start, end, label: 'SECRET:private-key' }])
    expect(out.map((l) => l.text)).toEqual([
      '@@ -0,0 +1,3 @@',
      'key = abc123',
      '<SECRET:private-key>',
      '<SECRET:private-key>'
    ])
    expect(out.map((l) => l.newLine)).toEqual([undefined, 1, 2, 3])
  })

  it('leaves text untouched when there is nothing to replace', () => {
    expect(applySpans(lines, [])).toBe(lines)
  })
})

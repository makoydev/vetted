import type { PatchLine } from '../diff/patch.js'

/** A region of a file's scannable text to replace with `<label>`. */
export interface Span {
  start: number
  end: number
  label: string
}

/** Lines a scrubber looks at: everything except "\ No newline" markers. */
const scanned = (line: PatchLine) => line.kind !== 'meta'

/**
 * Joins a file's lines into one text, so multi-line secrets such as private
 * keys can be matched, and records where each line starts.
 */
export function joinLines(lines: PatchLine[]): {
  text: string
  starts: number[]
} {
  const starts: number[] = []
  let offset = 0
  const parts: string[] = []
  for (const line of lines) {
    starts.push(scanned(line) ? offset : -1)
    if (scanned(line)) {
      parts.push(line.text)
      offset += line.text.length + 1
    }
  }
  return { text: parts.join('\n'), starts }
}

/**
 * Merges overlapping spans. The merged span covers both, and keeps the
 * label of the longer original (the earlier one on a tie).
 */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: (Span & { longest: number })[] = []
  for (const span of sorted) {
    const last = merged.at(-1)
    const length = span.end - span.start
    if (last && span.start < last.end) {
      if (length > last.longest) {
        last.label = span.label
        last.longest = length
      }
      last.end = Math.max(last.end, span.end)
    } else {
      merged.push({ ...span, longest: length })
    }
  }
  return merged.map(({ start, end, label }) => ({ start, end, label }))
}

/**
 * Replaces every span with `<label>`. A span that crosses lines is replaced
 * on each line it touches, so the line structure (and line numbers) of the
 * diff never change.
 */
export function applySpans(lines: PatchLine[], spans: Span[]): PatchLine[] {
  if (spans.length === 0) return lines
  const merged = mergeSpans(spans)
  const { starts } = joinLines(lines)

  return lines.map((line, i) => {
    const lineStart = starts[i]
    if (lineStart === -1) return line
    const lineEnd = lineStart + line.text.length
    let text = ''
    let cursor = 0
    for (const span of merged) {
      if (span.end <= lineStart || span.start >= lineEnd) continue
      const from = Math.max(span.start, lineStart) - lineStart
      const to = Math.min(span.end, lineEnd) - lineStart
      text += line.text.slice(cursor, from) + `<${span.label}>`
      cursor = to
    }
    if (cursor === 0 && text === '') return line
    return { ...line, text: text + line.text.slice(cursor) }
  })
}

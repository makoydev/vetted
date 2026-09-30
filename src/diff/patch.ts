export type PatchLineKind = 'hunk' | 'add' | 'del' | 'context' | 'meta'

export interface PatchLine {
  kind: PatchLineKind
  /** The line's text without its leading `+`, `-` or space. */
  text: string
  /** Line number in the new file (added and context lines). */
  newLine?: number
  /** Line number in the old file (deleted and context lines). */
  oldLine?: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Parses the unified diff GitHub returns for one file into numbered lines. */
export function parsePatch(patch: string): PatchLine[] {
  const lines: PatchLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of patch.split('\n')) {
    const header = HUNK_HEADER.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      lines.push({ kind: 'hunk', text: raw })
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), newLine: newLine++ })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1), oldLine: oldLine++ })
    } else if (raw.startsWith(' ')) {
      lines.push({
        kind: 'context',
        text: raw.slice(1),
        oldLine: oldLine++,
        newLine: newLine++
      })
    } else if (raw !== '') {
      // "\ No newline at end of file" and anything unexpected.
      lines.push({ kind: 'meta', text: raw })
    }
  }
  return lines
}

/**
 * New-file line numbers a review comment can be attached to. GitHub rejects
 * a whole review if any comment points outside the diff, so findings are
 * checked against this set before posting.
 */
export function commentableLines(lines: PatchLine[]): Set<number> {
  const result = new Set<number>()
  for (const line of lines) {
    if (line.newLine !== undefined) result.add(line.newLine)
  }
  return result
}

/**
 * Renders one file for the model, with new-file line numbers so findings
 * can point at a line. Deleted lines have no new line number.
 */
export function renderFile(
  path: string,
  status: string,
  lines: PatchLine[]
): string {
  const out = [`FILE: ${path} (${status})`]
  for (const line of lines) {
    switch (line.kind) {
      case 'hunk':
        out.push(line.text)
        break
      case 'add':
        out.push(`${String(line.newLine).padStart(6)} +${line.text}`)
        break
      case 'context':
        out.push(`${String(line.newLine).padStart(6)}  ${line.text}`)
        break
      case 'del':
        out.push(`${''.padStart(6)} -${line.text}`)
        break
      case 'meta':
        out.push(line.text)
        break
    }
  }
  return out.join('\n')
}

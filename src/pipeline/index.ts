import type { VettedConfig } from '../config.js'
import {
  commentableLines,
  parsePatch,
  renderFile,
  type PatchLine
} from '../diff/patch.js'
import type { ChangedFile } from '../github.js'
import { pathRules, type SkipReason } from './paths.js'
import { applySpans, joinLines, mergeSpans, type Span } from './redact.js'

/** Something that finds sensitive regions in a file's text. */
export interface Scrubber {
  /** Report key, for example `secrets` or `pii`. */
  kind: 'secrets' | 'pii'
  find(text: string, path: string): Span[]
}

export interface PreparedFile {
  path: string
  status: string
  /** The file's lines after scrubbing. */
  lines: PatchLine[]
  /** New-file line numbers a comment may point at. */
  commentable: Set<number>
  /** Exactly what is sent to the model for this file. */
  rendered: string
}

/** Counts only. The report must never contain a scrubbed value. */
export interface ScrubReport {
  filesInPullRequest: number
  filesSent: number
  filesSkipped: { path: string; reason: SkipReason }[]
  /** Replacements per label, for example `{ "SECRET:aws-access-token": 1 }`. */
  secrets: Record<string, number>
  pii: Record<string, number>
  charsSent: number
}

export interface PipelineResult {
  files: PreparedFile[]
  report: ScrubReport
}

type Limits = Pick<VettedConfig, 'maxFiles' | 'maxDiffChars' | 'paths'>

/**
 * The pre-send pipeline: path rules, then scrubbing, then the size and file
 * caps. Files that don't fit are skipped whole and listed, never truncated
 * silently.
 */
export function runPipeline(
  changed: ChangedFile[],
  config: Limits,
  scrubbers: Scrubber[]
): PipelineResult {
  const rules = pathRules(config.paths)
  const report: ScrubReport = {
    filesInPullRequest: changed.length,
    filesSent: 0,
    filesSkipped: [],
    secrets: {},
    pii: {},
    charsSent: 0
  }
  const files: PreparedFile[] = []

  for (const file of changed) {
    const skip = (reason: SkipReason) =>
      report.filesSkipped.push({ path: file.path, reason })

    const denied = rules.check(file.path)
    if (denied) {
      skip(denied)
      continue
    }
    if (file.status === 'removed') {
      skip('removed')
      continue
    }
    if (file.patch === undefined || file.patch === '') {
      skip('binary-or-too-large')
      continue
    }
    if (files.length >= config.maxFiles) {
      skip('file-cap')
      continue
    }
    // A file this large can't fit even after scrubbing; don't spend time on it.
    if (file.patch.length > config.maxDiffChars * 2) {
      skip('size-cap')
      continue
    }

    const parsed = parsePatch(file.patch)
    const { text } = joinLines(parsed)
    const spans: Span[] = []
    const fileCounts = { secrets: {}, pii: {} } as Record<
      Scrubber['kind'],
      Record<string, number>
    >
    for (const scrubber of scrubbers) {
      const found = scrubber.find(text, file.path)
      spans.push(...found)
      for (const span of mergeSpans(found)) {
        increment(fileCounts[scrubber.kind], span.label)
      }
    }
    const lines = applySpans(parsed, spans)
    const rendered = renderFile(file.path, file.status, lines)

    if (report.charsSent + rendered.length > config.maxDiffChars) {
      skip('size-cap')
      continue
    }

    files.push({
      path: file.path,
      status: file.status,
      lines,
      commentable: commentableLines(lines),
      rendered
    })
    report.charsSent += rendered.length + 1
    for (const kind of ['secrets', 'pii'] as const) {
      for (const [label, n] of Object.entries(fileCounts[kind])) {
        report[kind][label] = (report[kind][label] ?? 0) + n
      }
    }
  }

  report.filesSent = files.length
  return { files, report }
}

function increment(counts: Record<string, number>, label: string) {
  counts[label] = (counts[label] ?? 0) + 1
}

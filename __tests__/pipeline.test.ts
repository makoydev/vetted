import type { ChangedFile } from '../src/github.js'
import { runPipeline, type Scrubber } from '../src/pipeline/index.js'

const limits = {
  maxFiles: 50,
  maxDiffBytes: 60000,
  paths: { allow: [], deny: [] }
}

function file(path: string, body: string, status = 'modified'): ChangedFile {
  const patch =
    `@@ -0,0 +1,${body.split('\n').length} @@\n` +
    body
      .split('\n')
      .map((l) => `+${l}`)
      .join('\n')
  return { path, status, additions: 1, deletions: 0, patch }
}

// A toy scrubber so the pipeline can be tested without the real rules.
const findWord = (
  word: string,
  label: string,
  kind: Scrubber['kind']
): Scrubber => ({
  kind,
  find: (text) => {
    const spans = []
    for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
      spans.push({ start: i, end: i + word.length, label })
    }
    return spans
  }
})

describe('runPipeline', () => {
  it('skips denied, removed and binary files, and says why', () => {
    const { files, report } = runPipeline(
      [
        file('.env', 'X=1'),
        file('src/old.ts', 'x', 'removed'),
        { path: 'img.svg', status: 'added', additions: 0, deletions: 0 },
        file('src/a.ts', 'const a = 1')
      ],
      limits,
      []
    )
    expect(files.map((f) => f.path)).toEqual(['src/a.ts'])
    expect(report.filesSkipped).toEqual([
      { path: '.env', reason: 'default-deny-list' },
      { path: 'src/old.ts', reason: 'removed' },
      { path: 'img.svg', reason: 'binary-or-too-large' }
    ])
    expect(report.filesInPullRequest).toBe(4)
    expect(report.filesSent).toBe(1)
  })

  it('replaces scrubbed text and counts it, without recording the value', () => {
    const { files, report } = runPipeline(
      [file('src/a.ts', 'token hunter2 and hunter2')],
      limits,
      [findWord('hunter2', 'SECRET:test', 'secrets')]
    )
    expect(files[0].rendered).toContain('token <SECRET:test> and <SECRET:test>')
    expect(files[0].rendered).not.toContain('hunter2')
    expect(report.secrets).toEqual({ 'SECRET:test': 2 })
    expect(JSON.stringify(report)).not.toContain('hunter2')
  })

  it('skips whole files that exceed the size cap, never truncating one', () => {
    const big = 'x'.repeat(900)
    const { files, report } = runPipeline(
      [file('a.ts', big), file('b.ts', big), file('c.ts', 'small')],
      { ...limits, maxDiffBytes: 1500 },
      []
    )
    expect(files.map((f) => f.path)).toEqual(['a.ts', 'c.ts'])
    expect(report.filesSkipped).toEqual([{ path: 'b.ts', reason: 'size-cap' }])
    expect(report.bytesSent).toBeLessThanOrEqual(1500)
    expect(files[0].rendered).toContain(big)
  })

  it('does not count scrubbed values in files that were not sent', () => {
    const { report } = runPipeline(
      [
        file('a.ts', 'x'.repeat(900)),
        file('b.ts', 'secret ' + 'x'.repeat(900))
      ],
      { ...limits, maxDiffBytes: 1500 },
      [findWord('secret', 'SECRET:test', 'secrets')]
    )
    expect(report.secrets).toEqual({})
  })

  it('stops at the file cap', () => {
    const { files, report } = runPipeline(
      [file('a.ts', 'a'), file('b.ts', 'b'), file('c.ts', 'c')],
      { ...limits, maxFiles: 2 },
      []
    )
    expect(files).toHaveLength(2)
    expect(report.filesSkipped).toEqual([{ path: 'c.ts', reason: 'file-cap' }])
  })

  it('records commentable lines for each file', () => {
    const { files } = runPipeline([file('a.ts', 'one\ntwo')], limits, [])
    expect([...files[0].commentable]).toEqual([1, 2])
  })
})

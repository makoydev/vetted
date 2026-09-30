import { commentableLines, parsePatch, renderFile } from '../src/diff/patch.js'

const patch = [
  '@@ -1,3 +1,4 @@ function main()',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  '+const c = 4',
  ' return a',
  '\\ No newline at end of file'
].join('\n')

describe('parsePatch', () => {
  it('numbers added and context lines on the new side, deleted lines on the old side', () => {
    expect(parsePatch(patch)).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@ function main()' },
      { kind: 'context', text: 'const a = 1', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'const b = 2', oldLine: 2 },
      { kind: 'add', text: 'const b = 3', newLine: 2 },
      { kind: 'add', text: 'const c = 4', newLine: 3 },
      { kind: 'context', text: 'return a', oldLine: 3, newLine: 4 },
      { kind: 'meta', text: '\\ No newline at end of file' }
    ])
  })

  it('restarts numbering at each hunk', () => {
    const lines = parsePatch('@@ -1 +1 @@\n+a\n@@ -40,2 +41,2 @@\n x\n+y')
    expect(lines.filter((l) => l.kind === 'add').map((l) => l.newLine)).toEqual(
      [1, 42]
    )
  })

  it('keeps a line that starts with "++" as an added line whose text starts with "+"', () => {
    expect(parsePatch('@@ -0,0 +1 @@\n++x')[1]).toEqual({
      kind: 'add',
      text: '+x',
      newLine: 1
    })
  })
})

describe('commentableLines', () => {
  it('includes added and context lines, never deleted ones', () => {
    expect([...commentableLines(parsePatch(patch))]).toEqual([1, 2, 3, 4])
  })
})

describe('renderFile', () => {
  it('shows new-file line numbers for the model', () => {
    expect(renderFile('src/a.ts', 'modified', parsePatch(patch))).toBe(
      [
        'FILE: src/a.ts (modified)',
        '@@ -1,3 +1,4 @@ function main()',
        '     1  const a = 1',
        '       -const b = 2',
        '     2 +const b = 3',
        '     3 +const c = 4',
        '     4  return a',
        '\\ No newline at end of file'
      ].join('\n')
    )
  })
})

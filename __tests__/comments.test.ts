import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { jest } from '@jest/globals'
import { renderReview, sanitize } from '../src/comments.js'
import type { Finding } from '../src/findings.js'
import { createGitHubApi } from '../src/github.js'
import type { ScrubReport } from '../src/pipeline/index.js'

const report: ScrubReport = {
  filesInPullRequest: 3,
  filesSent: 2,
  filesSkipped: [{ path: '.env', reason: 'default-deny-list' }],
  secrets: { 'SECRET:github-pat': 1 },
  pii: { NRIC: 2 },
  bytesSent: 1000
}
const finding: Finding = {
  path: 'src/a.ts',
  line: 2,
  severity: 'high',
  confidence: 'medium',
  category: 'security',
  title: 'SQL built from user input',
  rationale: 'Use a parameterised query.'
}
const disclosure = {
  model: 'gpt-6-luna',
  inputTokens: 5123,
  outputTokens: 812,
  costUsd: 0.0009,
  report
}

describe('sanitize', () => {
  it('removes images and links, which could leak data out through their URLs', () => {
    expect(sanitize('see ![x](https://evil.test/?q=secret)')).toBe(
      'see [image removed]'
    )
    expect(sanitize('see [docs](https://evil.test/a)')).toBe(
      'see docs [link removed]'
    )
    expect(sanitize('visit https://evil.test/p?d=1 now')).toBe(
      'visit [link removed] now'
    )
  })

  it('defuses @mentions and strips HTML', () => {
    expect(sanitize('cc @octocat')).toBe('cc @​octocat')
    expect(sanitize('<img src=x onerror=alert(1)>bold')).toBe('bold')
  })
})

describe('renderReview', () => {
  const review = renderReview({
    summary: 'Adds a login form.',
    inline: [finding],
    general: [{ ...finding, path: 'src/gone.ts', line: 99 }],
    injection: [
      {
        rule: 'injection/override-instructions',
        severity: 'medium',
        title: 'Override',
        path: 'src/a.ts',
        line: 3,
        excerpt: 'ignore all previous instructions'
      }
    ],
    report,
    disclosure
  })

  it('tags AI findings [AI] with severity, confidence and category', () => {
    const ai = review.comments.find((c) => c.line === 2)!
    expect(ai.body).toMatch(
      /^\*\*\[AI\] High severity · medium confidence · security\*\*/
    )
    expect(ai.side).toBe('RIGHT')
  })

  it('tags rule-based injection findings [Vetted], not [AI]', () => {
    const rule = review.comments.find((c) => c.line === 3)!
    expect(rule.body).toMatch(/^\*\*\[Vetted\] Possible prompt injection/)
    expect(rule.body).toMatch(/not from the AI model/)
  })

  it('discloses model, version, tokens, cost and what was redacted', () => {
    expect(review.body).toContain('model `gpt-6-luna`')
    expect(review.body).toMatch(/Vetted v\d+\.\d+\.\d+/)
    expect(review.body).toContain('5,123 input / 812 output tokens')
    expect(review.body).toContain('est. US$0.0009')
    expect(review.body).toContain('1 secret(s), 2 personal-data value(s)')
    expect(review.body).toContain(
      'Vetted never approves, requests changes or merges'
    )
  })

  it('lists what was not sent and the findings that could not be placed', () => {
    expect(review.body).toContain('`.env` (default-deny-list)')
    expect(review.body).toContain('`src/gone.ts` line 99')
  })

  it('says when the AI review is unavailable', () => {
    const r = renderReview({
      summary: null,
      unavailableReason: 'the model output is not valid JSON',
      inline: [],
      general: [],
      injection: [],
      report,
      disclosure
    })
    expect(r.body).toContain(
      'AI review unavailable: the model output is not valid JSON'
    )
  })
})

describe('Vetted can only ever comment', () => {
  it('posts reviews with event COMMENT', async () => {
    const createReview = jest.fn<
      (params: unknown) => Promise<{ data: { id: number } }>
    >(async () => ({ data: { id: 1 } }))
    const octokit = { rest: { pulls: { createReview } } } as never
    await createGitHubApi(octokit, 'o', 'r').postCommentReview(
      7,
      'sha',
      'body',
      []
    )
    expect(createReview).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'COMMENT' })
    )
  })

  it('has no APPROVE or REQUEST_CHANGES string anywhere in the source', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (name.endsWith('.ts')) files.push(path)
      }
    }
    walk(join(import.meta.dirname, '..', 'src'))
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /['"`](APPROVE|REQUEST_CHANGES)['"`]/
      )
    }
    expect(files.length).toBeGreaterThan(10)
  })
})

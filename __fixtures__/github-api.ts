import { jest } from '@jest/globals'
import type { ChangedFile, GitHubApi } from '../src/github.js'

/** An in-memory GitHubApi. `files` are the PR's changed files; `repoFiles` maps "path@ref" to text. */
export function fakeGitHubApi(
  files: ChangedFile[] = [],
  repoFiles: Record<string, string> = {}
) {
  return {
    listChangedFiles: jest.fn<GitHubApi['listChangedFiles']>(async () => files),
    getFileText: jest.fn<GitHubApi['getFileText']>(
      async (path, ref) => repoFiles[`${path}@${ref}`] ?? null
    )
  }
}

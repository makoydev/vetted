import type { getOctokit } from '@actions/github'

type Octokit = ReturnType<typeof getOctokit>

export interface ChangedFile {
  path: string
  previousPath?: string
  status: string
  additions: number
  deletions: number
  /** Unified diff for the file. GitHub omits it for binary or very large files. */
  patch?: string
}

/** The small part of the GitHub API that Vetted uses. */
export interface GitHubApi {
  listChangedFiles(pullNumber: number): Promise<ChangedFile[]>
  /** Returns a file's text at a commit, or null if it does not exist. */
  getFileText(path: string, ref: string): Promise<string | null>
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 404
  )
}

export function createGitHubApi(
  octokit: Octokit,
  owner: string,
  repo: string
): GitHubApi {
  return {
    async listChangedFiles(pullNumber) {
      // The diff is read through the API: Vetted never checks out or runs
      // the pull request's code.
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100
      })
      return files.map((f) => ({
        path: f.filename,
        previousPath: f.previous_filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch
      }))
    },

    async getFileText(path, ref) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref
        })
        if (
          Array.isArray(data) ||
          data.type !== 'file' ||
          !('content' in data)
        ) {
          return null
        }
        return Buffer.from(data.content, 'base64').toString('utf8')
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    }
  }
}

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
  /**
   * Counts runs of the workflow that started `runId`, created since
   * `sinceIso`, excluding `runId` itself and runs whose jobs were all
   * skipped. Stops counting at `stopAt`. Needs `actions: read`.
   */
  countWorkflowRunsSince(
    runId: number,
    sinceIso: string,
    stopAt: number
  ): Promise<number>
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

    async countWorkflowRunsSince(runId, sinceIso, stopAt) {
      const { data: current } = await octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId
      })
      let count = 0
      for (let page = 1; page <= 10; page++) {
        const { data } = await octokit.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: current.workflow_id,
          created: `>=${sinceIso}`,
          per_page: 100,
          page
        })
        for (const run of data.workflow_runs) {
          // Cancelled runs may have called the model before stopping: count them.
          if (run.id === runId || run.conclusion === 'skipped') continue
          if (++count >= stopAt) return count
        }
        if (data.workflow_runs.length < 100) break
      }
      return count
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

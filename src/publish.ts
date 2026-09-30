import { dirname, basename } from 'node:path'
import * as core from '@actions/core'
import { DefaultArtifactClient } from '@actions/artifact'
import { summaryMarkdown, writeAuditFile, type AuditRecord } from './audit.js'

/**
 * Writes the audit record, uploads it as a workflow artifact (kept for 30
 * days) and adds a summary to the run page. Upload problems are warnings:
 * the record is evidence, not a reason to fail someone's pull request.
 */
export async function publishAudit(record: AuditRecord): Promise<void> {
  const path = writeAuditFile(record)
  try {
    await new DefaultArtifactClient().uploadArtifact(
      basename(path, '.json'),
      [path],
      dirname(path),
      { retentionDays: 30 }
    )
    core.info(`Audit record uploaded as artifact ${basename(path, '.json')}.`)
  } catch (error) {
    core.warning(
      `Could not upload the audit artifact: ${(error as Error).message}`
    )
  }
  try {
    await core.summary.addRaw(summaryMarkdown(record)).write()
  } catch {
    // No job summary outside GitHub Actions (for example in local runs).
  }
}

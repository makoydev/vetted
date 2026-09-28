import * as core from '@actions/core'

export const MODES = ['shadow', 'opt-in'] as const
export type Mode = (typeof MODES)[number]

/**
 * Parses the `mode` input. Unknown values fail closed rather than falling
 * back to a mode that might post comments.
 */
export function parseMode(value: string): Mode {
  const mode = value.trim() || 'shadow'
  if (!(MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `Unknown mode "${mode}". Expected one of: ${MODES.join(', ')}.`
    )
  }
  return mode as Mode
}

/**
 * The main function for the action. At this stage (issue #1) it only
 * validates its input; the review pipeline arrives in later issues.
 */
export async function run(): Promise<void> {
  try {
    const mode = parseMode(core.getInput('mode'))
    core.info(`Vetted running in ${mode} mode. No model is called yet.`)
    core.setOutput('mode', mode)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

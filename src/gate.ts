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

export interface GateInput {
  mode: Mode
  action?: string
  labels: string[]
  eventLabel?: string
  reviewLabel: string
  isFork: boolean
  hasApiKey: boolean
}

export interface GateDecision {
  /** Whether to run the review pipeline at all. */
  run: boolean
  /** Whether findings may be posted as comments (never in shadow mode). */
  postComments: boolean
  /** Whether the paid model may be called; otherwise the mock is used. */
  useRealModel: boolean
  reason: string
}

/** Decides what this run may do, from the rollout mode and the event. */
export function decide(input: GateInput): GateDecision {
  const useRealModel = input.hasApiKey && !input.isFork
  const modelNote = useRealModel
    ? ''
    : input.isFork
      ? ' Fork pull requests get no secrets, so the mock model is used.'
      : ' No API key is configured, so the mock model is used.'

  if (input.mode === 'shadow') {
    return {
      run: true,
      postComments: false,
      useRealModel,
      reason: `Shadow mode: review recorded in the audit artifact only, no comments.${modelNote}`
    }
  }

  if (!input.labels.includes(input.reviewLabel)) {
    return {
      run: false,
      postComments: false,
      useRealModel: false,
      reason: `Opt-in mode: the pull request has no "${input.reviewLabel}" label.`
    }
  }
  if (input.action === 'labeled' && input.eventLabel !== input.reviewLabel) {
    return {
      run: false,
      postComments: false,
      useRealModel: false,
      reason: `Opt-in mode: a different label ("${input.eventLabel}") was added; nothing new to review.`
    }
  }
  return {
    run: true,
    postComments: true,
    useRealModel,
    reason: `Opt-in mode: "${input.reviewLabel}" label present.${modelNote}`
  }
}

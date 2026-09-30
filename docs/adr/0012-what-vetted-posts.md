# 0012. What Vetted posts, when, and how model text is made safe to post

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-30

## Context

By the posting step, Vetted holds up to three things: the model's summary and findings (untrusted output), rule-based prompt-injection findings (deterministic), and the scrub report. It must decide what to post in each rollout mode and after each kind of failure. Posting too much trains people to ignore Vetted; posting too little hides problems.

## Options

1. **Post whatever is available, always.** Simple, but mock reviews and failures produce noise on every pull request.
2. **Post only when the model produced valid output.** Quiet, but an attacker who makes the model's output invalid would also suppress the warning about their injection attempt.
3. **Post by source and mode**, as below.

## Decision

Option 3:

| Situation                                                    | What is posted                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Shadow mode                                                  | Nothing, ever. Everything goes to the audit record                                     |
| Opt-in, real model, valid output                             | One review: summary, AI findings on their lines, injection findings, disclosure footer |
| Opt-in, output invalid, refused, cut off, or the call failed | Injection findings only, with "AI review unavailable: {reason}"                        |
| Opt-in, mock model                                           | Only if a rule found something, so pull requests don't fill with "mock review" notes   |

- **Every review is posted with event `COMMENT`.** The GitHub wrapper has no parameter for the event, and a test fails if `'APPROVE'` or `'REQUEST_CHANGES'` appears anywhere in the source.
- **AI findings are tagged `[AI]`; rule findings are tagged `[Vetted]`** and say they don't come from the model. Readers should know which comments a model wrote.
- **A finding the model places outside the diff** (a wrong line or file) is listed in the review body, not dropped, because GitHub rejects a whole review if one inline comment points outside the diff.
- **Model text is sanitised before posting** (OWASP LLM05:2025, improper output handling). Markdown images and links are removed, because a rendered image URL is a known way to leak data out of an AI system. HTML is escaped (not stripped: stripping can be bypassed by nesting tags, which CodeQL caught), and `@mentions` are defused so the model can't notify people.
- If posting fails (for example with a read-only token on a fork pull request), the step warns but doesn't fail: Vetted is advisory and must never block a merge by itself.

## Consequences

- A human always sees injection attempts in opt-in mode, whatever happened to the model call.
- Some useful links in model explanations are lost to sanitising. That's acceptable: the reviewer has the code.
- In shadow mode, the audit record (#8) is the only output. That's the point of shadow mode.

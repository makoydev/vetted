/**
 * Fake secrets built at runtime from a seeded generator. The repository
 * never contains a literal that looks like a real credential (so GitHub
 * push protection and Vetted's own review stay quiet), and every run of
 * the tests sees the same values. None of these is a real credential.
 */

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const ALNUM = UPPER + LOWER + DIGITS
const HEX = '0123456789abcdef'
const B64 = ALNUM + '+/'

export interface FakeSecret {
  /** The gitleaks rule expected to find it. */
  rule: string
  /** The secret text that must never reach a model. */
  value: string
  /** A line of code containing it. */
  line: string
}

type Maker = (pick: (alphabet: string, n: number) => string) => {
  value: string
  line?: (v: string) => string
}

// Prefixes are split so no provider's token format appears literally here.
const MAKERS: Record<string, Maker> = {
  'aws-access-token': (p) => ({ value: 'AK' + 'IA' + p(UPPER + '234567', 16) }),
  'github-pat': (p) => ({ value: 'gh' + 'p_' + p(ALNUM, 36) }),
  'github-fine-grained-pat': (p) => ({
    value: 'github' + '_pat_' + p(ALNUM + '_', 82)
  }),
  'github-oauth': (p) => ({ value: 'gh' + 'o_' + p(ALNUM, 36) }),
  'github-app-token': (p) => ({ value: 'gh' + 's_' + p(ALNUM, 36) }),
  'gitlab-pat': (p) => ({ value: 'glp' + 'at-' + p(ALNUM, 20) }),
  'slack-bot-token': (p) => ({
    value:
      'xo' + 'xb-' + p(DIGITS, 12) + '-' + p(DIGITS, 12) + '-' + p(ALNUM, 24)
  }),
  'slack-user-token': (p) => ({
    value:
      'xo' +
      'xp-' +
      [p(DIGITS, 12), p(DIGITS, 12), p(DIGITS, 12)].join('-') +
      '-' +
      p(ALNUM, 32)
  }),
  'slack-webhook-url': (p) => ({
    value: 'https://hooks.' + 'slack.com/services/' + p(ALNUM, 44)
  }),
  'stripe-access-token': (p) => ({ value: 'sk' + '_live_' + p(ALNUM, 24) }),
  'openai-api-key': (p) => ({
    value:
      'sk' +
      '-proj-' +
      p(ALNUM + '_-', 58) +
      'T3Blbk' +
      'FJ' +
      p(ALNUM + '_-', 58)
  }),
  'anthropic-api-key': (p) => ({
    value: 'sk-ant' + '-api03-' + p(ALNUM + '_-', 93) + 'AA'
  }),
  'gcp-api-key': (p) => ({ value: 'AI' + 'za' + p(ALNUM + '_-', 35) }),
  jwt: (p) => ({
    value:
      'ey' +
      p(ALNUM, 30) +
      '.ey' +
      p(ALNUM + '_-', 60) +
      '.' +
      p(ALNUM + '_-', 43)
  }),
  'npm-access-token': (p) => ({ value: 'np' + 'm_' + p(LOWER + DIGITS, 36) }),
  'sendgrid-api-token': (p) => ({
    value: 'SG' + '.' + p(ALNUM, 22) + '.' + p(ALNUM, 43)
  }),
  'twilio-api-key': (p) => ({ value: 'S' + 'K' + p(HEX, 32) }),
  'shopify-access-token': (p) => ({ value: 'shp' + 'at_' + p(HEX, 32) }),
  'digitalocean-pat': (p) => ({ value: 'dop' + '_v1_' + p(HEX, 64) }),
  'huggingface-access-token': (p) => ({ value: 'h' + 'f_' + p(LOWER, 34) }),
  'doppler-api-token': (p) => ({
    value: 'dp.' + 'pt.' + p(LOWER + DIGITS, 43)
  }),
  'linear-api-key': (p) => ({ value: 'lin' + '_api_' + p(LOWER + DIGITS, 40) }),
  'databricks-api-token': (p) => ({ value: 'da' + 'pi' + p(HEX, 32) }),
  'square-access-token': (p) => ({ value: 'sq0' + 'atp-' + p(ALNUM, 22) }),
  'telegram-bot-api-token': (p) => ({
    value: p(DIGITS, 10) + ':A' + p(LOWER + DIGITS, 34),
    line: (v) => `TELEGRAM_BOT_TOKEN = "${v}"`
  }),
  'mailgun-private-api-token': (p) => ({
    value: 'key-' + p(HEX, 32),
    line: (v) => `mailgun_key = "${v}"`
  }),
  'heroku-api-key': (p) => ({
    value: [p(HEX, 8), p(HEX, 4), p(HEX, 4), p(HEX, 4), p(HEX, 12)].join('-'),
    line: (v) => `HEROKU_API_KEY = "${v}"`
  }),
  'generic-api-key': (p) => ({
    value: p(UPPER, 4) + p(DIGITS, 4) + p(LOWER, 4) + p(ALNUM, 12),
    line: (v) => `db_password = "${v}"`
  }),
  'private-key': (p) => {
    const body = Array.from({ length: 4 }, () => p(B64, 64)).join('\n')
    const edge = '-----'
    return {
      value: `${edge}BEGIN RSA PRIVATE KEY${edge}\n${body}\n${edge}END RSA PRIVATE KEY${edge}`,
      line: (v) => v
    }
  }
}

/** One fake secret per rule above, in a line of code. */
export function fakeSecrets(seed = 20260930): FakeSecret[] {
  const random = seededRandom(seed)
  const pick = (alphabet: string, n: number) => {
    let s = ''
    for (let i = 0; i < n; i++)
      s += alphabet[Math.floor(random() * alphabet.length)]
    return s
  }
  return Object.entries(MAKERS).map(([rule, make]) => {
    const { value, line } = make(pick)
    return {
      rule,
      value,
      line: (line ?? ((v) => `const credential = "${v}";`))(value)
    }
  })
}

/** A random base64 token no rule names, for the entropy check. */
export function fakeHighEntropyToken(seed = 7, length = 40): string {
  const random = seededRandom(seed)
  let s = ''
  for (let i = 0; i < length; i++) s += B64[Math.floor(random() * B64.length)]
  return s
}

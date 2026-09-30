import { pathRules } from '../src/pipeline/paths.js'

describe('pathRules', () => {
  const defaults = pathRules({ allow: [], deny: [] })

  it.each([
    '.env',
    '.env.local',
    'config/.env.production',
    'deploy/prod.env',
    'secrets/db.yml',
    'app/secrets/nested/token.txt',
    'certs/server.pem',
    'keys/signing.key',
    'store.p12',
    'home/.ssh/id_rsa',
    'id_ed25519.pub',
    '.npmrc',
    'infra/terraform.tfstate',
    'infra/prod.tfvars',
    'package-lock.json',
    'web/yarn.lock',
    'pnpm-lock.yaml',
    'go.sum',
    'Cargo.lock',
    'dist/index.js',
    'lib/vendor/x.go',
    'app.min.js',
    'logo.PNG',
    'fonts/a.woff2',
    'build.zip',
    'report.pdf'
  ])('never sends %s', (path) => {
    expect(defaults.check(path)).toBe('default-deny-list')
  })

  it.each([
    'src/env.ts',
    'docs/environment.md',
    'src/secret-scanner.ts',
    'README.md',
    'src/keys.ts',
    '.github/workflows/ci.yml'
  ])('sends %s', (path) => {
    expect(defaults.check(path)).toBeNull()
  })

  it('adds config deny patterns to the defaults', () => {
    const rules = pathRules({ allow: [], deny: ['docs/**'] })
    expect(rules.check('docs/guide.md')).toBe('config-deny-list')
    expect(rules.check('.env')).toBe('default-deny-list')
  })

  it('an allow list narrows what is sent', () => {
    const rules = pathRules({ allow: ['src/**'], deny: [] })
    expect(rules.check('src/a.ts')).toBeNull()
    expect(rules.check('scripts/b.ts')).toBe('not-in-allow-list')
  })

  it('an allow list can never re-allow a default-denied file', () => {
    const rules = pathRules({ allow: ['**', '.env'], deny: [] })
    expect(rules.check('.env')).toBe('default-deny-list')
    expect(rules.check('secrets/x.txt')).toBe('default-deny-list')
  })
})

import picomatch from 'picomatch'

/**
 * Files that are never sent to a model, whatever the config says. A config
 * can add to this list or narrow what is sent, but never re-allow these.
 */
export const DEFAULT_DENY: readonly string[] = [
  // Environment and credential files
  '**/.env*',
  '**/*.env',
  '**/secrets/**',
  '**/.aws/**',
  '**/.ssh/**',
  '**/.npmrc',
  '**/.pypirc',
  '**/.netrc',
  '**/.git-credentials',
  '**/.htpasswd',
  '**/*.tfstate',
  '**/*.tfstate.*',
  '**/*.tfvars',
  // Keys and certificates
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.jks',
  '**/*.keystore',
  '**/*.kdbx',
  '**/*.ppk',
  '**/*.asc',
  '**/*.gpg',
  '**/id_rsa*',
  '**/id_dsa*',
  '**/id_ecdsa*',
  '**/id_ed25519*',
  // Lockfiles: large, generated, and full of hashes that look like secrets
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/bun.lock',
  '**/bun.lockb',
  '**/go.sum',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/Pipfile.lock',
  '**/uv.lock',
  '**/Gemfile.lock',
  '**/composer.lock',
  '**/packages.lock.json',
  '**/gradle.lockfile',
  // Generated and vendored code
  '**/node_modules/**',
  '**/dist/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  // Binary and media files
  '**/*.{png,jpg,jpeg,gif,webp,ico,bmp,tiff,psd,heic}',
  '**/*.{woff,woff2,ttf,otf,eot}',
  '**/*.{zip,gz,tgz,tar,7z,rar,jar,war,whl}',
  '**/*.{exe,dll,so,dylib,bin,o,a,class,wasm,pyc}',
  '**/*.{mp3,mp4,mov,avi,wav,pdf,sqlite,db}'
]

export type SkipReason =
  | 'default-deny-list'
  | 'config-deny-list'
  | 'not-in-allow-list'
  | 'removed'
  | 'binary-or-too-large'
  | 'file-cap'
  | 'size-cap'

const matcher = (patterns: readonly string[]) =>
  patterns.length === 0
    ? () => false
    : picomatch([...patterns], { dot: true, nocase: true })

const isDefaultDenied = matcher(DEFAULT_DENY)

export interface PathRules {
  /** Returns why a path must not be sent, or null if it may be. */
  check(path: string): SkipReason | null
}

export function pathRules(config: {
  allow: string[]
  deny: string[]
}): PathRules {
  const isConfigDenied = matcher(config.deny)
  const isAllowed =
    config.allow.length === 0 ? () => true : matcher(config.allow)
  return {
    check(path) {
      if (isDefaultDenied(path)) return 'default-deny-list'
      if (isConfigDenied(path)) return 'config-deny-list'
      if (!isAllowed(path)) return 'not-in-allow-list'
      return null
    }
  }
}

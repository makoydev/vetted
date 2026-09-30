import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VERSION } from '../src/version.js'

it('the version in the disclosure footer matches package.json', () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')
  )
  expect(VERSION).toBe(pkg.version)
})

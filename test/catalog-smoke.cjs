const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const spawn = require('cross-spawn')
const yaml = require('yaml')
const api = require('../dist')

// With a path argument, exercise a different pnpm release without changing this repo's pin.
const pnpmPath = process.argv[2]
function pnpm(args, cwd) {
  const result = spawn.sync(pnpmPath || 'pnpm', args, {
    cwd, encoding: 'utf8', timeout: 120000,
  })
  assert.strictEqual(result.status, 0, result.error?.message || result.stderr + result.stdout)
  return result.stdout
}
function writeManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerna-ci pnpm catalogs '))
  const cwd = process.cwd()
  const originalPath = process.env.PATH
  try {
    const version = pnpm(['--version'], dir).trim()
    const [major, minor] = version.split('.').map(Number)
    const supportsLocalCatalogs = major > 12 || (major === 12 && minor >= 6)
    writeManifest(dir, { name: 'catalog-workspace', version: '1.0.0', private: true })
    const appDir = path.join(dir, 'packages/app')
    const dependencies = { picocolors: 'catalog:' }
    const devDependencies = { semver: 'catalog:default' }
    const catalog = { picocolors: '^1.0.0', semver: '^7.6.0' }
    if (supportsLocalCatalogs) {
      Object.assign(devDependencies, { '@app/utils': 'catalog:', '@app/local': 'catalog:', '@app/file': 'catalog:' })
      Object.assign(catalog, { '@app/utils': 'workspace:^', '@app/local': 'link:./packages/local', '@app/file': 'file:./packages/file' })
      for (const name of ['utils', 'local', 'file']) {
        writeManifest(path.join(dir, `packages/${name}`), { name: `@app/${name}`, version: '1.2.3' })
      }
    }
    writeManifest(appDir, { name: '@app/consumer', version: '1.0.0', dependencies,
      devDependencies, peerDependencies: { picocolors: 'catalog:named' } })
    writeManifest(path.join(dir, 'packages/named'), { name: '@app/named', version: '1.0.0', private: true,
      dependencies: { picocolors: 'catalog:named' } })
    const file = path.join(dir, 'pnpm-workspace.yaml')
    fs.writeFileSync(file, '# Catalog integration fixture\n' + yaml.stringify({
      packages: ['packages/*'], catalog, catalogs: { named: { picocolors: '~1.0.0' } },
      overrides: { semver: 'catalog:default' }, catalogMode: 'manual',
    }))
    const before = fs.readFileSync(file, 'utf8')
    const appBefore = fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')
    // pnpm's real workspace command is used by syncDeps; no command mocks here.
    if (pnpmPath) {
      // Put a shim ahead of PATH so the API's own pnpm command uses the selected release.
      const shimDir = path.join(dir, 'bin')
      fs.mkdirSync(shimDir)
      assert.notStrictEqual(process.platform, 'win32', 'alternate-version integration uses the Linux CI job')
      const quote = value => `'${value.replace(/'/g, "'\\''")}'`
      fs.writeFileSync(path.join(shimDir, 'pnpm'), `#!/bin/sh\nexec ${quote(pnpmPath)} "$@"\n`, { mode: 0o755 })
      process.env.PATH = shimDir + path.delimiter + process.env.PATH
    }
    process.chdir(appDir)
    const options = { versionMap: { picocolors: '1.1.1', semver: '7.8.5' } }
    assert.strictEqual((await api.syncDeps({ ...options, checkOnly: true })).length, 1)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
    assert.strictEqual(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'), appBefore)
    const cli = path.join(__dirname, '../dist/bin/index.js')
    const check = spawn.sync(process.execPath, [cli, 'syncdeps', 'picocolors@1.1.1', '--check-only'], { cwd: appDir, encoding: 'utf8' })
    assert.strictEqual(check.status, 1, check.stderr + check.stdout)
    assert.match(check.stdout + check.stderr, /pnpm-workspace\.yaml/)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
    await api.syncDeps(options)
    assert.strictEqual(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'), appBefore)
    assert.strictEqual(await api.syncDeps(options), false)
    const updated = yaml.parse(fs.readFileSync(file, 'utf8'))
    assert.strictEqual(updated.catalog.picocolors, '^1.1.1')
    assert.strictEqual(updated.catalogs.named.picocolors, '~1.1.1')
    assert.strictEqual(updated.overrides.semver, 'catalog:default')
    if (supportsLocalCatalogs) {
      await api.syncLocal()
      for (const name of ['utils', 'local', 'file']) assert.strictEqual(yaml.parse(fs.readFileSync(file, 'utf8')).catalog[`@app/${name}`], catalog[`@app/${name}`])
    }
    pnpm(['install', '--ignore-scripts', '--no-frozen-lockfile'], dir)
    pnpm(['install', '--ignore-scripts', '--frozen-lockfile'], dir)
    const lock = yaml.parse(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'), 'utf8'))
    assert.strictEqual(lock.catalogs.default.picocolors.specifier, '^1.1.1')
    assert.strictEqual(lock.catalogs.named.picocolors.specifier, '~1.1.1')
    const tarball = path.join(dir, 'consumer.tgz')
    pnpm(['pack', '--out', tarball], appDir)
    const consumer = path.join(dir, 'isolated-consumer')
    writeManifest(consumer, { name: 'packed-consumer', private: true })
    const install = spawn.sync('npm', ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer, encoding: 'utf8', timeout: 120000 })
    assert.strictEqual(install.status, 0, install.error?.message || install.stderr + install.stdout)
    const packed = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules/@app/consumer/package.json'), 'utf8'))
    assert.strictEqual(packed.dependencies.picocolors, '^1.1.1')
    assert.strictEqual(packed.devDependencies.semver, '^7.8.5')
    assert.strictEqual(packed.peerDependencies.picocolors, '~1.1.1')
    assert.strictEqual(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'), appBefore)
    console.log(`Catalog integration passed with pnpm ${version}: real discovery, nested cwd, CLI, lockfile, frozen install and pack`)
  } finally {
    process.chdir(cwd)
    process.env.PATH = originalPath
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const spawn = require('cross-spawn')

// Public exports from the preceding tsc-based release; additive exports are allowed.
const expectedExports = [
  'CIError', 'PKG_DEP_KEYS', 'RELEASE_TYPES', 'SUPPORTED_NPM_CLIENTS', 'canPublish',
  'findFileRecursive', 'fixpack', 'formatMessages', 'getAllDependencies', 'getAllPackageDigests',
  'getChanged', 'getConfig', 'getGitRoot', 'getIndent', 'getPackageVersionsFromGit',
  'getProjectRoot', 'getRepoNpmClient', 'getRootPackageDigest', 'getVersionFormRegistry',
  'getVersionTransformer', 'getVersionsFromRegistry', 'isAsteriskPkgName', 'isLernaAvailable',
  'isManagedByLerna', 'isPkgNameMatchingPattern', 'isWin', 'logger', 'maxVersion', 'pickOne',
  'readPackageJson', 'readRootPkgJson', 'runNpmCmd', 'runShellCmd', 'setConfig', 'syncDeps',
  'syncLocal', 'syncPruneGitTags', 'updatePackageJSON', 'planSyncDeps', 'planSyncLocal',
]
function run(command, args, cwd) {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8', timeout: 120000 })
  assert.strictEqual(result.status, 0, result.error?.message || result.stderr + result.stdout)
  return result.stdout
}
async function main() {
  const tarball = path.resolve(process.argv[2] || 'pack.tgz')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerna-ci package '))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'package-consumer', private: true }))
    run('npm', ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], dir)
    const packageDir = path.join(dir, 'node_modules/lerna-ci')
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    assert.strictEqual(manifest.main, 'dist/index.js')
    assert.strictEqual(manifest.typings, 'dist/index.d.ts')
    // npm may normalize the string shorthand to a bin-name map on installation.
    const cliEntry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['lerna-ci']
    assert.strictEqual(cliEntry, './dist/bin/index.js')
    for (const omitted of ['src', 'test', 'scripts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vite.config.mts', 'eslint.config.mjs']) {
      assert.strictEqual(fs.existsSync(path.join(packageDir, omitted)), false, `${omitted} should not be shipped`)
    }
    for (const tool of ['vite', 'typescript', 'eslint', 'tsx']) {
      assert.throws(() => require.resolve(tool, { paths: [dir] }))
    }
    const defaultConfig = require(path.join(packageDir, 'dist/fixpack-all/config'))
    assert.strictEqual(defaultConfig.__esModule, true, 'preserve tsc default-import interoperability')
    const entry = path.join(packageDir, manifest.main)
    const api = require(entry)
    const yamlEntry = require.resolve('yaml', { paths: [packageDir] })
    assert.strictEqual(require.cache[yamlEntry], undefined, 'load the catalog parser only for pnpm workspace operations')
    const imported = await import(pathToFileURL(entry).href)
    const [major, minor] = process.versions.node.split('.').map(Number)
    const supportsNamedCommonJSImports = major > 14 || (major === 14 && minor >= 13)
    for (const name of expectedExports) {
      assert.ok(name in api, `missing CommonJS export: ${name}`)
      assert.ok(name in imported.default, `missing native default import: ${name}`)
      if (supportsNamedCommonJSImports) assert.ok(name in imported, `missing native ESM import: ${name}`)
    }
    assert.strictEqual(api.maxVersion('1.0.0', '2.0.0'), '2.0.0')
    const cli = path.join(dir, 'node_modules/.bin', process.platform === 'win32' ? 'lerna-ci.cmd' : 'lerna-ci')
    assert.match(run(cli, ['--help'], dir), /lerna-ci <cmd>/)
    assert.match(run(process.execPath, [path.join(packageDir, cliEntry), '--help'], dir), /lerna-ci <cmd>/)
    if (!process.argv.includes('--runtime-only')) {
      fs.writeFileSync(path.join(dir, 'consumer.ts'), [
        "import { syncLocal, syncDeps, planSyncDeps, planSyncLocal, ISyncPlan, ISyncReport, getRepoNpmClient, getVersionTransformer, runShellCmd, EVerSource } from 'lerna-ci'",
        "const local: ReturnType<typeof syncLocal> = syncLocal({ checkOnly: true, versionSource: EVerSource.LOCAL })",
        "const deps: ReturnType<typeof syncDeps> = syncDeps({ versionMap: { react: '18.2.0' } })",
        "const client: ReturnType<typeof getRepoNpmClient> = getRepoNpmClient()",
        "const version: string = getVersionTransformer('^')('react', '1.0.0', '2.0.0')",
        "const output: Promise<string> = runShellCmd('git', ['status'], { cwd: '.' })",
        "const plan: Promise<ISyncPlan> = planSyncDeps({ versionMap: { react: '18.2.0' }, requireMatch: true })",
        "const localPlan: Promise<ISyncPlan> = planSyncLocal({ versionSource: EVerSource.LOCAL })",
        "const apply = (value: ISyncPlan): Awaited<ReturnType<typeof syncDeps>> => value.apply()",
        "const status = (report: ISyncReport): ISyncReport['status'] => report.status",
        'void [local, deps, client, version, output, plan, localPlan, apply, status]',
      ].join('\n'))
      fs.writeFileSync(path.join(dir, 'interop.ts'), [
        "import config from 'lerna-ci/dist/fixpack-all/config'",
        "if (config.dryRun !== false) throw new Error('CommonJS default import changed')",
      ].join('\n'))
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020', module: 'Node16', moduleResolution: 'Node16', strict: true,
          outDir: 'compiled', esModuleInterop: true, isolatedModules: true, types: ['node'], typeRoots: [path.resolve(__dirname, '../node_modules/@types')],
        },
        include: ['consumer.ts', 'interop.ts'],
      }))
      run(process.execPath, [path.resolve(__dirname, '../node_modules/typescript/bin/tsc'), '-p', path.join(dir, 'tsconfig.json')], dir)
      run(process.execPath, [path.join(dir, 'compiled/interop.js')], dir)
    }
    const regression = spawn.sync(process.execPath, [path.join(__dirname, 'regression.cjs')], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 120000,
      env: { ...process.env, LERNA_CI_DIST: path.join(packageDir, 'dist') },
    })
    assert.strictEqual(regression.status, 0, regression.error?.message || regression.stderr + regression.stdout)
    console.log('Package smoke test passed: public exports, native import, CLI, declarations, and isolated dependencies')
  } finally {
    if (fs.rmSync) fs.rmSync(dir, { recursive: true, force: true })
    else fs.rmdirSync(dir, { recursive: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

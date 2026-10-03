const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const dist = process.env.LERNA_CI_DIST || path.resolve(__dirname, '../dist')
const api = require(dist)
const utils = require(path.join(dist, 'common/utils'))
const npm = require(path.join(dist, 'common/get-package-version/npm/npm'))
const yarn = require(path.join(dist, 'common/get-package-version/npm/yarn'))
const yarnNext = require(path.join(dist, 'common/get-package-version/npm/yarn-next'))
const { getMaxStableVersion } = require(path.join(dist, 'common/get-package-version/npm/common'))
const { getCliConfig } = require(path.join(dist, 'bin/config'))
const changed = require(path.join(dist, 'changed'))
const tests = []
const test = (name, run) => tests.push({ name, run })
const write = (dir, json) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json, null, 2) + '\n')
}
async function fixture(run, json = { name: 'root', version: '1.0.0', private: true, workspaces: ['packages/*'] }) {
  const cwd = process.cwd()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerna-ci regression '))
  write(dir, json)
  process.chdir(dir)
  try { await run(dir) } finally { process.chdir(cwd); fs.rmSync ? fs.rmSync(dir, { recursive: true, force: true }) : fs.rmdirSync(dir, { recursive: true }) }
}
async function patch(object, key, replacement, run) {
  const original = object[key]
  object[key] = replacement
  try { await run() } finally { object[key] = original }
}
function cli(dir, ...args) {
  return spawnSync(process.execPath, [path.join(dist, 'bin/index.js'), ...args], {
    cwd: dir, encoding: 'utf8', timeout: 15000
  })
}
function update(dir, oldVersion, newVersion, options = {}) {
  write(dir, { name: 'root', version: '1.0.0', dependencies: { react: oldVersion } })
  return api.updatePackageJSON({
    pkgDigest: { name: 'root', version: '1.0.0', private: true, location: dir },
    latestVersions: { react: newVersion },
    versionTransform: api.getVersionTransformer('retain'),
    ...options
  })
}

async function catalogFixture(content, manifests, run) {
  return fixture(async dir => {
    const file = path.join(dir, 'pnpm-workspace.yaml')
    fs.writeFileSync(file, content)
    for (const [location, manifest] of Object.entries(manifests)) write(path.join(dir, location), manifest)
    const original = utils.runShellCmd
    await patch(utils, 'runShellCmd', async (cmd, args, options) => {
      if (cmd === 'pnpm' && args[0] === 'm' && args[1] === 'ls') {
        return JSON.stringify(Object.keys(manifests).concat('.').map(location => ({
          ...JSON.parse(fs.readFileSync(path.join(dir, location, 'package.json'))), path: path.join(dir, location),
        })))
      }
      return original(cmd, args, options)
    }, () => run(dir, file))
  }, { name: 'root', version: '1.0.0', private: true, packageManager: 'pnpm@10.34.6' })
}

test('keyword and private filters select only the requested workspace packages', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.0.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0', private: true })
  write(path.join(dir, 'packages/c'), { name: '@other/c', version: '1.0.0' })
  assert.deepStrictEqual((await api.getAllPackageDigests({ keyword: '@app/', ignorePrivate: true })).map(p => p.name), ['@app/a'])
}))
test('discovery refreshes versions and returns the root only once', () => fixture(async dir => {
  await api.getAllPackageDigests()
  write(dir, { name: 'root', version: '2.0.0', private: true, workspaces: ['.'] })
  const pkgs = await api.getAllPackageDigests()
  assert.strictEqual(pkgs.length, 1)
  assert.strictEqual(pkgs[0].version, '2.0.0')
}))
test('object-form workspaces and package-manager changes are discovered', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.0.0' })
  write(dir, { name: 'root', private: true, packageManager: 'npm@10.0.0', workspaces: { packages: ['packages/*'] } })
  assert.strictEqual((await api.getAllPackageDigests()).length, 2)
  assert.strictEqual(await api.getRepoNpmClient(), 'npm')
  write(dir, { name: 'root', private: true, packageManager: 'pnpm@9.0.0', workspaces: ['packages/*'] })
  assert.strictEqual(await api.getRepoNpmClient(), 'pnpm')
  assert.strictEqual((await api.getAllPackageDigests()).length, 2)
}))
test('project roots follow cwd changes and reject directories without a manifest', async () => {
  await fixture(async first => {
    assert.strictEqual(await api.getProjectRoot(), first)
    await fixture(async second => { assert.strictEqual(await api.getProjectRoot(), second) })
    const empty = path.join(first, 'empty')
    fs.mkdirSync(empty)
    fs.unlinkSync(path.join(first, 'package.json'))
    process.chdir(empty)
    await assert.rejects(api.getProjectRoot(), /unable to determine project root/)
  })
})
test('recursive file search preserves candidates while checking ancestor directories', () => fixture(async dir => {
  const nested = path.join(dir, 'a/b')
  fs.mkdirSync(nested, { recursive: true })
  const names = ['missing.json', 'package.json']
  assert.strictEqual(api.findFileRecursive(names, nested), path.join(dir, 'package.json'))
  assert.deepStrictEqual(names, ['missing.json', 'package.json'])
}))
test('syncLocal with an explicit local source preserves files in check-only mode', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '2.0.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0', dependencies: { '@app/a': '^1.0.0' } })
  const file = path.join(dir, 'packages/b/package.json')
  const before = fs.readFileSync(file, 'utf8')
  let registryRequests = 0
  await patch(utils, 'runShellCmd', async () => { registryRequests++; throw new Error('unexpected registry request') }, async () => {
    await patch(utils, 'syncPruneGitTags', async () => { throw new Error('unexpected Git fetch') }, async () => {
      assert.strictEqual((await api.syncLocal({ versionSource: 'local', checkOnly: true })).length, 1)
      assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
      await api.syncLocal({ versionSource: 'local' })
      assert.strictEqual(JSON.parse(fs.readFileSync(file)).dependencies['@app/a'], '^2.0.0')
      assert.strictEqual(await api.syncLocal({ versionSource: 'local' }), false)
      assert.strictEqual(registryRequests, 0)
    })
  })
}))
test('syncLocal API retains all-source recovery by default', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '2.0.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0', dependencies: { '@app/a': '^2.0.0' } })
  const registry = require(path.join(dist, 'common/get-package-version/npm'))
  const tags = require(path.join(dist, 'common/get-package-version/git'))
  let registryCalls = 0
  let gitCalls = 0
  const file = path.join(dir, 'packages/a/package.json')
  const before = fs.readFileSync(file, 'utf8')
  await patch(utils, 'getGitRoot', async () => dir, async () => {
    await patch(registry, 'getVersionsFromRegistry', async ({ pkgNames, versionStrategy }) => {
      registryCalls++
      assert.deepStrictEqual(pkgNames, ['@app/a', '@app/b'])
      assert.strictEqual(versionStrategy, 'latest')
      return { '@app/a': '3.0.0' }
    }, async () => {
      await patch(tags, 'getPackageVersionsFromGit', async () => {
        gitCalls++
        return { '@app/a': '4.0.0' }
      }, async () => {
        const changes = await api.syncLocal({ checkOnly: true })
        assert.strictEqual(changes.find(pkg => pkg.name === '@app/a').changes[0].changes[0].newVersion, '4.0.0')
        assert.strictEqual(changes.find(pkg => pkg.name === '@app/b').changes[0].changes[0].newVersion, '^4.0.0')
        assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
      })
    })
  })
  assert.strictEqual(registryCalls, 1)
  assert.strictEqual(gitCalls, 1)
}))
test('a pnpm workspace outside the Git repository cannot take over its project root', () => fixture(async dir => {
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages: [repos/*]\n')
  const repo = path.join(dir, 'repos/independent')
  write(repo, { name: 'independent', private: true, dependencies: { react: '^1.0.0' } })
  const init = spawnSync('git', ['init', repo], { encoding: 'utf8' })
  assert.strictEqual(init.status, 0, init.stderr)
  process.chdir(repo)
  assert.strictEqual(await api.getProjectRoot(), repo)
  await api.syncDeps({ versionMap: { react: '2.0.0' } })
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'))).dependencies.react, '^2.0.0')
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).name, 'root')
}))
for (const [oldVersion, newVersion, expectedChange] of [
  ['^1.0.0', '1.5.0', false], ['^1.0.0', '2.0.0', true],
  ['>=1.0.0', '^2.0.0', false], ['^1.0.0', '^2.0.0', true]
]) {
  test(`exact=false respects ${oldVersion} when the target is ${newVersion}`, () => fixture(async dir => {
    assert.strictEqual(!!update(dir, oldVersion, newVersion, { exact: false }), expectedChange)
  }))
}
test('wildcard target versions honor exact=false', () => fixture(async dir => {
  write(dir, { name: 'root', dependencies: { '@app/a': '^1.0.0' } })
  const changes = await api.syncDeps({ versionMap: { '@app/*': '1.5.0' }, exact: false })
  assert.strictEqual(changes, false)
}))
test('explicit range strategies update caret and tilde ranges and preserve protocols', () => {
  for (const oldVersion of ['^1.0.0', '~1.0.0', '1.0.0']) {
    assert.strictEqual(api.getVersionTransformer('~')('react', oldVersion, '2.0.0'), '~2.0.0')
  }
  for (const oldVersion of ['workspace:*', 'file:../react', 'npm:react@1.0.0', '*']) {
    assert.strictEqual(api.getVersionTransformer('^')('react', oldVersion, '2.0.0'), oldVersion)
  }
})
test('CLI exact=false and check-only preserve a satisfying dependency range', () => fixture(async dir => {
  write(dir, { name: 'root', version: '1.0.0', dependencies: { react: '^1.0.0' } })
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  const result = cli(dir, 'syncdeps', 'react@1.5.0', '--exact', 'false', '--check-only')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
}))
test('CLI check-only exits 1 for a required update without touching the manifest', () => fixture(async dir => {
  write(dir, { name: 'root', version: '1.0.0', dependencies: { react: '^1.0.0' } })
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  const result = cli(dir, 'syncdeps', 'react@2.0.0', '--check-only')
  assert.strictEqual(result.status, 1, result.stderr + result.stdout)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
}))
test('CLI default retain and explicit range override both work', () => fixture(async dir => {
  write(dir, { name: 'root', version: '1.0.0', dependencies: { react: '^1.0.0' } })
  let result = cli(dir, 'syncdeps', 'react@2.0.0')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '^2.0.0')
  result = cli(dir, 'syncdeps', 'react@3.0.0', '--range', '~')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '~3.0.0')
}))

test('CLI help works for synclocal without changing manifests', () => fixture(async dir => {
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  const result = cli(dir, 'synclocal', '--help')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.match(result.stdout, /--check-only/)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
}))

test('CLI syncdeps reads configured targets and lets explicit targets override them', () => fixture(async dir => {
  write(dir, { name: 'root', private: true, dependencies: { react: '^1.0.0' },
    'lerna-ci': { syncremote: { react: '2.0.0' } } })
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  let result = cli(dir, 'syncdeps', '--check-only')
  assert.strictEqual(result.status, 1, result.stderr + result.stdout)
  assert.match(result.stdout + result.stderr, /\^1\.0\.0 => \^2\.0\.0/)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
  result = cli(dir, 'syncdeps', 'react@1.0.0', '--check-only')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  result = cli(dir, 'syncdeps')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '^2.0.0')
}))

test('CLI syncdeps rejects missing targets instead of passing an empty check', () => fixture(async dir => {
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  const result = cli(dir, 'syncdeps', '--check-only')
  assert.strictEqual(result.status, 1, result.stderr + result.stdout)
  assert.match(result.stderr, /Provide package targets or configure/)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
}))

for (const targets of [[], {}]) {
  test(`CLI rejects empty configured targets ${JSON.stringify(targets)}`, () => fixture(async dir => {
    write(dir, { name: 'root', 'lerna-ci': { syncremote: targets } })
    const result = cli(dir, 'syncdeps', '--check-only')
    assert.strictEqual(result.status, 1, result.stderr + result.stdout)
    assert.match(result.stderr, /Provide package targets or configure/)
  }))
}

test('legacy syncremote alias accepts configured target arrays', () => fixture(async dir => {
  write(dir, { name: 'root', dependencies: { react: '^1.0.0' }, 'lerna-ci': { syncremote: ['react@2.0.0'] } })
  const result = cli(dir, 'syncremote')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '^2.0.0')
}))
for (const format of ['package.json', '.lerna-circ.json', 'lerna-ci.config.cjs']) {
  test(`documented configuration is loaded from ${format}`, () => fixture(async dir => {
    const config = { synclocal: { versionSource: 'local', versionRangeStrategy: '~' } }
    if (format === 'package.json') write(dir, { name: 'root', 'lerna-ci': config })
    else fs.writeFileSync(path.join(dir, format), format.endsWith('.cjs') ? `module.exports = ${JSON.stringify(config)}` : JSON.stringify(config))
    assert.deepStrictEqual(await getCliConfig(), config)
  }))
}
test('legacy lerna-cli configuration still works', () => fixture(async dir => {
  fs.writeFileSync(path.join(dir, '.lerna-clirc.json'), JSON.stringify({ syncremote: ['react'] }))
  assert.deepStrictEqual(await getCliConfig(), { syncremote: ['react'] })
}))
test('invalid configuration raises an error', () => fixture(async dir => {
  fs.writeFileSync(path.join(dir, '.lerna-circ.json'), '{broken')
  await assert.rejects(getCliConfig())
}))
test('CLI synclocal uses configured ranges and lets CLI flags override them', () => fixture(async dir => {
  write(dir, { name: 'root', private: true, workspaces: ['packages/*'], 'lerna-ci': { synclocal: { versionSource: 'local', versionRangeStrategy: '~' } } })
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '2.0.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0', dependencies: { '@app/a': '^1.0.0' } })
  let result = cli(dir, 'synclocal')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  const file = path.join(dir, 'packages/b/package.json')
  assert.strictEqual(JSON.parse(fs.readFileSync(file)).dependencies['@app/a'], '~2.0.0')
  result = cli(dir, 'synclocal', '--range', '^')
  assert.strictEqual(result.status, 0, result.stderr + result.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(file)).dependencies['@app/a'], '^2.0.0')
}))
test('registry batching preserves caller arrays and results across multiple batches', async () => {
  const names = Array.from({ length: 14 }, (_, i) => `package-${i}`)
  const before = names.slice()
  await patch(utils, 'runShellCmd', async () => JSON.stringify('1.0.0'), async () => {
    const result = await api.getVersionsFromRegistry({ pkgNames: names, npmClient: 'npm' })
    assert.deepStrictEqual(names, before)
    assert.deepStrictEqual(Object.keys(result), before)
  })
})
test('max-stable handles unsorted lists and prerelease-only fallback without mutation', () => {
  const versions = ['2.0.0-beta.1', '1.9.0', '1.0.0', 'invalid', '2.0.0-beta.2']
  const before = versions.slice()
  assert.strictEqual(getMaxStableVersion(versions, 'max-stable'), '1.9.0')
  assert.strictEqual(getMaxStableVersion(versions, 'max'), '2.0.0-beta.2')
  assert.strictEqual(getMaxStableVersion(['1.0.0-beta.2', '1.0.0-beta.1'], 'max-stable'), '1.0.0-beta.2')
  assert.strictEqual(getMaxStableVersion([], 'max'), '')
  assert.deepStrictEqual(versions, before)
})
for (const [client, output] of [[npm, JSON.stringify(['1.0.0'])], [yarn, JSON.stringify({ type: 'inspect', data: ['1.0.0'] })], [yarnNext, JSON.stringify({ versions: ['1.0.0'] })]]) {
  test(`registry explicit version takes precedence over latest for ${client === npm ? 'npm' : client === yarn ? 'yarn' : 'yarn-next'}`, async () => {
    await patch(utils, 'runShellCmd', async () => output, async () => {
      assert.strictEqual(await client.getPkgVersion({ pkgName: 'react', versionStrategy: 'latest', version: '1.0.0' }), '1.0.0')
      assert.strictEqual(await client.getPkgVersion({ pkgName: 'react', versionStrategy: 'latest', version: '2.0.0' }), '')
    })
  })
}
test('npm supports a scalar version response', async () => {
  await patch(utils, 'runShellCmd', async () => JSON.stringify('1.0.0'), async () => {
    assert.strictEqual(await npm.getPkgVersion({ pkgName: 'react', versionStrategy: 'max' }), '1.0.0')
  })
})
test('Git max-stable ignores malformed tags and prefers a stable release', async () => {
  await patch(utils, 'syncPruneGitTags', async () => {}, async () => {
  await patch(utils, 'runShellCmd', async (_cmd, args) => args[0] === 'fetch' ? '' : '@app/a@2.0.0-beta.1\n@app/a@1.9.0\n@app/a@1bad\n@app/b@1.0.0-beta.2\n@app/b@1.0.0-beta.1\n', async () => {
    assert.deepStrictEqual(await api.getPackageVersionsFromGit('max-stable'), { '@app/a': '1.9.0', '@app/b': '1.0.0-beta.2' })
  })
  })
})
test('shell:false passes literal arguments, including spaces and shell substitutions', async () => {
  const argument = 'hello world; echo injected $(echo substituted) & | "quoted"'
  assert.strictEqual(await api.runShellCmd(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', argument], { shell: false }), argument)
})
test('runShellCmd retains shell redirection for existing API consumers', () => fixture(async dir => {
  const file = path.join(dir, 'legacy output.txt')
  await api.runShellCmd(`echo legacy > "${file}"`)
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim(), 'legacy')
}))
test('registry commands explicitly disable the shell for untrusted package arguments', () => fixture(async () => {
  await patch(utils, 'runShellCmd', async (_cmd, args, options) => {
    assert.strictEqual(options.shell, false)
    assert.strictEqual(args.includes('pkg; echo injected'), true)
    return JSON.stringify('1.0.0')
  }, async () => {
    assert.strictEqual(await npm.getPkgVersion({ pkgName: 'pkg; echo injected', versionStrategy: 'latest' }), '1.0.0')
  })
}))
test('commands reject missing executables and unsuccessful exit codes', async () => {
  await assert.rejects(api.runShellCmd('lerna-ci-no-such-command', { shell: false }), error => error.code === 'ENOENT')
  await assert.rejects(api.runShellCmd(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(2)'], { shell: false }), error => String(error).includes('error code: 2'))
})
if (process.platform !== 'win32') test('signal-terminated commands reject rather than report success', async () => {
  await assert.rejects(api.runShellCmd(process.execPath, ['-e', 'process.kill(process.pid,"SIGTERM")'], { shell: false }), error => String(error).includes('SIGTERM'))
})
async function publishMock(status, revisionCounts, run, pkgs = [], registry = async () => '[]') {
  await patch(utils, 'syncPruneGitTags', async () => {}, async () => {
  await patch(utils, 'getGitRoot', async () => '/repo', async () => {
    await patch(changed, 'getChanged', async () => pkgs, async () => {
      await patch(utils, 'runShellCmd', async (cmd, args) => {
        if (cmd === 'npm') return registry(args)
        if (args[0] === 'status') return status
        if (args[0] === 'rev-list') return revisionCounts
        return ''
      }, run)
    })
  })
  })
}
for (const code of ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']) {
  test(`canPublish blocks Git conflict ${code} even with checkCommit=false`, async () => {
    await publishMock(`${code} file.txt\n`, '0\t0\n', async () => {
      const result = await api.canPublish({ releaseType: 'patch', checkCommit: false })
      assert.strictEqual(result.eligible, false)
      assert.strictEqual(result.reasons[0].content.status, 'conflicts')
      assert.deepStrictEqual(result.reasons[0].content.files, ['file.txt'])
    })
  })
}
test('canPublish uses revision counts for ahead, behind, and diverged branches', async () => {
  for (const [counts, eligible] of [['0\t0', true], ['3\t0', true], ['0\t2', false], ['3\t2', false]]) {
    await publishMock('', counts, async () => {
      assert.strictEqual((await api.canPublish({ releaseType: 'patch' })).eligible, eligible)
    })
  }
})
test('canPublish fails when the registry cannot verify next-version availability', () => fixture(async dir => {
  await publishMock('', '0\t0', async () => {
    await assert.rejects(api.canPublish({ releaseType: 'patch' }), /E401/)
  }, [{ name: 'root', version: '1.0.0', private: false, location: dir }], async () => { throw new Error('registry E401') })
}))
test('registry missing-package and existing-version responses are distinguished', () => fixture(async dir => {
  const pkgs = [{ name: 'root', version: '1.0.0', private: false, location: dir }]
  await publishMock('', '0\t0', async () => {
    assert.strictEqual((await api.canPublish({ releaseType: 'patch' })).eligible, true)
  }, pkgs, async () => { throw new Error('registry E404') })
  await publishMock('', '0\t0', async () => {
    assert.strictEqual((await api.canPublish({ releaseType: 'patch' })).eligible, false)
  }, pkgs, async () => JSON.stringify(['1.0.1']))
}))

test('normal workspace brace expansion works and deeply nested patterns are rejected', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.0.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0' })
  write(dir, { name: 'root', private: true, workspaces: ['packages/{a,b}'] })
  assert.strictEqual((await api.getAllPackageDigests()).length, 3)
  for (const pattern of ['{'.repeat(5000) + 'a,b' + '}'.repeat(5000), '('.repeat(5000) + 'x' + ')'.repeat(5000)]) {
    write(dir, { name: 'root', private: true, workspaces: [pattern] })
    await assert.rejects(api.getAllPackageDigests(), /nesting exceeds/)
  }
}))
test('Yarn Classic workspace output can contain headers and trailing log lines', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.0.0' })
  write(dir, { name: 'root', private: true, packageManager: 'yarn@1.22.22', workspaces: { packages: ['packages/*'] } })
  await patch(utils, 'runShellCmd', async (_cmd, args) => args[0] === '--version' ? '1.22.22' : 'yarn workspaces v1.22.22\n{\n  "@app/a": {"location":"packages/a"}\n}\nDone in 0.03s.\n', async () => {
    assert.strictEqual((await api.getAllPackageDigests()).length, 2)
  })
}))
test('Changesets status uses separate temporary files and cleans up concurrent requests', () => fixture(async dir => {
  fs.mkdirSync(path.join(dir, '.changeset'))
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.0.0' })
  const outputs = []
  await patch(utils, 'getGitRoot', async () => dir, async () => {
    await patch(utils, 'runNpmCmd', async (...args) => {
      const output = args[args.indexOf('--output') + 1]
      outputs.push(output)
      fs.writeFileSync(output, JSON.stringify({ releases: [{ name: '@app/a' }] }))
      return ''
    }, async () => {
      const results = await Promise.all([api.getChanged(), api.getChanged()])
      assert.strictEqual(new Set(outputs).size, 2)
      assert.deepStrictEqual(results.map(pkgs => pkgs.map(pkg => pkg.name)), [['@app/a'], ['@app/a']])
      for (const output of outputs) assert.strictEqual(fs.existsSync(path.dirname(output)), false)
    })
  })
}))

test('syncLocal updates satisfying ranges by default and can preserve them with exact=false', () => fixture(async dir => {
  write(path.join(dir, 'packages/a'), { name: '@app/a', version: '1.5.0' })
  write(path.join(dir, 'packages/b'), { name: '@app/b', version: '1.0.0', dependencies: { '@app/a': '^1.0.0' } })
  assert.strictEqual(await api.syncLocal({ versionSource: 'local', exact: false }), false)
  assert.strictEqual((await api.syncLocal({ versionSource: 'local' })).length, 1)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'packages/b/package.json'))).dependencies['@app/a'], '^1.5.0')
}))

if (process.platform === 'win32') test('Windows cmd shims receive paths and arguments containing spaces', () => fixture(async dir => {
  const script = path.join(dir, 'echo arguments.cjs')
  const shim = path.join(dir, 'echo arguments.cmd')
  fs.writeFileSync(script, 'process.stdout.write(process.argv[2])')
  fs.writeFileSync(shim, '@echo off\r\nnode "%~dp0echo arguments.cjs" %*\r\n')
  assert.strictEqual(await api.runShellCmd(shim, ['a workspace with spaces'], { shell: false }), 'a workspace with spaces')
}))

test('native workspace discovery resolves Git once and still reads fresh manifests', () => fixture(async dir => {
  const childProcess = require('child_process')
  const spawn = childProcess.spawn
  let gitCalls = 0
  await patch(childProcess, 'spawn', (cmd, ...args) => {
    if (cmd === 'git') gitCalls++
    return spawn(cmd, ...args)
  }, async () => {
    await api.getAllPackageDigests()
    assert.strictEqual(gitCalls, 1)
    write(dir, { name: 'root', version: '2.0.0', private: true })
    assert.strictEqual((await api.getAllPackageDigests())[0].version, '2.0.0')
  })
}))
test('registry lookups deduplicate names, maintain result order, and keep the concurrency limit', async () => {
  const names = Array.from({ length: 14 }, (_, index) => `package-${index}`)
  const input = [...names, names[0], names[6]]
  const before = input.slice()
  const events = []
  let active = 0
  let maximum = 0
  await patch(utils, 'runShellCmd', async (_cmd, args) => {
    const name = args[1]
    events.push(`start:${name}`)
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setTimeout(resolve, name === names[0] ? 100 : 5))
    active--
    events.push(`end:${name}`)
    return JSON.stringify('1.0.0')
  }, async () => {
    const result = await api.getVersionsFromRegistry({ pkgNames: input, npmClient: 'npm' })
    assert.deepStrictEqual(input, before)
    assert.deepStrictEqual(Object.keys(result), names)
    assert.strictEqual(events.filter(event => event.startsWith('start:')).length, names.length)
    assert.strictEqual(maximum, 6)
    assert.ok(events.indexOf(`start:${names[6]}`) < events.indexOf(`end:${names[0]}`))
  })
})
test('explicit wildcard versions do not trigger redundant registry requests', () => fixture(async dir => {
  write(dir, { name: 'root', version: '1.0.0', dependencies: { '@app/a': '^1.0.0' } })
  let requests = 0
  await patch(utils, 'runShellCmd', async () => { requests++; return JSON.stringify('9.0.0') }, async () => {
    await api.syncDeps({ packageNames: ['@app/a'], versionMap: { '@app/*': '2.0.0' } })
    assert.strictEqual(requests, 0)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies['@app/a'], '^2.0.0')
  })
}))

test('version-source enum is available to JavaScript consumers', () => {
  assert.deepStrictEqual(api.EVerSource, { ALL: 'all', LOCAL: 'local', NPM: 'npm', GIT: 'git' })
})

test('workspace discovery retains JSON5, YAML, exclusions, and locale-based ordering', () => fixture(async dir => {
  write(dir, { name: 'root', private: true, workspaces: ['packages/*', '!packages/excluded'] })
  write(path.join(dir, 'packages/excluded'), { name: 'excluded', version: '1.0.0' })
  const manifests = [
    ['Z', 'package.json5', "{name: 'json5', version: '1.0.0', private: true}"],
    ['a', 'package.yaml', 'name: yaml\nversion: 2.0.0\n'],
  ]
  for (const [folder, filename, content] of manifests) {
    fs.mkdirSync(path.join(dir, 'packages', folder), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', folder, filename), content)
  }
  const pkgs = await api.getAllPackageDigests()
  const expected = manifests.map(([folder]) => path.join(dir, 'packages', folder)).sort((a, b) => a.localeCompare(b))
  assert.deepStrictEqual(pkgs.slice(0, -1).map(pkg => pkg.location), expected)
  assert.deepStrictEqual(pkgs.map(pkg => pkg.name).sort(), ['json5', 'root', 'yaml'])
}))
test('YAML configuration is found from a nested working directory', () => fixture(async dir => {
  fs.writeFileSync(path.join(dir, '.lerna-circ.yaml'), 'synclocal:\n  versionSource: local\n  versionRangeStrategy: "~"\n')
  const nested = path.join(dir, 'nested/deep')
  fs.mkdirSync(nested, { recursive: true })
  process.chdir(nested)
  assert.deepStrictEqual(await getCliConfig(), { synclocal: { versionSource: 'local', versionRangeStrategy: '~' } })
}))
test('fixpack preserves formatting options and supports dry-run without writing', () => fixture(async dir => {
  write(dir, { version: '1.0.0', name: 'root', private: true, dependencies: { z: '1.0.0', a: '1.0.0' } })
  const config = require(path.join(dist, 'fixpack-all/config')).default
  const file = path.join(dir, 'package.json')
  const before = fs.readFileSync(file, 'utf8')
  await api.fixpack({ config: { ...config, quiet: true, dryRun: true } })
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
  await api.fixpack({ config: { ...config, quiet: true } })
  const formatted = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepStrictEqual(Object.keys(formatted).slice(0, 2), ['name', 'version'])
  assert.deepStrictEqual(Object.keys(formatted.dependencies), ['a', 'z'])
  assert.deepStrictEqual(await api.fixpack({ config: { ...config, quiet: true } }), [])
}))

test('catalog synchronization is automatic and preserves references, comments, quotes and CRLF', () => {
  const content = [
    '# workspace settings', 'packages: ["packages/*"]', 'catalogMode: strict', 'cleanupUnusedCatalogs: false',
    'catalog:', '  react: "^1.0.0" # shared default', 'catalogs:', '  legacy:', "    react: '~1.0.0' # named catalog",
    'overrides:', '  react: catalog:default', '',
  ].join('\r\n')
  const manifest = { name: 'app', version: '1.0.0', dependencies: { react: 'catalog:' }, devDependencies: { react: 'catalog:default' },
    peerDependencies: { react: 'catalog:legacy' }, optionalDependencies: { react: 'catalog: legacy ' } }
  return catalogFixture(content, { 'packages/app': manifest }, async (dir, file) => {
    const packageFile = path.join(dir, 'packages/app/package.json')
    const before = fs.readFileSync(packageFile, 'utf8')
    const options = { versionMap: { react: '2.0.0' } }
    const planned = await api.syncDeps({ ...options, checkOnly: true })
    assert.strictEqual(planned.length, 1)
    assert.strictEqual(planned[0].name, 'pnpm-workspace.yaml')
    assert.deepStrictEqual(planned[0].changes.map(change => change.field), ['catalog', 'catalogs.legacy'])
    assert.strictEqual(fs.readFileSync(file, 'utf8'), content)
    assert.strictEqual(fs.readFileSync(packageFile, 'utf8'), before)
    assert.deepStrictEqual(await api.syncDeps(options), planned)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), content.replace('^1.0.0', '^2.0.0').replace('~1.0.0', '~2.0.0'))
    assert.strictEqual(fs.readFileSync(packageFile, 'utf8'), before)
    assert.strictEqual(await api.syncDeps(options), false)
  })
})

test('catalogs.default supports both default references and refreshes values on every call', () => catalogFixture(
  'packages: [packages/*]\ncatalogs:\n  default: {react: ^1.0.0}\n',
  { 'packages/app': { name: 'app', dependencies: { react: 'catalog:' }, devDependencies: { react: 'catalog:default' } } },
  async (_dir, file) => {
    await api.syncDeps({ versionMap: { react: '2.0.0' }, versionRangeStrategy: '~' })
    assert.match(fs.readFileSync(file, 'utf8'), /react: ~2\.0\.0/)
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('~2.0.0', '^1.0.0'))
    await api.syncDeps({ versionMap: { react: '3.0.0' } })
    assert.match(fs.readFileSync(file, 'utf8'), /react: \^3\.0\.0/)
  }
))

test('catalog exact=false checks the resolved range and preserves satisfying ranges', () => catalogFixture(
  'packages: [packages/*]\ncatalog: {react: ^1.0.0}\n',
  { 'packages/app': { name: 'app', dependencies: { react: 'catalog:' } } },
  async (_dir, file) => {
    const before = fs.readFileSync(file, 'utf8')
    assert.strictEqual(await api.syncDeps({ versionMap: { react: '^1.5.0' }, exact: false }), false)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
    await api.syncDeps({ versionMap: { react: '2.0.0' }, exact: false })
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before.replace('^1.0.0', '^2.0.0'))
  }
))

test('custom transforms receive catalog ranges and never rewrite catalog references', () => catalogFixture(
  'packages: [packages/*]\ncatalog: {react: ^1.0.0}\n',
  { 'packages/app': { name: 'app', dependencies: { react: 'catalog:' } } },
  async (dir, file) => {
    const calls = []
    const versionRangeStrategy = (...args) => { calls.push(args); return '~2.0.0' }
    await api.syncDeps({ versionMap: { react: '2.0.0' }, versionRangeStrategy })
    assert.deepStrictEqual(calls, [['react', '^1.0.0', '2.0.0']])
    assert.match(fs.readFileSync(file, 'utf8'), /react: ~2\.0\.0/)
    const location = path.join(dir, 'packages/app')
    assert.strictEqual(api.updatePackageJSON({ pkgDigest: { location }, latestVersions: { react: '3.0.0' }, versionTransform: api.getVersionTransformer('retain') }), false)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(location, 'package.json'))).dependencies.react, 'catalog:')
  }
))

test('syncLocal updates semver catalog entries and preserves newer pnpm workspace and local protocols', () => catalogFixture(
  'packages: [packages/*]\ncatalog:\n  "@app/a": ^1.0.0\ncatalogs:\n  linked:\n    "@app/a": workspace:^\n  local:\n    "@app/a": file:./packages/a\n  symlink:\n    "@app/a": link:./packages/a\n',
  { 'packages/a': { name: '@app/a', version: '2.0.0' }, 'packages/b': { name: '@app/b', version: '1.0.0', dependencies: { '@app/a': 'catalog:' },
    devDependencies: { '@app/a': 'catalog:linked' }, optionalDependencies: { '@app/a': 'catalog:local' }, peerDependencies: { '@app/a': 'catalog:symlink' } } },
  async (dir, file) => {
    const before = fs.readFileSync(file, 'utf8')
    assert.strictEqual((await api.syncLocal({ versionSource: 'local', checkOnly: true })).length, 1)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
    await api.syncLocal({ versionSource: 'local' })
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before.replace('^1.0.0', '^2.0.0'))
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'packages/b/package.json'))).dependencies['@app/a'], 'catalog:')
  }
))

test('wildcard registry targets include catalog-only and override-only entries without duplicate requests', () => catalogFixture(
  'packages: [packages/*]\ncatalog: {"@scope/a": ^1.0.0, "@scope/b": ~1.0.0}\ncatalogs:\n  named: {"@scope/a": ^1.0.0}\noverrides:\n  "parent@>1>@scope/b@^1": "catalog:"\n',
  { 'packages/app': { name: 'app', dependencies: { '@scope/a': 'catalog:' } } },
  async (_dir, file) => {
    const original = utils.runShellCmd
    const names = []
    await patch(utils, 'runShellCmd', async (cmd, args, options) => {
      if (args[0] === 'info') { names.push(args[1]); return JSON.stringify('2.0.0') }
      return original(cmd, args, options)
    }, async () => {
      await api.syncDeps({ packageNames: ['@scope/*'] })
      assert.deepStrictEqual(names.sort(), ['@scope/a', '@scope/b'])
      assert.strictEqual((fs.readFileSync(file, 'utf8').match(/2\.0\.0/g) || []).length, 3)
    })
  }
))

test('pnpm workspace roots are found from package subdirectories without Git or packageManager', () => catalogFixture(
  'packages: [packages/*]\ncatalog: {react: ^1.0.0}\n',
  { 'packages/app': { name: 'app', dependencies: { react: 'catalog:' } } },
  async (dir, file) => {
    write(dir, { name: 'root', private: true })
    process.chdir(path.join(dir, 'packages/app'))
    assert.strictEqual(await api.getProjectRoot(), dir)
    assert.strictEqual(await api.getRepoNpmClient(), 'pnpm')
    await api.syncDeps({ versionMap: { react: '2.0.0' } })
    assert.match(fs.readFileSync(file, 'utf8'), /react: \^2\.0\.0/)
  }
))

for (const [label, content, dependencies, error] of [
  ['missing entry', 'catalog: {vue: ^1.0.0}', { react: 'catalog:' }, /No catalog entry react/],
  ['missing named catalog', 'catalog: {react: ^1.0.0}', { react: 'catalog:missing' }, /catalog missing/],
  ['duplicate default', 'catalog: {react: ^1.0.0}\ncatalogs: {default: {react: ^1.0.0}}', {}, /defined twice/],
  ['recursive catalog', 'catalog: {react: "catalog:other"}', {}, /recursively references/],
  ['non-string entry', 'catalog: {react: 1}', {}, /expected a string/],
  ['invalid YAML', 'catalog: {react:', {}, /Invalid/],
  ['missing override entry', 'catalog: {react: ^1.0.0}\noverrides: {vue: "catalog:"}', {}, /No catalog entry vue/],
  ['shared YAML anchor', 'catalog: {react: &shared ^1.0.0}\notherSetting: *shared', {}, /Cannot safely update/],
  ['shared catalog mapping', 'catalog: &shared {react: ^1.0.0}\notherSetting: *shared', {}, /Cannot safely update/],
  ['merged catalog mapping', 'versions: &shared {react: ^1.0.0}\ncatalog: {<<: *shared}', {}, /Cannot safely update/],
  ['block scalar entry', 'catalog:\n  react: >-\n    ^1.0.0\notherSetting: keep', {}, /Cannot safely update/],
]) {
  test(`invalid catalog (${label}) is reported before any files are written`, () => catalogFixture(
    `packages: [packages/*]\n${content}\n`,
    { 'packages/app': { name: 'app', dependencies: { direct: '^1.0.0', ...dependencies } } },
    async (dir, file) => {
      const packageFile = path.join(dir, 'packages/app/package.json')
      const before = fs.readFileSync(packageFile, 'utf8')
      const workspaceBefore = fs.readFileSync(file, 'utf8')
      await assert.rejects(api.syncDeps({ versionMap: { direct: '2.0.0', react: '2.0.0' } }), error)
      assert.strictEqual(fs.readFileSync(packageFile, 'utf8'), before)
      assert.strictEqual(fs.readFileSync(file, 'utf8'), workspaceBefore)
    }
  ))
}

test('pnpm without catalogs retains ordinary dependency synchronization by default', () => fixture(async dir => {
  write(dir, { name: 'root', private: true, packageManager: 'pnpm@10.34.6', workspaces: ['packages/*'], dependencies: { react: '^1.0.0' } })
  assert.strictEqual((await api.syncDeps({ versionMap: { react: '2.0.0' } })).length, 1)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '^2.0.0')
  assert.strictEqual(fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')), false)
}))
test('pnpm without catalogs does not expand unrelated YAML alias graphs', () => catalogFixture(
  `packages: [packages/*]\nshared: &shared [one, two]\notherSetting: [${Array(101).fill('*shared').join(', ')}]\n`,
  { 'packages/app': { name: 'app', dependencies: { react: '^1.0.0' } } },
  async dir => {
    assert.strictEqual((await api.syncDeps({ versionMap: { react: '2.0.0' } })).length, 1)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'packages/app/package.json'))).dependencies.react, '^2.0.0')
  },
))
test('large catalog updates preserve every entry and surrounding comments', () => {
  const entries = Array.from({ length: 1000 }, (_item, i) => `  pkg-${i}: "^1.0.0" # entry ${i}`)
  const targets = Object.fromEntries(entries.map((_entry, i) => [`pkg-${i}`, '2.0.0']))
  return catalogFixture(`# before\ncatalog:\n${entries.join('\n')}\n# after\n`, {}, async (_dir, file) => {
    const before = fs.readFileSync(file, 'utf8')
    const preview = await api.syncDeps({ versionMap: targets, checkOnly: true })
    assert.strictEqual(preview[0].changes[0].changes.length, 1000)
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
    await api.syncDeps({ versionMap: targets })
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before.split('^1.0.0').join('^2.0.0'))
  })
})

test('a dangling pnpm catalog reference without a workspace file fails before writing', () => fixture(async dir => {
  write(dir, { name: 'root', private: true, packageManager: 'pnpm@10.34.6', dependencies: { react: 'catalog:', direct: '^1.0.0' } })
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  await assert.rejects(api.syncDeps({ versionMap: { direct: '2.0.0' } }), /No catalog entry react/)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
}))

for (const packageManager of ['npm@10.0.0', 'yarn@1.22.22']) {
  test(`${packageManager} ignores pnpm catalog settings and retains ordinary sync behavior`, () => fixture(async dir => {
    write(dir, { name: 'root', private: true, packageManager, workspaces: ['packages/*'], dependencies: { react: '^1.0.0' } })
    const file = path.join(dir, 'pnpm-workspace.yaml')
    const content = 'catalog: [invalid, ignored]\n'
    fs.writeFileSync(file, content)
    const original = utils.runShellCmd
    await patch(utils, 'runShellCmd', async (cmd, args, options) => {
      assert.notStrictEqual(cmd, 'pnpm')
      if (cmd === 'yarn') return args[0] === '--version' ? '1.22.22' : '{}'
      return original(cmd, args, options)
    }, async () => {
      await api.syncDeps({ versionMap: { react: '2.0.0' } })
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).dependencies.react, '^2.0.0')
      assert.strictEqual(fs.readFileSync(file, 'utf8'), content)
    })
  }))
}

;(async () => {
  let failed = 0
  for (const { name, run } of tests) {
    try { await run(); console.log(`ok - ${name}`) }
    catch (error) { failed++; console.error(`not ok - ${name}\n${error.stack || error}`) }
  }
  console.log(`${tests.length - failed}/${tests.length} regression tests passed`)
  process.exitCode = failed ? 1 : 0
})()

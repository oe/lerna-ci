import { runShellCmd, findFileRecursive } from 'deploy-toolkit'
import semver from 'semver'
import path from 'path'

export type IPkgFilter = (pkg: IPkgDigest, index: number, arr: IPkgDigest[]) => boolean
/**
 * package version data source
 */
export const enum EVerSource {
  /** both npm and git */
  ALL = 'all',
  /** from npm */
  NPM = 'npm',
  /** from git */
  GIT = 'git'
}
export interface IPkgDigest {
  /** package name */
  name: string
  /** package version */
  version: string
  /** whether package is private */
  private: boolean
  /** package folder full path */
  location: string
}

export interface IPkgVersions {
  /** package name: package version no.(without `v`) */
  [k: string]: string
}

/**
 * get all package's info in a lerna project
 * @param needPrivate whether get private package
 * @param searchKwd filter package name which contain searchKwd
 */
export async function getAllPkgDigest (needPrivate = true, searchKwd = '') {
  const isWin = /^win/.test(process.platform)
  const args = ['lerna', 'list', '--json']
  if (needPrivate) args.push('--all')
  if (searchKwd) args.push(searchKwd)
  try {
    const pkgsString = await runShellCmd(isWin ? 'npx.cmd' : 'npx', args)
    return JSON.parse(
      pkgsString
        .split('\n')
        .filter(l => /^[\s\[\]]/.test(l))
        .join('\n')
    ) as IPkgDigest[]
  } catch (error) {
    console.warn('[lerna-ci]exec lerna failed', error)
    const defPkgPath = findFileRecursive('package.json', process.cwd())
    if (!defPkgPath) return []
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(defPkgPath)
    return [
      {
        name: pkg.name,
        version: pkg.version,
        private: pkg.private || false,
        location: path.dirname(defPkgPath)
      }
    ] as IPkgDigest[]
  }
}

/**
 * remove version in tag
 * @param tag tag name: @elements/list@1.2.3
 */
function removeTagVersion (tag: string) {
  return tag.replace(/@\d.*$/, '')
}

/**
 * get newest tag from remote git server
 */
export async function getLatestPkgVersFromGit () {
  // sync all tags from remote, and prune noexists tags in locale
  await runShellCmd('git', ['fetch', 'origin', '--prune', '--tags'])
  // get tags sort by tag version desc
  const tags = await runShellCmd('git', [
    'tag',
    '-l',
    '|',
    'sort',
    '-V',
    '--reverse'
  ])
  return tags
    .trim()
    .split('\n')
    .reduce((acc, cur) => {
      const last = acc[acc.length - 1]
      if (last && removeTagVersion(last) === removeTagVersion(cur)) return acc
      acc.push(cur)
      return acc
    }, [] as string[])
    .reduce((acc, cur) => {
      const tagVerReg = /^((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*)@(\d.*)$/
      const matches = tagVerReg.exec(cur)
      if (matches) {
        acc[matches[1]] = matches[2]
      } else {
        console.warn('[warning]unmatched tag', cur)
      }
      return acc
    }, {}) as IPkgVersions
}

/**
 * get versions from npm server
 * @param pkgs pkgs need to version info
 */
export async function getLatestVersFromNpm (pkgNames: string[]) {
  const result: IPkgVersions = {}
  while (pkgNames.length) {
    const items = pkgNames.splice(-10)
    const verStrings = await Promise.all(items.map(name => runShellCmd('yarn', ['info', name, 'version', '--json'])))
    verStrings.forEach((verStr, idx) => {
      if (!verStr) return
      const ver = JSON.parse(verStr)
      if (ver.type !== 'inspect') return
      result[items[idx]] = ver.data
    })
  }
  return result
}

function maxVersion (...vers: (string | undefined)[]) {
  const def = '0.0.0'
  return vers.reduce((res, cur) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return semver.compare(res!, cur || def) > 0 ? res : cur || def
  }, def)
}

/**
 * get versions from remote server
 * @param verSource version source: from git, npm or both
 * @param pkgs packages need version info
 */
export async function getLatestVersions (verSource: EVerSource, pkgs: IPkgDigest[]) {
  if (!pkgs.length) return {}
  // local package versions
  const localVers: IPkgVersions = {}
  pkgs.reduce((acc, cur) => {
    acc[cur.name] = cur.version
    return acc
  }, localVers)

  // versions info from npm
  let npmVers: IPkgVersions = {}
  if (verSource !== EVerSource.GIT) npmVers = await getLatestVersFromNpm(pkgs.map(item => item.name))

  // versions info from git
  let gitVers: IPkgVersions = {}
  if (verSource !== EVerSource.NPM) gitVers = await getLatestPkgVersFromGit()
  let keys = [...Object.keys(npmVers), ...Object.keys(gitVers)]
  keys = keys.filter((item, idx) => keys.indexOf(item) === idx)
  const vers: IPkgVersions = {}
  keys.reduce((acc, key) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    acc[key] = maxVersion(npmVers[key], gitVers[key], localVers[key])!
    return acc
  }, vers)
  const result: IPkgVersions = {}
  pkgs.reduce((acc, item) => {
    if (vers[item.name]) acc[item.name] = vers[item.name]
    return acc
  }, result)
  return result
}
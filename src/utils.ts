import { runShellCmd, findFileRecursive } from 'deploy-toolkit'
import semver from 'semver'
import path from 'path'

export type IPkgFilter = (pkg: IPkgBasicInfo, index: number, arr: IPkgBasicInfo[]) => boolean

export type EVerSource = 'all' | 'npm' | 'git'
export interface IPkgBasicInfo {
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
  [k: string]: string
}

/**
 * get all package's info in a lerna project
 * @param needPrivate whether get private package
 * @param searchKwd filter package name which contain searchKwd
 */
export async function getAllPkgNames (needPrivate = true, searchKwd = '') {
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
    ) as IPkgBasicInfo[]
  } catch (error) {
    console.warn('[lerna-ci]exec lerna failed', error)
    const defPkgPath = findFileRecursive('package.json', process.cwd())
    if (!defPkgPath) return []
    const pkg = require(defPkgPath)
    return [
      {
        name: pkg.name,
        version: pkg.version,
        private: pkg.private || false,
        location: path.dirname(defPkgPath)
      }
    ]
  }
}

/**
 * remove version in tag
 * @param tag tag name: @elements/list@1.2.3
 */
function removeTagVersion (tag) {
  return tag.replace(/@\d.*$/, '')
}

/**
 * get newest tag from remote git server
 */
export async function getLatestVerFromGit () {
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
    }, {} as IPkgVersions)
}


export async function getLatestVerFromNpm (pkgs: IPkgBasicInfo[]) {
  const pkgNames = pkgs.map(item => item.name)
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

export async function getLatestVerInner (pkgs) {
  const npmVers = await getLatestVerFromNpm(pkgs)
  const gitVers = await getLatestVerFromGit()
  let keys = [...Object.keys(npmVers), ...Object.keys(gitVers)]
  keys = keys.filter((item, idx) => keys.indexOf(item) === idx)
  return keys.reduce((acc, key) => {
    const nv = npmVers[key]
    const gv = gitVers[key]
    if (nv && gv) {
      acc[key] = semver.compare(nv, gv) > 0 ? nv : gv
    } else {
      acc[key] = nv || gv
    }
    return acc
  }, {} as IPkgVersions)
}


export async function getLatestVersion (verSource: EVerSource, pkgs: IPkgBasicInfo[]) {
  let npmVers: IPkgVersions = {}
  if (verSource !== 'git') npmVers = await getLatestVerFromNpm(pkgs)
  let gitVers: IPkgVersions = {}
  if (verSource !== 'npm') gitVers = await getLatestVerFromGit()
  let keys = [...Object.keys(npmVers), ...Object.keys(gitVers)]
  keys = keys.filter((item, idx) => keys.indexOf(item) === idx)
  return keys.reduce((acc, key) => {
    const nv = npmVers[key]
    const gv = gitVers[key]
    if (nv && gv) {
      acc[key] = semver.compare(nv, gv) > 0 ? nv : gv
    } else {
      acc[key] = nv || gv
    }
    return acc
  }, {} as IPkgVersions)
}
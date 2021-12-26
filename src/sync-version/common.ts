import { runShellCmd } from 'deploy-toolkit'
import fs from 'fs'
import { join } from 'path'
import { IPackageVersions, IPackageDigest } from '../types'
import { getRepoNpmClient } from '../pkg-info'

export type IVersionMap = IPackageVersions
type IVerTransform = (name: string, version: string) => string
export type IVersionStrategy = '>' | '~' | '^' | '>=' | '<' | '<=' | IVerTransform

/**
 * fix package version, convert version number to a range
 *  {'packageName': '1.xxx' } => {'packageName': '^1.xxx' }
 */
export function fixPackageVersions(versionMap: IVersionMap, versionStrategy?: IVersionStrategy) {
  if (!versionStrategy) return versionMap
  let transformer: IVerTransform
  if (typeof versionStrategy === 'string') {
    transformer = (name, ver) => {
      if (/^\d/.test(ver)) return `${versionStrategy}${ver}`
      // remove = for OCD patient
      if (/^\=\d/.test(ver)) return ver.replace('=', '')
      return ver
    }
  } else {
    transformer = versionStrategy
  }
  const result: IVersionMap = {}
  return Object.keys(versionMap).reduce((acc, cur) => {
    acc[cur] = transformer(cur, acc[cur])
    return acc
  }, result)
}

/**
 * get versions from npm server
 */
export async function getVersionsFromNpm(pkgNames: string[], versionStrategy?: INpmVersionStrategy) {
  const result: IPackageVersions = {}
  while (pkgNames.length) {
    const items = pkgNames.splice(-10)
    const vers = await Promise.all(items.map(name => getSingleVersionFromNpm(name, versionStrategy)))
    vers.forEach((ver, idx) => {
      if (!ver) return
      result[items[idx]] = ver
    })
  }
  return result
}

/**
 * npm version strategy
 *  max: max package version
 *  latest: latest release package version
 */
export type INpmVersionStrategy = 'max' | 'latest'

/**
 * get single package version info from npm( via yarn cli )
 * @param name package name
 * @param type version strategy, max version or latest version, default latest
 */
export async function getSingleVersionFromNpm(name: string, type: INpmVersionStrategy = 'latest'): Promise<string | undefined> {
  try {
    // actually only tested yarn and npm
    const npmClient = (await getRepoNpmClient()) || 'yarn'
    console.log('npmClient', npmClient)
    const verStr = await runShellCmd(npmClient, [
      'info',
      name,
      type === 'latest' ? 'version' : 'versions',
      '--json'
    ])
    if (!verStr) return
    const ver = JSON.parse(verStr)
    const result  = ver && ver.type ==='inspect' ? ver.data : ver
    if (type === 'latest') {
      return typeof result === 'string' ? result : undefined
    }
    if (Array.isArray(result)) return result.pop()
    return ver.data
  } catch (error) {
    console.warn(`[lerna-ci] failed to get version of ${name} from npm`, error)
    return
  }
}


/**
 * remove version in tag
 * @param tag tag name: @elements/list@1.2.3
 */
function convertGitTag2Version(tag: string) {
  return tag.replace(/@\d.*$/, '')
}

/**
 * get newest tag from remote git server
 */
export async function getLatestPkgVersFromGit() {
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
  if (!tags) return {}
  return tags
    .trim()
    .split('\n')
    .reduce((acc, cur) => {
      const last = acc[acc.length - 1]
      if (last && convertGitTag2Version(last) === convertGitTag2Version(cur)) return acc
      acc.push(cur)
      return acc
    }, [] as string[])
    .reduce((acc, cur) => {
      const tagVerReg = /^((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*)@(\d.*)$/
      const matches = tagVerReg.exec(cur)
      if (matches) {
        acc[matches[1]] = matches[2]
      }
      return acc
    }, {}) as IPackageVersions
}


/**
 * update a single pkg's package.json, return true if any things updated
 * @param pkgDigest a single pkg's digest info
 * @param latestVersions latest version of all locale packages
 * @param onlyCheck only check, with package.json untouched
 * @param pkgVersion current pkg's latest version, without range indicator(aka, >, ^, ~, etc)
 */
export function updatePkg(
  pkgDigest: IPackageDigest,
  latestVersions: IPackageVersions,
  onlyCheck?: boolean,
  pkgVersion?: string
) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(pkgPath)
  let hasChanged = false
  if (pkgVersion) {
    if (pkgVersion!== pkg.version) {
      console.log(
        `[lerna-ci][sync pkg versions] update ${pkg.name}'s version from ${
          pkg.version
        } => ${latestVersions[pkg.name]}`
      )
      hasChanged = true
      pkg.version = latestVersions[pkg.name]
    }
  }
  const devChanged = updateDepsVersion(pkg.devDependencies, latestVersions)
  const peerChanged = updateDepsVersion(pkg.peerDependencies, latestVersions)
  const depChanged = updateDepsVersion(pkg.dependencies, latestVersions)
  const optDepChanged = updateDepsVersion(pkg.optionalDependencies, latestVersions)
  if (hasChanged || devChanged || depChanged || peerChanged || optDepChanged ) {
    // write file only not in validation mode
    if (!onlyCheck) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    return true
  }
  return false
}

/**
 * update deps versions, return true if any pkg's version updated
 * @param deps original deps object
 * @param versions latest package versions
 */
export function updateDepsVersion(deps: IPackageVersions, versions: IPackageVersions) {
  let hasChanged = false
  if (!deps) return hasChanged
  Object.keys(deps).forEach(k => {
    if (k in versions && deps[k] !== versions[k]) {
      deps[k] = `${versions[k]}`
      hasChanged = true
    }
  })
  return hasChanged
}

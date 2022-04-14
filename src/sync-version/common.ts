import { runShellCmd } from 'deploy-toolkit'
import fs from 'fs'
import { join } from 'path'
import { IVersionMap, IPackageDigest } from '../types'
import { getRepoNpmClient } from '../pkg-info'
import { maxVersion, PKG_DEP_KEYS } from './../utils'

type IVerTransform = (name: string, version: string) => string
/**
 * version transform strategy
 *  '' for exact version
 */
export type IVersionRangeStrategy = '>' | '~' | '^' | '>=' | '<' | '<=' | '' | IVerTransform

/**
 * fix package version, convert version number to a range
 *  {'packageName': '1.xxx' } => {'packageName': '^1.xxx' }
 */
export function addRange2VersionMap(versionMap: IVersionMap, rangeStrategy?: IVersionRangeStrategy) {
  let transformer: IVerTransform
  switch (typeof rangeStrategy) {
    case 'string':
      transformer = (name, ver) => {
        if (/^\d/.test(ver)) return `${rangeStrategy}${ver}`
        // remove = for OCD patient
        if (/^\=\d/.test(ver)) return ver.replace('=', '')
        return ver
      }
      break
    case 'function':
      transformer = rangeStrategy
      break
    default:
      return versionMap
  }
  const result: IVersionMap = {}
  return Object.keys(versionMap).reduce((acc, key) => {
    acc[key] = transformer(key, versionMap[key])
    return acc
  }, result)
}

/**
 * get versions from npm server
 */
export async function getVersionsFromNpm(pkgNames: string[], versionStrategy?: IVersionStrategy, npmClient?: 'yarn' | 'npm') {
  const result: IVersionMap = {}
  while (pkgNames.length) {
    const items = pkgNames.splice(-10)
    const vers = await Promise.all(items.map(name => getSingleVersionFromNpm(name, versionStrategy, npmClient)))
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
export type IVersionStrategy = 'max' | 'latest'

/**
 * get single package version info from npm( via yarn cli )
 * @param name package name
 * @param type version strategy, max version or latest version, default latest
 */
export async function getSingleVersionFromNpm(name: string, type: IVersionStrategy = 'latest', npmClient?: 'yarn' | 'npm'): Promise<string | undefined> {
  try {
    // actually only tested yarn and npm
    const npmClientName = npmClient || (await getRepoNpmClient()) || 'npm'
    const verStr = await runShellCmd(npmClientName, [
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


const tagVerReg = /^((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*)@(\d.*)$/
/**
 * convert git tag to {name, version}
 * @param tag tag name: @elements/list@1.2.3
 */
function convertGitTag(tag: string) {
  if (tagVerReg.test(tag)) {
    return {
      name: RegExp.$1,
      version: RegExp.$2,
    }
  }
  return
}

/**
 * get newest tag from remote git server
 */
export async function getPackageVersionsFromGit(type: IVersionStrategy = 'latest') {
  // sync all tags from remote, and prune noexists tags in locale
  await runShellCmd('git', ['fetch', 'origin', '--prune', '--tags'])
  // git semver sorting failed to sort with prerelease version // ['tag', '-l', '|', 'sort', '-V', '--reverse']
  const tagArgs = ['tag', '-l', '--sort=-creatordate']
  // get tags sort by tag version desc
  const tags = await runShellCmd('git', tagArgs)
  if (!tags) return {}
  const tagLines = tags.trim().split('\n')
  if (type === 'latest') {
    return tagLines.reduce((acc, cur) => {
      const tagInfo = convertGitTag(cur)
      if (!tagInfo) return acc
      if (!acc[tagInfo.name]) {
        acc[tagInfo.name] = tagInfo.version
      }
      return acc
    }, {} as IVersionMap)
  } else {
    const versionMap = tagLines.reduce((acc, cur) => {
      const tagInfo = convertGitTag(cur)
      if (!tagInfo) return acc
      if (!acc[tagInfo.name]) {
        acc[tagInfo.name] = [tagInfo.version]
      } else {
        acc[tagInfo.name].push(tagInfo.version)
      }
      return acc
    }, {} as Record<string, string[]>)
    return Object.keys(versionMap).reduce((acc, key) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      acc[key] = maxVersion(...versionMap[key])!
      return acc
    }, {} as IVersionMap)
  }
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
  latestVersions: IVersionMap,
  onlyCheck?: boolean,
  pkgVersion?: string
) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  const content = fs.readFileSync(pkgPath, 'utf8')
  // reserve trailing blank, to avoid unnecessary changes
  let trailing = ''
  if (/\}(\s+)$/.test(content)) {
    trailing = RegExp.$1
  }
  const pkg = JSON.parse(content)
  let hasChanged = false
  if (pkgVersion) {
    if (pkgVersion !== pkg.version) {
      console.log(
        `[lerna-ci][sync pkg versions] update ${pkg.name}'s version from ${
          pkg.version
        } => ${latestVersions[pkg.name]}`
      )
      hasChanged = true
      pkg.version = pkgVersion
    }
  }
  PKG_DEP_KEYS.forEach(key => {
    if (updateDepsVersion(pkg[key], latestVersions)) {
      hasChanged = true
    }
  })
  if (hasChanged) {
    // write file only not in validation mode
    if (!onlyCheck) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing)
    return true
  }
  return false
}

/**
 * update deps versions, return true if any pkg's version updated
 * @param deps original deps object
 * @param versions latest package versions
 */
export function updateDepsVersion(deps: IVersionMap, versions: IVersionMap) {
  let hasChanged = false
  if (!deps) return hasChanged
  Object.keys(deps).forEach(k => {
    if (k in versions && deps[k] !== versions[k]) {
      deps[k] = versions[k]
      hasChanged = true
    }
  })
  return hasChanged
}

import fs from 'fs'
import { join } from 'path'
import { IVersionMap, IPackageDigest } from '../types'
import { PKG_DEP_KEYS } from '../utils'

export type IVerTransform = (name: string, version: string) => string
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
    const ver = getVersion(versions, k)
    if (ver && deps[k] !== ver) {
      deps[k] = ver
      hasChanged = true
    }
  })
  return hasChanged
}

/**
 * get version by name from versions map
 * 
 * @example
 *  versionMap: { '@parcel/*': '^2.3.0', '@parcel/core': '^2.4.0' }
 * return  '^2.4.0' if name is @parcel/core
 * return  '^2.3.0' if name is @parcel/css
 * 
 * @param versionMap version map
 * @param name package name
 * @returns matched version if found
 */
function getVersion(versionMap: IVersionMap, name: string) {
  if(versionMap[name]) return versionMap[name]
  const key = Object.keys(versionMap).find(k => {
    const prefix = getScopedPrefix(k)
    if (!prefix) return false
    return name.startsWith(prefix)
  })
  if (key) return versionMap[key]
  return
}

// match @scope/*
const SCOPED_PKG_REGEX = /^(@[^/]+\/[^*]*)\*$/

export function getScopedPrefix(packageName: string) {
  return SCOPED_PKG_REGEX.test(packageName) && RegExp.$1
}

import fs from 'fs'
import { join } from 'path'
import { IVersionMap, IPackageDigest, IVersionRangeStrategy, IVerTransform } from './types'
import { PKG_DEP_KEYS } from './utils'

/**
 * get version transformer
 * @param rangeStrategy version range strategy
 */
export function getVersionTransformer(rangeStrategy?: IVersionRangeStrategy) {
  if (typeof rangeStrategy === 'function') return rangeStrategy
  if (rangeStrategy === 'retain') return retainVersion
  return (pkgName: string, newVersion: string) => {
    if (/^\d/.test(newVersion)) return (`${rangeStrategy || ''}${newVersion}`).replace(/^\=/, '')
    // remove = for OCD patient
    if (/^\=\d/.test(newVersion)) return newVersion.replace('=', '')
    return newVersion
  }
}

function retainVersion(pkgName: string, newVersion: string, oldVersion: string) {
  const prefix = oldVersion.replace(/\d.*$/, '')
  return prefix + newVersion.replace(/^[^\d]+/, '')
}


export interface IUpdatePackageJSONOptions {
  /** a single pkg's digest info */
  pkgDigest: IPackageDigest
  /**
   * latest version of all locale packages
   */
  latestVersions: IVersionMap
  /**
   * package dependencies' version transformer
   */
  versionTransform: IVerTransform
  /**
   * only check, with package.json untouched
   */
  checkOnly?: boolean
  /**
   * current pkg's latest version, without range indicator(aka, >, ^, ~, etc)
   */
  pkgVersion?: string
}

/**
 * update a single pkg's package.json, return true if any things updated
 * @param pkgDigest a single pkg's digest info
 * @param latestVersions latest version of all locale packages
 * @param checkOnly only check, with package.json untouched
 * @param pkgVersion current pkg's latest version, without range indicator(aka, >, ^, ~, etc)
 */
export function updatePackageJSON(options: IUpdatePackageJSONOptions) {
  const { pkgVersion, pkgDigest, latestVersions, checkOnly, versionTransform } = options
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
        } => ${pkgVersion}`
      )
      hasChanged = true
      pkg.version = pkgVersion
    }
  }
  PKG_DEP_KEYS.forEach(key => {
    if (updateDepsVersion(pkg[key], latestVersions, versionTransform)) {
      hasChanged = true
    }
  })
  if (hasChanged) {
    // write file only not in validation mode
    if (!checkOnly) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing)
    return true
  }
  return false
}

/**
 * update deps versions, return true if any pkg's version updated
 * @param deps original deps object
 * @param versions latest package versions
 */
export function updateDepsVersion(deps: IVersionMap, versions: IVersionMap, versionTransform: IVerTransform) {
  let hasChanged = false
  if (!deps) return hasChanged
  Object.keys(deps).forEach(name => {
    const ver = getVersion(name, deps[name],  versions, versionTransform)
    if (ver && deps[name] !== ver) {
      deps[name] = ver
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
function getVersion(name: string, oldVersion: string, versionMap: IVersionMap, versionTransform: IVerTransform) {
  if(versionMap[name]) return versionTransform(name, oldVersion, versionMap[name])
  const key = Object.keys(versionMap).filter(k => {
    const prefix = getScopedPrefix(k)
    if (!prefix) return false
    return name.startsWith(prefix)
    // get the most closed version prefix
  }).sort((a, b) => b.length - a.length).shift()
  if (key) return versionTransform(name, oldVersion, versionMap[key])
  return
}

// match @scope/*
const SCOPED_PKG_REGEX = /^(@[^/]+\/[^*]*)\*$/

export function getScopedPrefix(packageName: string) {
  return SCOPED_PKG_REGEX.test(packageName) && RegExp.$1
}

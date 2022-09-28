import fs from 'fs'
import path from 'path'
import semver from 'semver'
import {
  IVersionMap,
  IPackageDigest,
  IVersionRangeStrategy,
  IVerTransform,
  IChangedCategory,
  IChangedPkg
} from './types'
import { PKG_DEP_KEYS } from './utils'
import { logger } from './logger'

/**
 * get version transformer
 * @param rangeStrategy version range strategy
 */
export function getVersionTransformer(rangeStrategy?: IVersionRangeStrategy) {
  if (typeof rangeStrategy === 'function') return rangeStrategy
  if (rangeStrategy === 'retain') return retainVersion
  return (pkgName: string, oldVersion: string, newVersion: string) => {
    // if existing version not a valid semver version, like *, workspace:*, use existing version
    if (!/^\d/.test(oldVersion)) return oldVersion
    if (/^\d/.test(newVersion)) return (`${rangeStrategy || ''}${newVersion}`).replace(/^\=/, '')
    // remove = for OCD patient
    if (/^\=\d/.test(newVersion)) return newVersion.replace('=', '')
    return newVersion
  }
}

function retainVersion(pkgName: string, oldVersion: string, newVersion: string) {
  try {
    new semver.Range(oldVersion)
    // ignore *
    if (oldVersion === '*') return oldVersion
  } catch {
    // invalid version range(like workspace:*) will throw an error
    return oldVersion
  }
  // using complex range expression
  if(/\s/.test(oldVersion.trim())) {
    logger.warn(`[lerna-ci] dependency ${pkgName} has complex version range "${oldVersion}", you should update it manually`)
    return oldVersion
  }
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
export function updatePackageJSON(options: IUpdatePackageJSONOptions): IChangedCategory[] | false {
  const { pkgVersion, pkgDigest, latestVersions, checkOnly, versionTransform } = options

  const pkgPath = path.join(pkgDigest.location, 'package.json')
  const content = fs.readFileSync(pkgPath, 'utf8')
  // reserve trailing blank, to avoid unnecessary changes
  let trailing = ''
  if (/\}(\s+)$/.test(content)) {
    trailing = RegExp.$1
  }
  const changedCategories: IChangedCategory[] = []
  const pkg = JSON.parse(content)
  let hasChanged = false
  if (pkgVersion) {
    if (pkgVersion !== pkg.version) {
      hasChanged = true
      changedCategories.push({
        field: 'version',
        changes: [{
          name: pkg.name,
          oldVersion: pkg.version,
          newVersion: pkgVersion,
        }]
      })
      pkg.version = pkgVersion
    }
  }
  PKG_DEP_KEYS.forEach(key => {
    const changes = updateDepsVersion(pkg[key], latestVersions, versionTransform)
    if (changes) {
      changedCategories.push({
        field: key,
        changes
      })
      hasChanged = true
    }
  })
  if (hasChanged) {
    // write file only not in validation mode
    if (!checkOnly) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing)
    return changedCategories
  }
  return false
}



/**
 * update deps versions, return true if any pkg's version updated
 * @param deps original deps object
 * @param versions latest package versions
 */
export function updateDepsVersion(deps: IVersionMap, versions: IVersionMap, versionTransform: IVerTransform): IChangedPkg[] | false {
  let hasChanged = false
  if (!deps) return hasChanged
  const changed: IChangedPkg[] = []
  Object.keys(deps).forEach(name => {
    const ver = getVersion(name, versions, deps[name], versionTransform)
    if (ver && deps[name] !== ver) {
      changed.push({
        name,
        oldVersion: deps[name],
        newVersion: ver,
      })
      deps[name] = ver
      hasChanged = true
    }
  })
  return hasChanged && changed
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
function getVersion(name: string, versionMap: IVersionMap, oldVersion: string, versionTransform: IVerTransform) {
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

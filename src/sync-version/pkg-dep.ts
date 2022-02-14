import path from 'path'
import fs from 'fs'
import { getAllPackageDigests } from '../pkg-info'
import {
  updatePkg,
  getVersionsFromNpm,
  IVersionStrategy,
  addRange2VersionMap,
  IVersionRangeStrategy
} from './common'
import { IPackageDigest, IVersionMap } from '../types'
import { PKG_DEP_KEYS } from '../utils'

export interface ISyncDepOptions {
  /** 
   * package names that should update
   *  will fetch its version from npm by default
   */
  packageNames?: string[]
  /**
   * version map<pkgName, version>
   *  prefer use this as version map if provided
   *  if packageNames also provided, will fetch missing versions
   */
  versionMap?: IVersionMap
  /**
   * npm version strategy
   *  default to 'latest'
   */
  versionStrategy?: IVersionStrategy
  /**
   * version range strategy, use ^ by default
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /** only check, with package.json files untouched */
  checkOnly?: boolean
}

const DEFAULT_OPTIONS: ISyncDepOptions = {
  versionMap: {},
  versionRangeStrategy: '^'
}

/**
 * sync all packages' dependencies' versions
 * @param syncOptions options
 */
export async function syncPackageDependenceVersion(syncOptions: ISyncDepOptions): Promise<IPackageDigest[]> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgDigests = await getAllPackageDigests()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const versionMap = options.versionMap!
  if (options.packageNames) {
    const packageNames = flatPackageNames(options.packageNames, allPkgDigests)
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = packageNames.filter(n => pkgsHasVersion.indexOf(n) === -1)
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromNpm(pkgsWithoutVersion, options.versionStrategy)
      Object.assign(versionMap, versionFromNpm)
    }
  }
  const fixedVersion = addRange2VersionMap(versionMap, options.versionRangeStrategy)
  const pkgsUpdated = allPkgDigests.filter(item => updatePkg(item, fixedVersion, syncOptions.checkOnly))
  return pkgsUpdated
}

// match @scope/*
const SCOPED_PKG_REGEX = /^(@[^/]+\/[^*]*)\*$/
/**
 * flat package names according to mono package's all dependencies (e.g. convert @babel/* to all used scoped packages like @babel/core, @babel/preset-env)
 * @param packageNames package names that should update
 * @param allPkgDigests all mono packages' digest info
 */
function flatPackageNames(packageNames: string[], allPkgDigests: IPackageDigest[]) {
  const scopedNames:string[] = []
  const normalNames:string[] = []
  packageNames.forEach(name => {
    if (SCOPED_PKG_REGEX.test(name)) {
      scopedNames.push(RegExp.$1)
    } else {
      normalNames.push(name)
    }
  })
  if (!scopedNames.length) return packageNames
  const results = allPkgDigests.map(getPackageDependencies)
  let allPackageNames: string[] = []
  allPackageNames = results.reduce((acc, cur) => acc.concat(cur), allPackageNames)
  allPackageNames = Array.from(new Set(allPackageNames))
  const scopedPkgNames = allPackageNames.filter(name => scopedNames.some(scope => name.startsWith(scope)))
  console.log(` found ${scopedPkgNames.length} scoped packages with scopes prefix ${scopedNames.join(', ')}`)
  if (scopedPkgNames.length) {
    console.log(`    ${scopedPkgNames.join('\n    ')}`)
  }
  return normalNames.concat(scopedPkgNames)
}

function getPackageDependencies(pkgDigest: IPackageDigest) {
  const pkgPath = path.join(pkgDigest.location, 'package.json')
  let content = fs.readFileSync(pkgPath, 'utf8')
  content = JSON.parse(content)
  let pkgNames: string[] = []
  PKG_DEP_KEYS.forEach(key => {
    if (!content[key]) return
    pkgNames = pkgNames.concat(Object.keys(content[key]))
  })
  return pkgNames
}

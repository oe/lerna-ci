import {
  getAllPackageDigests,
  getVersionTransformer,
  getVersionsFromRegistry,
  IVersionPickStrategy,
  updatePackageJSON,
  IVersionRangeStrategy,
  isAsteriskPkgName,
  isPkgNameMatchingPattern,
  IPackageDigest,
  IVersionMap,
  getAllDependencies,
  IChangedPackage,
  logger,
} from '../common'

export interface ISyncDepOptions {
  /** 
   * package names that should update
   *  will fetch its version from npm by default
   *  package name can use asterisk, e.g. @babel/*
   * 
   * @example
   *  ['duplex-message', '@typescript-eslint/parser', '@babel/*', '*plugin*', 'react*']
   */
  packageNames?: string[]
  /**
   * version map<pkgName, version>
   *  prefer use this as version map if provided
   *  pkgName can be a pattern like @babel/*
   *  if packageNames also provided, will fetch missing versions
   * @example
   * {'@babel/*': '7.0.0', 'parcel': '^2.0.0', '@types/react': '~18.0.0'}
   */
  versionMap?: IVersionMap
  /**
   * npm version strategy
   *  default to 'max-stable'
   */
  versionPickStrategy?: IVersionPickStrategy
  /**
   * version range strategy, use retain by default
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /** only check, with package.json files untouched */
  checkOnly?: boolean
  /**
   * update version to the exact given version
   *  set to false only update when existing version range is not satisfied
   * @default true
   */
  exact?: boolean
}

const DEFAULT_OPTIONS: ISyncDepOptions = {
  versionMap: {},
  versionRangeStrategy: 'retain',
  versionPickStrategy: 'max-stable',
  exact: true,
}

/**
 * sync all packages' dependencies' versions
 * @param syncOptions options
 */
export async function syncDeps(syncOptions: ISyncDepOptions): Promise<IChangedPackage[] | false> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgDigests = await getAllPackageDigests()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let versionMap = options.versionMap!
  if (Array.isArray(options.packageNames) && options.packageNames.length) {
    const packageNames = flatPackageNames(options.packageNames, allPkgDigests)
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = packageNames.filter(n => pkgsHasVersion.indexOf(n) === -1)
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromRegistry({ pkgNames: pkgsWithoutVersion, versionStrategy: options.versionPickStrategy })
      // add version range to versionFromNpm 
      versionMap = Object.assign({}, versionFromNpm, versionMap)
    }
  }
  if (!versionMap || !Object.keys(versionMap).length) {
    logger.warn('[lerna-ci] no package names provided, nothing touched')
    return false
  }
  const pkgsUpdated = allPkgDigests.map(item => {
    const changes = updatePackageJSON({
      pkgDigest: item,
      latestVersions: versionMap,
      versionTransform: getVersionTransformer(options.versionRangeStrategy),
      checkOnly: options.checkOnly,
      exact: options.exact,
    })
    return changes && Object.assign({}, item, { changes })
  }).filter(Boolean)
  // @ts-ignore
  return !!pkgsUpdated.length && pkgsUpdated
}

/**
 * flat package names according to mono package's all dependencies (e.g. convert @babel/* to all used scoped packages like @babel/core, @babel/preset-env)
 * @param packageNames package names that should update
 * @param allPkgDigests all mono packages' digest info
 */
function flatPackageNames(packageNames: string[], allPkgDigests: IPackageDigest[]) {
  const scopedNames:string[] = []
  const normalNames:string[] = []
  packageNames.forEach(name => {
    if (isAsteriskPkgName(name)) {
      scopedNames.push(name)
    } else {
      normalNames.push(name)
    }
  })
  if (!scopedNames.length) return packageNames
  const allPackageNames = getAllDependencies(allPkgDigests)
  const scopedPkgNames = allPackageNames.filter(name => scopedNames.some(scope => isPkgNameMatchingPattern(name, scope)))
  logger.info(`[lerna-ci] found ${scopedPkgNames.length} scoped packages with patterns ${scopedNames.join(', ')}`)
  if (scopedPkgNames.length) {
    logger.info(`    ${scopedPkgNames.join('  ')}`)
  }
  return normalNames.concat(scopedPkgNames)
}

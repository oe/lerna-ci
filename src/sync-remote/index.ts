import {
  getAllPackageDigests,
  getVersionTransformer,
  getVersionsFromNpm,
  IVersionPickStrategy,
  updatePackageJSON,
  IVersionRangeStrategy,
  getScopedPrefix,
  IPackageDigest,
  IVersionMap,
  getAllDependencies,
  IChangedPackage,
} from '../common'

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
  versionStrategy?: IVersionPickStrategy
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
export async function syncRemote(syncOptions: ISyncDepOptions): Promise<IChangedPackage[] | false> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgDigests = await getAllPackageDigests()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let versionMap = options.versionMap!
  if (options.packageNames) {
    const packageNames = flatPackageNames(options.packageNames, allPkgDigests)
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = packageNames.filter(n => pkgsHasVersion.indexOf(n) === -1)
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromNpm(pkgsWithoutVersion, options.versionStrategy)
      // add version range to versionFromNpm 
      versionMap = Object.assign({}, versionFromNpm, versionMap)
    }
  }
  const pkgsUpdated = allPkgDigests.map(item => {
    const changes = updatePackageJSON({
      pkgDigest: item,
      latestVersions: versionMap,
      versionTransform: getVersionTransformer(options.versionRangeStrategy),
      checkOnly: options.checkOnly,
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
    const prefix = getScopedPrefix(name)
    if (prefix) {
      scopedNames.push(prefix)
    } else {
      normalNames.push(name)
    }
  })
  if (!scopedNames.length) return packageNames
  const allPackageNames = getAllDependencies(allPkgDigests)
  const scopedPkgNames = allPackageNames.filter(name => scopedNames.some(scope => name.startsWith(scope)))
  console.log(` found ${scopedPkgNames.length} scoped packages with scopes prefix ${scopedNames.join(', ')}`)
  if (scopedPkgNames.length) {
    console.log(`    ${scopedPkgNames.join('\n    ')}`)
  }
  return normalNames.concat(scopedPkgNames)
}

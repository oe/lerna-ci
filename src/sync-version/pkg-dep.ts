import { getAllPackageDigests } from '../pkg-info'
import { updatePkg, getVersionsFromNpm, IVersionMap, IVersionStrategy, fixPackageVersions } from './common'

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
   * version range strategy, use ^ by default
   */
  versionStrategy?: IVersionStrategy
}

const DEFAULT_OPTIONS: ISyncDepOptions = {
  versionMap: {},
  versionStrategy: '^'
}

/**
 * sync all packages' dependencies' versions
 * @param syncOptions options
 * @param checkOnly only check, with package.json files untouched
 */
export async function syncPackageDependenceVersion(syncOptions: ISyncDepOptions, checkOnly?: boolean) {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgDigests = await getAllPackageDigests()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const versionMap = options.versionMap!
  if (options.packageNames) {
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = options.packageNames.filter(n => pkgsHasVersion.indexOf(n) === -1)
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromNpm(pkgsWithoutVersion)
      Object.assign(versionMap, versionFromNpm)
    }
  }
  const fixedVersion = fixPackageVersions(versionMap, options.versionStrategy)
  const pkgsUpdated = allPkgDigests.filter(item => updatePkg(item, fixedVersion, checkOnly))
  return pkgsUpdated
}

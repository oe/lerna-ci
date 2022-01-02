import { getAllPackageDigests } from '../pkg-info'
import {
  updatePkg,
  getVersionsFromNpm,
  IVersionStrategy,
  addRange2VersionMap,
  IVersionRangeStrategy
} from './common'
import { IPackageDigest, IVersionMap } from '../types'

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
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = options.packageNames.filter(n => pkgsHasVersion.indexOf(n) === -1)
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromNpm(pkgsWithoutVersion, options.versionStrategy)
      Object.assign(versionMap, versionFromNpm)
    }
  }
  const fixedVersion = addRange2VersionMap(versionMap, options.versionRangeStrategy)
  const pkgsUpdated = allPkgDigests.filter(item => updatePkg(item, fixedVersion, syncOptions.checkOnly))
  return pkgsUpdated
}

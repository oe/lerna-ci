import {
  maxVersion,
  IPackageDigest,
  IVersionMap,
  EVerSource,
  getAllPackageDigests,
  IPackageFilterOptions,
  updatePkg,
  getVersionsFromNpm,
  getPackageVersionsFromGit,
  addRange2VersionMap,
  IVersionStrategy,
  IVersionRangeStrategy
} from '../common'

export interface ISyncPackageOptions {
  /**
   * version source, default to `local`
   * how to get latest locale package versions: npm, git, local or all
   */
  versionSource?: EVerSource
  /**
   * npm/git version strategy
   *  default to 'latest'
   */
  versionStrategy?: IVersionStrategy
  /**
   * filter which package should be synced
   */
  packageFilter?: IPackageFilterOptions
  /**
   * version range strategy 
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /**
   * only check, with package.json files untouched
   * validate package whether need to update, don't change package.json file actually
   */
  checkOnly?: boolean
}

const DEFAULT_OPTIONS: ISyncPackageOptions = {
  versionSource: EVerSource.LOCAL,
  versionStrategy: 'latest',
  versionRangeStrategy: '^',
}

/**
 * sync all local packages' version
 *  return all packages' digest info that need to update (has been upated if isValidate is false)
 */
export async function syncLocal(syncOptions: ISyncPackageOptions = {}): Promise<IPackageDigest[]> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgs = await getAllPackageDigests(options.packageFilter)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const latestVersions = await getLatestVersions(options.versionSource!, allPkgs, options.versionStrategy)
  const caretVersions =  addRange2VersionMap(latestVersions, options.versionRangeStrategy)
  const pkgsUpdated = allPkgs.filter(item => updatePkg(item, caretVersions , options.checkOnly, latestVersions[item.name]))
  return pkgsUpdated
}

/**
 * get versions from remote server
 * @param verSource version source: from git, npm or both
 * @param pkgs packages need version info
 */
async function getLatestVersions(
  verSource: EVerSource,
  pkgs: IPackageDigest[],
  versionStrategy?: IVersionStrategy
) {
  if (!pkgs.length) return {}
  // local package versions
  const localVers: IVersionMap = {}
  pkgs.reduce((acc, cur) => {
    acc[cur.name] = cur.version
    return acc
  }, localVers)
  if (verSource === EVerSource.LOCAL) return localVers

  // versions info from npm
  let npmVers: IVersionMap = {}
  if (verSource !== EVerSource.GIT) {
    // can not get version from private package
    npmVers = await getVersionsFromNpm(pkgs.filter(p => !p.private).map(item => item.name), versionStrategy)
  }

  // versions info from git
  let gitVers: IVersionMap = {}
  if (verSource !== EVerSource.NPM) {
    gitVers = await getPackageVersionsFromGit(versionStrategy)
  }

  const vers: IVersionMap = {}
  Object.keys(localVers).reduce((acc, key) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    acc[key] = maxVersion(npmVers[key], gitVers[key], localVers[key])!
    return acc
  }, vers)
  const result: IVersionMap = {}
  pkgs.reduce((acc, item) => {
    if (vers[item.name]) acc[item.name] = vers[item.name]
    return acc
  }, result)
  return result
}


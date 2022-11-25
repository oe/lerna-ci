import {
  maxVersion,
  IPackageDigest,
  IVersionMap,
  EVerSource,
  getAllPackageDigests,
  IPackageFilterOptions,
  updatePackageJSON,
  getVersionsFromRegistry,
  getPackageVersionsFromGit,
  IVersionPickStrategy,
  IUpgradeVersionStrategy,
  getVersionTransformer,
  getGitRoot,
  IChangedPackage
} from '../common'

export interface ISyncPackageOptions {
  /**
   * version source, default to `local`
   * how to get latest locale package versions: npm, git, local or all
   * @default 'all'
   */
  versionSource?: EVerSource
  /**
   * npm/git version strategy
   * @default 'latest'
   */
  versionStrategy?: IVersionPickStrategy
  /**
   * filter which package should be synced
   */
  packageFilter?: IPackageFilterOptions
  /**
   * version range strategy
   * @default 'retain'
   */
  versionRangeStrategy?: IUpgradeVersionStrategy
  /**
   * only check, with package.json files untouched
   * validate package whether need to update, don't change package.json file actually
   */
  checkOnly?: boolean
  /**
   * check whether packages' versions are exactly same
   */
  exact?: boolean
}

const DEFAULT_OPTIONS: ISyncPackageOptions = {
  versionSource: EVerSource.ALL,
  versionStrategy: 'latest',
  versionRangeStrategy: 'retain',
}

/**
 * sync all local packages' version
 *  return all packages' digest info that need to update (has been upated if isValidate is false)
 */
export async function syncLocal(syncOptions: ISyncPackageOptions = {}): Promise<IChangedPackage[] | false> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const allPkgs = await getAllPackageDigests(options.packageFilter)
  if (!allPkgs.length) {
    throw new Error('no packages found in current project')
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const latestVersions = await getLatestVersions(options.versionSource!, allPkgs, options.versionStrategy)
  const pkgsUpdated = allPkgs.map(item => {
    const changes = updatePackageJSON({
      pkgDigest: item,
      latestVersions,
      versionTransform: getVersionTransformer(options.versionRangeStrategy),
      checkOnly: options.checkOnly,
      pkgVersion: latestVersions[item.name],
      exact: options.exact
    })
    return changes && Object.assign({}, item, { changes })
  }).filter(Boolean)
  // @ts-ignore
  return !!pkgsUpdated.length && pkgsUpdated
}

/**
 * get versions from remote server
 * @param verSource version source: from git, npm or both
 * @param pkgs packages need version info
 */
async function getLatestVersions(
  verSource: EVerSource,
  pkgs: IPackageDigest[],
  versionStrategy?: IVersionPickStrategy
) {
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
    npmVers = await getVersionsFromRegistry({ pkgNames: pkgs.filter(p => !p.private).map(item => item.name), versionStrategy })
  }

  // versions info from git
  let gitVers: IVersionMap = {}
  if (verSource !== EVerSource.NPM) {
    const gitRoot = await getGitRoot()
    if (gitRoot) {
      gitVers = await getPackageVersionsFromGit(versionStrategy)
    }
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


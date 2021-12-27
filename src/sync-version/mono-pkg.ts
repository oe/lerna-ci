import { join } from 'path'
import { groupPkgNames, uniqArray, maxVersion } from '../utils'
import { getAllPackageDigests, IPackageFilter} from '../pkg-info'
import { IPackageDigest, IPackageVersions, EVerSource } from '../types'
import { updatePkg, getVersionsFromNpm, getLatestPkgVersFromGit, fixPackageVersions, INpmVersionStrategy } from './common'

export interface ISyncPackageOptions {
  /**
   * version source
   * how to get latest locale package version source: npm, git or both
   */
  versionSource?: EVerSource
  /**
   * npm version strategy
   *  default to 'latest'
   */
  npmVersionStrategy?: INpmVersionStrategy
  /**
   * filter which package should be synced
   */
  packageFilter?: IPackageFilter
  /**
   * only check, with package.json files untouched
   * validate package whether need to update, don't change package.json file actually
   */
  checkOnly?: boolean
}

/**
 * sync all local packages' version
 *  return all packages' digest info that need to update (has been upated if isValidate is false)
 */
export async function syncPackageVersions(options: ISyncPackageOptions) {
  let allPkgs = await getAllPackageDigests()
  if (options.packageFilter) allPkgs = allPkgs.filter(options.packageFilter)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const latestVersions = await getLatestVersions(options.versionSource || EVerSource.LOCAL, allPkgs, options.npmVersionStrategy)
  const caretVersions =  fixPackageVersions(latestVersions, '^')
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
  npmVersionStrategy?: INpmVersionStrategy
) {
  if (!pkgs.length) return {}
  // local package versions
  const localVers: IPackageVersions = {}
  pkgs.reduce((acc, cur) => {
    acc[cur.name] = cur.version
    return acc
  }, localVers)
  if (verSource === EVerSource.LOCAL) return localVers

  // versions info from npm
  let npmVers: IPackageVersions = {}
  if (verSource !== EVerSource.GIT) {
    // can not get version from private package
    npmVers = await getVersionsFromNpm(pkgs.filter(p => !p.private).map(item => item.name), npmVersionStrategy)
  }

  // versions info from git
  let gitVers: IPackageVersions = {}
  if (verSource !== EVerSource.NPM) {
    gitVers = await getLatestPkgVersFromGit()
  }

  const vers: IPackageVersions = {}
  Object.keys(localVers).reduce((acc, key) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    acc[key] = maxVersion(npmVers[key], gitVers[key], localVers[key])!
    return acc
  }, vers)
  const result: IPackageVersions = {}
  pkgs.reduce((acc, item) => {
    if (vers[item.name]) acc[item.name] = vers[item.name]
    return acc
  }, result)
  return result
}

function getAllMatchedPackageNames(
  pkgDigest: IPackageDigest,
  generalPkgNames: string[]
) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(pkgPath)
  const dependencies = Object.assign(
    {}, 
    pkg.devDependencies, 
    pkg.dependencies, 
    pkg.peerDependencies, 
    pkg.optionalDependencies
  )
  const pkgNames: string[] = Object.keys(dependencies)
  return pkgNames.filter(pkgName => {
    return generalPkgNames.some(item => {
      return item === pkgName.slice(0, item.length - 1) + '*'
    })
  })
}

/**
 * sync pkg names from remote npm registry but used in local packages
 * @param pkgNames
 */
export async function syncRemotePkgVersions(pkgNames: string[]) {
  const allPkgDigests = await getAllPackageDigests()
  const groupedPkgNames = groupPkgNames(pkgNames)

  let specificPkgNames = groupedPkgNames.specific
  if (groupedPkgNames.general.length) {
    specificPkgNames = allPkgDigests
      .map(pkgDigest =>
        getAllMatchedPackageNames(pkgDigest, groupedPkgNames.general)
      )
      .reduce((acc, cur) => {
        acc = acc.concat(cur)
        return acc
      }, specificPkgNames)
  }

  const uniqSpecificPkgNames = uniqArray(specificPkgNames)

  const latestVersions = await getVersionsFromNpm(uniqSpecificPkgNames)
  const pkgsUpdated = allPkgDigests.filter(item => updatePkg(item, latestVersions))
  return pkgsUpdated
}

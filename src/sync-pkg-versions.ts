import {
  getAllPkgDigest,
  getLatestVersions,
  getLatestVersFromNpm,
  groupPkgNames,
  uniqArray,
  EVerSource,
  IPkgFilter,
  IPkgVersions,
  IPkgDigest
} from './utils'
import { join } from 'path'
import fs from 'fs'

/**
 * update deps versions, return true if any pkg's version updated
 * @param deps orignial deps object
 * @param versions latest package versions
 */
function updateDepsVersion(deps: IPkgVersions, versions: IPkgVersions) {
  let hasChanged = false
  if (!deps) return hasChanged
  Object.keys(deps).forEach(k => {
    if (k in versions && deps[k] !== `^${versions[k]}`) {
      deps[k] = `^${versions[k]}`
      hasChanged = true
    }
  })
  return hasChanged
}

/**
 * update a single pkg's package.json, return true if any things updated
 * @param pkgDigest a single pkg's digest info
 * @param latestVersions lastest version of all locale packages
 * @param isValidate if true just validate whether package need to update, and won't update its package.json file
 */
function updatePkg(
  pkgDigest: IPkgDigest,
  latestVersions: IPkgVersions,
  isValidate?: boolean
) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(pkgPath)
  let hasChanged = false
  if (latestVersions[pkg.name]) {
    if (latestVersions[pkg.name] !== pkg.version) {
      console.log(
        `[sync pkg versions] update ${pkg.name}'s version from ${
          pkg.version
        } => ${latestVersions[pkg.name]}`
      )
      hasChanged = true
      pkg.version = latestVersions[pkg.name]
    }
  }
  const devChanged = updateDepsVersion(pkg.devDependencies, latestVersions)
  const peerChanged = updateDepsVersion(pkg.peerDependencies, latestVersions)
  const depChnaged = updateDepsVersion(pkg.dependencies, latestVersions)
  if (hasChanged || devChanged || depChnaged || peerChanged) {
    // write file only not in validation mode
    if (!isValidate) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    return true
  }
  return false
}

/**
 * sync all local packages' version
 *  return all packages' digest info that need to update (has been upated if isValidate is false)
 * @param verSource how to get latest locale package version source: npm, git or both
 * @param filter function to filter packages need to sync versions
 * @param isValidate whether just validate package need to update
 */
export async function syncLocalPkgVersions(
  verSource: EVerSource,
  filter?: IPkgFilter,
  isValidate?: boolean
) {
  let allPkgs = await getAllPkgDigest()
  if (filter) allPkgs = allPkgs.filter(filter)
  const latestVersions = await getLatestVersions(verSource, allPkgs)
  const pkgsUpdated = allPkgs.filter(item =>
    updatePkg(item, latestVersions, isValidate)
  )
  return pkgsUpdated
}

function getAllMatchedPackgeNames(
  pkgDigest: IPkgDigest,
  generalPkgNames: string[]
) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(pkgPath)
  let pkgNames: string[] = Object.keys(pkg.devDependencies) || []
  if (pkg.dependencies)
    pkgNames = pkgNames.concat(Object.keys(pkg.dependencies))
  if (pkg.peerDependencies)
    pkgNames = pkgNames.concat(Object.keys(pkg.peerDependencies))

  return uniqArray(pkgNames).filter(pkgName => {
    return generalPkgNames.some(item => {
      return item === pkgName.slice(0, item.length - 1) + '*'
    })
  })
}

/**
 * sync pkg names from remote npm regisetry but used in local packages
 * @param pkgNames
 */
export async function syncRemotePkgVersions(pkgNames: string[]) {
  let allPkgs = await getAllPkgDigest()
  const groupedPkgNames = groupPkgNames(pkgNames)

  let specificPkgNames = groupedPkgNames.specific
  if (groupedPkgNames.general.length) {
    specificPkgNames = allPkgs
      .map(pkgDigest =>
        getAllMatchedPackgeNames(pkgDigest, groupedPkgNames.general)
      )
      .reduce((acc, cur) => {
        acc = acc.concat(cur)
        return acc
      }, specificPkgNames)
  }

  const uniqSpecificPkgNames = uniqArray(specificPkgNames)

  const latestVersions = await getLatestVersFromNpm(uniqSpecificPkgNames)
  const pkgsUpdated = allPkgs.filter(item => updatePkg(item, latestVersions))
  return pkgsUpdated
}

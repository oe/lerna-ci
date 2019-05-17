import { getAllPkgNames, getLatestVersion, EVerSource, IPkgFilter } from './utils'
import { join } from 'path'
import fs from 'fs'


function updateDepsVersion (deps, versions) {
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

function updatePkg (pkgDigest, latestVersions) {
  const pkgPath = join(pkgDigest.location, 'package.json')
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
  const depChnaged = updateDepsVersion(pkg.dependencies, latestVersions)
  if (hasChanged || devChanged || depChnaged) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  }
}

export async function syncPkgVersions (verSource: EVerSource, filter?: IPkgFilter) {
  let allPkgs = await getAllPkgNames()
  if (filter) allPkgs = allPkgs.filter(filter)
  const latestVersions = await getLatestVersion(verSource, allPkgs)
  allPkgs.forEach(item => updatePkg(item, latestVersions))
  console.log(
    `[sync pkg versions] Your local packages' versions have been updated to git tags`
  )
}


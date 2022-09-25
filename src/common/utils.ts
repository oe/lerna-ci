import path from 'path'
import fs from 'fs'
import semver from 'semver'
import { runShellCmd, findFileRecursive } from 'deploy-toolkit'
import { IPackageDigest } from './types'

/**
 * dependence key for package.json
 */
export const  PKG_DEP_KEYS = <const>['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** platform detect */
export const isWin = /^win/.test(process.platform)

/** run npm command via npx */
export function runNpmCmd(...args: string[]) {
  return runShellCmd(isWin ? 'npx.cmd' : 'npx', args)
}

let projectRoot: string
/**
 * get current project root dir
 */
export function getProjectRoot(): string {
  if (projectRoot) return projectRoot
  const defPkgPath = findFileRecursive('package.json', process.cwd())
  projectRoot = path.dirname(defPkgPath)
  return projectRoot
}


let lernaNpmClient: string | undefined
/**
 * get lerna monorepo preferred npm client
 */
export async function getRepoNpmClient(): Promise<string> {
  if (typeof lernaNpmClient !== 'undefined') return lernaNpmClient
  const rootDir = await getProjectRoot()
  if (rootDir) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cfg = require(path.join(rootDir, 'lerna.json'))
      lernaNpmClient = cfg.npmClient
    } catch (error) {}
  }
  if (!lernaNpmClient) lernaNpmClient = 'npm'
  return lernaNpmClient
}

/** calc max value with custom compare */
export function pickOne<V>(list: V[], compare: ((a: V, b: V) => number)): V | undefined {
  if (!list.length) return
  const arr = list.slice(0)
  return arr.reduce((acc, cur) => {
    return compare(acc, cur) >= 0 ? acc : cur
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  }, arr.shift()!)
}

/** get maxVersion of from the given version list  */
export function maxVersion(...vers: (string | undefined)[]) {
  return pickOne(vers.filter(v => !!v) as string[], semver.compare)
}

function getPackageDependencies(pkgDigest: IPackageDigest, unique?: boolean) {
  const pkgPath = path.join(pkgDigest.location, 'package.json')
  let content = fs.readFileSync(pkgPath, 'utf8')
  content = JSON.parse(content)
  let pkgNames: string[] = []
  PKG_DEP_KEYS.forEach(key => {
    if (!content[key]) return
    pkgNames = pkgNames.concat(Object.keys(content[key]))
  })
  return unique ? Array.from(new Set(pkgNames)) : pkgNames
}

export function getAllDependencies(allPkgDigests: IPackageDigest[]) {
  const results = allPkgDigests.map(digest=> getPackageDependencies(digest))
  let allPackageNames: string[] = []
  allPackageNames = results.reduce((acc, cur) => acc.concat(cur), allPackageNames)
  return Array.from(new Set(allPackageNames))
}

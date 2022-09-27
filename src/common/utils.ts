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
export async function runNpmCmd(...args: string[]) {
  const rootPath = await getProjectRoot()
  return runShellCmd(isWin ? 'npx.cmd' : 'npx', args, { cwd: rootPath })
}

export async function readRootPkgJson() {
  const rootRepo = await getProjectRoot()
  return readPackageJson(rootRepo)
}

let projectRoot: string
/**
 * get current project root dir
 */
export async function getProjectRoot(): Promise<string> {
  if (projectRoot) return projectRoot
  const gitRoot = await getGitRoot()
  if (gitRoot && fs.existsSync(path.join(gitRoot, 'package.json'))) {
    projectRoot = gitRoot
  } else {
    const defPkgPath = findFileRecursive('package.json', process.cwd())
    projectRoot = path.dirname(defPkgPath)
  }
  if (!projectRoot) {
    throw new Error('unable to determine project root path')
  }
  return projectRoot
}

let gitRootPath: string | false

/**
 * get git root path, return false if not in git repo
 */
export async function getGitRoot(): Promise<string | false> {
  if (gitRootPath !== undefined) return gitRootPath
  try {
    const result = await runShellCmd('git', ['rev-parse', '--show-toplevel'])
    gitRootPath = result.trim()
  } catch (error) {
    gitRootPath = false
  }
  return gitRootPath
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

/**
 * get parsed package.json in a package
 * @param pkgPath package location
 * @returns 
 */
export function readPackageJson(pkgPath: string) {
  const pkgJsonPath = path.join(pkgPath, 'package.json')
  // not lerna powered project
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found in project: ${pkgPath}`)
  }
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`project root's package.json is corrupted, located in ${pkgPath}`)
  }
}

function getPackageDependencies(pkgDigest: IPackageDigest, unique?: boolean) {
  const content = readPackageJson(pkgDigest.location)
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

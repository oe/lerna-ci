/**
 * all package info related function, readonly(won't change any thing)
 */
import path from 'path'
import { findFileRecursive } from 'deploy-toolkit'
import { IPackageDigest } from './types'
import { detectLerna, runNpmCmd, cleanUpLernaCliOutput } from './utils'

let rootRepoPkg: IPackageDigest | undefined | null

/**
 * get package digest from repo root
 */
export function getRepoPackageDigest(): IPackageDigest | null {
  if (typeof rootRepoPkg !== 'undefined') return rootRepoPkg
  const defPkgPath = findFileRecursive('package.json', process.cwd())
  if (defPkgPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(defPkgPath)
    rootRepoPkg = {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private || false,
      location: path.dirname(defPkgPath)
    }
  } else {
    rootRepoPkg = null
  }
  return rootRepoPkg
}

let lernaNpmClient: string | null | undefined

export async function getRepoNpmClient() {
  if (typeof lernaNpmClient !== 'undefined') return lernaNpmClient
  const digest = await getRepoPackageDigest()
  if (digest) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cfg = require(path.join(digest.location, 'lerna.json'))
      lernaNpmClient = cfg.npmClient
    } catch (error) {}
    
  }
  if (!lernaNpmClient) lernaNpmClient = null
  return lernaNpmClient
}

/**
 * @deprecated use getAllPackageDigests instead
 */
export const getAllPkgDigest = getAllPackageDigests

/** package filter object */
export interface IPackageFilterOptions {
  /** whether need private package */
  ignorePrivate?: boolean
  /** search package contains the keyword */
  keyword?: string
}

/** package filter function */
export type IPackageFilter = (pkg: IPackageDigest, index: number, arr: IPackageDigest[]) => boolean

/**
 * get all package's info in a lerna project
 */
export async function getAllPackageDigests(filter?: IPackageFilter | IPackageFilterOptions) {
  const isLernaInstalled = await detectLerna()
  let result: IPackageDigest[] = []
  if (!isLernaInstalled) console.warn('[lerna-ci] lerna not installed')
  /**
   * don't install from npm remote if lerna not installed
   */
  const args = ['--no-install', 'lerna', 'list', '--json']
  // if (needPrivate) args.push('--all')
  // if (searchKwd) args.push(searchKwd)
  const pkgsString = await runNpmCmd(...args)
  result = JSON.parse(cleanUpLernaCliOutput(pkgsString)) as IPackageDigest[]
  // root package is private by default
  const selfPkgDigest = await getRepoPackageDigest()
  if (selfPkgDigest) result.push(selfPkgDigest)
  if (!filter) return result
  if (typeof filter === 'object') {
    const filterOptions = filter
    filter = (pkg: IPackageDigest) => {
      // ignore private
      if (filterOptions.ignorePrivate && pkg.private) return false
      if (filterOptions.keyword) pkg.name.indexOf(filterOptions.keyword) > -1
      return true
    }
  }
  return result.filter(filter)
}

/**
 * get all changed packages according to your lerna.json's configuration
 */
export async function getChangedPackages(): Promise<IPackageDigest[]> {
  const pkgsString = await runNpmCmd('--no-install', 'lerna', 'changed', '--json')
  const result = JSON.parse(cleanUpLernaCliOutput(pkgsString)) as IPackageDigest[]
  return result
}

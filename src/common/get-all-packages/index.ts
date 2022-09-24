/**
 * all package info related function, readonly(won't change any thing)
 */

import path from 'path'
import { IPackageDigest } from '../types'
import { getProjectRoot } from '../utils'
import { getAllPackagesViaLerna } from './lerna'

/** package filter object */
export interface IPackageFilterObject {
  /** whether need private package */
  ignorePrivate?: boolean
  /** search package contains the keyword */
  keyword?: string
}

/** package filter function */
export type IPackageFilter = (pkg: IPackageDigest, index: number, arr: IPackageDigest[]) => boolean

export type IPackageFilterOptions = IPackageFilterObject | IPackageFilter
/**
 * get all package's info in a lerna project
 */
export async function getAllPackageDigests(filter?: IPackageFilterOptions): Promise<IPackageDigest[]> {
  const result = await getAllPackagesViaLerna()
  // root package is private by default
  const selfPkgDigest = await getRootPackageDigest()
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


let rootRepoPkg: IPackageDigest | undefined | null
/**
 * get package digest from repo root
 */
export function getRootPackageDigest(): IPackageDigest | null {
  if (typeof rootRepoPkg !== 'undefined') return rootRepoPkg
  const defPkgPath = path.join(getProjectRoot(), 'package.json')
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
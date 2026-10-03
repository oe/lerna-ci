/**
 * all package info related function, readonly(won't change any thing)
 */

import path from 'path'
import { IPackageDigest } from '../types'
import { getProjectRoot, readPackageJson } from '../utils'
import { logger } from '../logger'
import * as lerna from './lerna'
import * as native from './native-client'

export { isManagedByLerna, isLernaAvailable } from './lerna'

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
  const result = await getAllPkgDigests()
  if (!filter) return result
  if (typeof filter === 'object') {
    const filterOptions = filter
    filter = (pkg: IPackageDigest) => {
      // ignore private
      if (filterOptions.ignorePrivate && pkg.private) return false
      if (filterOptions.keyword && !pkg.name.includes(filterOptions.keyword)) return false
      return true
    }
  }
  return result.filter(filter)
}

async function getAllPkgDigests() {
  let result = await lerna.getAllPackages()
  if (result === false) {
    result = await native.getAllPackages()
  }
  if (!result) {
    logger.warn('[lerna-ci] unable to get workspace packages, maybe current project not a monorepo')
    result = []
  }
  // Include the root package once.
  const selfPkgDigest = await getRootPackageDigest()
  if (selfPkgDigest && !result.some(pkg => path.resolve(pkg.location) === path.resolve(selfPkgDigest.location))) result.push(selfPkgDigest)
  return result
}


/** get package digest from repo root, reading the current manifest */
export async function getRootPackageDigest(): Promise<IPackageDigest> {
  const rootPath = await getProjectRoot()
  const pkg = readPackageJson(rootPath)
  return {
    name: pkg.name || '',
    version: pkg.version || '',
    private: !!pkg.private,
    location: rootPath
  }
}

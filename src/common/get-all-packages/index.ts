/**
 * all package info related function, readonly(won't change any thing)
 */

import path from 'path'
import { IPackageDigest } from '../types'
import { getProjectRoot } from '../utils'
import { logger } from '../logger'
import * as lerna from './lerna'
import * as native from './native-client'

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
      if (filterOptions.keyword) pkg.name.indexOf(filterOptions.keyword) > -1
      return true
    }
  }
  return result.filter(filter)
}

let cachedDigests: IPackageDigest[]
async function getAllPkgDigests() {
  if (cachedDigests) return cachedDigests
  let result = await lerna.getAllPackages()
  if (result === false) {
    result = await native.getAllPackages()
  }
  if (!result) {
    logger.warn('[lerna-ci] unable to get workspace packages, maybe current project not a monorepo')
    result = []
  }
  // root package is private by default
  const selfPkgDigest = await getRootPackageDigest()
  if (selfPkgDigest) result.push(selfPkgDigest)
  cachedDigests = result
  return cachedDigests
}


let rootRepoPkg: IPackageDigest | undefined | null
/**
 * get package digest from repo root
 */
export async function getRootPackageDigest(): Promise<IPackageDigest | null> {
  if (typeof rootRepoPkg !== 'undefined') return rootRepoPkg
  const rootPath = await getProjectRoot()
  const defPkgPath = path.join(rootPath, 'package.json')
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
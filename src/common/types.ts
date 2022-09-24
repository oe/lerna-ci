
/**
 * package version data source
 */
export const enum EVerSource {
  /** both npm and git */
  ALL = 'all',
  /** from monorepo itself */
  LOCAL = 'local',
  /** from npm */
  NPM = 'npm',
  /** from git */
  GIT = 'git'
}


/**
 * package digest info
 */
export interface IPackageDigest {
  /** package name */
  name: string
  /** package version */
  version: string
  /** whether package is private */
  private: boolean
  /** package folder full path */
  location: string
}

/** Object type */
export type IObject<V = unknown> = Record<string, V>

/** package name: package version no.(without `v`) */
export type IVersionMap =  IObject<string>

/**
 * npm version strategy
 *  max: max package version
 *  latest: latest release package version
 */
export type IVersionStrategy = 'max' | 'latest'

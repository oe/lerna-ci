import semver from 'semver'
import { IVersionPickStrategy } from '../../types'

export interface IGetPkgVersionFromRegistryOptions {
  /** package name */
  pkgName: string
  /** strategy: latest or max */
  versionStrategy?: IVersionPickStrategy
  /**
   * specified version, to check for existence
   *  return itself if found, otherwise return empty string
   */
  version?: string
}

export type IGetPkgVersionFromRegistry = (options: IGetPkgVersionFromRegistryOptions) => Promise<string>

/**
 * get the max stable version
 * @param versions version list, should be sorted from smallest to largest
 */
export function getMaxStableVersion(versions: string[], strategy: IVersionPickStrategy): string {
  if (strategy === 'max') return versions.pop()!
  return versions.reverse().find(v => {
    const sv = semver.parse(v)
    return sv && !sv.prerelease.length
  }) || versions.pop()!
}

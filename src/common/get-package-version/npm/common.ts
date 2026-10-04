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
 * @param versions version list, ordering is not required
 */
export function getMaxStableVersion(versions: string[], strategy: IVersionPickStrategy): string {
  const sorted = versions.filter(v => !!semver.valid(v)).sort(semver.rcompare)
  if (strategy === 'max') return sorted[0] || ''
  return sorted.find(v => !semver.prerelease(v)) || sorted[0] || ''
}

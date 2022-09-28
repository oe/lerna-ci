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

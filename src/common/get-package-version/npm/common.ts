import { IVersionPickStrategy } from '../../types'

export interface IGetPkgVersionFromRegistryOptions {
  pkgName: string
  versionStrategy: IVersionPickStrategy
}

export type IGetPkgVersionFromRegistry = (options: IGetPkgVersionFromRegistryOptions) => Promise<string>

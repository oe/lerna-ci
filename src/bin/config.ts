import { cosmiconfig } from 'cosmiconfig'
import { ISyncPackageOptions } from '../index'

export const CLI_NAME = 'lerna-ci'
export const cwd = process.cwd()

export interface IConfig {
  // package name need to sync
  syncremote?: string[] | Record<string, string>
  // local package version source: all, git, npm, local
  synclocal?: Pick<ISyncPackageOptions, 'versionSource' | 'versionRangeStrategy'> & {
    source?: ISyncPackageOptions['versionSource']
    versionRange?: ISyncPackageOptions['versionRangeStrategy']
  }
  // configuration for fixPackagesJson
  fixpack?: any
}
export async function getCliConfig (): Promise<IConfig> {
  const result = await cosmiconfig(CLI_NAME).search()
    || await cosmiconfig('lerna-cli').search()
  return (result?.config || {}) as IConfig
}

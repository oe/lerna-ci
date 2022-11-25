import { cosmiconfig } from 'cosmiconfig'
import {
  EVerSource,
} from '../index'

export const CLI_NAME = 'lerna-cli'
export const cwd = process.cwd()

export interface IConfig {
  // package name need to sync
  syncremote?: string[] | Record<string, string>
  // local package version source: all, git, npm, local
  synclocal?: {
    source: EVerSource
    versionRange: string
  }
  // configuration for fixPackagesJson
  fixpack?: any
}
let cachedConfig: IConfig
export async function getCliConfig () {
  if (cachedConfig) return cachedConfig
  const explorer = cosmiconfig(CLI_NAME)
  try {
    const result = await explorer.search()
    cachedConfig = (result?.config || {}) as IConfig
    return cachedConfig
  } catch (error) {
    return {}
  }
} 
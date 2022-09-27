import { runShellCmd } from 'deploy-toolkit'
import { IGetPkgVersionFromRegistry } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['npm', 'info', options.pkgName, '--fields', options.versionStrategy === 'latest' ? 'version' : 'versions'])
  const content = JSON.parse(result).version
  return options.versionStrategy === 'latest' ? content.version : content.versions.pop()  
}

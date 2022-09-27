import { runShellCmd } from 'deploy-toolkit'
import { IGetPkgVersionFromRegistry } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('npm',
    ['info', options.pkgName, options.versionStrategy === 'latest' ? 'version' : 'versions', '--json'])
   
  const content =  JSON.parse(result)
  return options.versionStrategy === 'latest' ? content : content.pop()
}

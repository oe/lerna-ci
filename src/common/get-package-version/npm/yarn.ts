import { runShellCmd } from 'deploy-toolkit'
import { IGetPkgVersionFromRegistry } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['info', options.pkgName, options.versionStrategy === 'latest' ? 'version' : 'versions', '--json'])
   
  const content =  JSON.parse(result)
  if (content.type !== 'inspect') {
    throw new Error(`unable to get package version of \`${options.pkgName}\`: ${content.data}`)
  }
  return options.versionStrategy === 'latest' ? content.data : content.data.pop()
}

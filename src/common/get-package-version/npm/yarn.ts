import { runShellCmd } from '../../utils'
import { IGetPkgVersionFromRegistry, getMaxStableVersion } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['info', options.pkgName, options.versionStrategy === 'latest' && !options.version ? 'version' : 'versions', '--json'])

  const content =  JSON.parse(result)
  if (content.type !== 'inspect') {
    throw new Error(`unable to get package version of \`${options.pkgName}\`: ${content.data}`)
  }
  if (options.versionStrategy === 'latest') return content.data
  if (options.version) {
    return content.data.includes(options.version) ? options.version : ''
  }
  return getMaxStableVersion(content.data, options.versionStrategy!)
}

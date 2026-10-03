import { runShellCmd } from '../../utils'
import { IGetPkgVersionFromRegistry, getMaxStableVersion } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['info', options.pkgName, options.versionStrategy === 'latest' && !options.version ? 'version' : 'versions', '--json'])

  const content =  JSON.parse(result)
  if (content.type !== 'inspect') {
    throw new Error(`unable to get package version of \`${options.pkgName}\`: ${content.data}`)
  }
  if (options.version) {
    const versions = Array.isArray(content.data) ? content.data : [content.data]
    return versions.includes(options.version) ? options.version : ''
  }
  if (options.versionStrategy === 'latest') return content.data
  return getMaxStableVersion(Array.isArray(content.data) ? content.data : [content.data], options.versionStrategy!)
}

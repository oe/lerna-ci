import { runShellCmd } from '../../utils'
import { IGetPkgVersionFromRegistry, getMaxStableVersion } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['npm', 'info', options.pkgName, '--fields', options.versionStrategy === 'latest' && !options.version ? 'version' : 'versions', '--json'])
  const content = JSON.parse(result)
  if (options.versionStrategy === 'latest') return content.version
  if (options.version) {
    return content.versions.includes(options.version) ? options.version : ''
  }
  return getMaxStableVersion(content.versions, options.versionStrategy!)
}

import { runShellCmd } from '../../utils'
import { IGetPkgVersionFromRegistry, getMaxStableVersion } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['npm', 'info', options.pkgName, '--fields', options.versionStrategy === 'latest' && !options.version ? 'version' : 'versions', '--json'])
  const content = JSON.parse(result)
  if (options.version) {
    const versions = Array.isArray(content.versions) ? content.versions : [content.versions]
    return versions.includes(options.version) ? options.version : ''
  }
  if (options.versionStrategy === 'latest') return content.version
  return getMaxStableVersion(Array.isArray(content.versions) ? content.versions : [content.versions], options.versionStrategy!)
}

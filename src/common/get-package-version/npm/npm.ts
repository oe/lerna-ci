import { runShellCmd } from '../../utils'
import { IGetPkgVersionFromRegistry, getMaxStableVersion } from './common'

/**
 * get package version
 * 
 *  if version is specified in options will check for its existence, return its self if it exists, or empty string
 * @param options 
 * @returns 
 */
export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('npm',
    ['info', options.pkgName, options.versionStrategy === 'latest' && !options.version ? 'version' : 'versions', '--json'])
   
  const content =  JSON.parse(result)
  if (options.version) {
    const versions = Array.isArray(content) ? content : [content]
    return versions.includes(options.version) ? options.version : ''
  }
  if (options.versionStrategy === 'latest') return content
  return getMaxStableVersion(Array.isArray(content) ? content : [content], options.versionStrategy!)
}

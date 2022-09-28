import { runShellCmd } from 'deploy-toolkit'
import { IGetPkgVersionFromRegistry } from './common'

export const getPkgVersion: IGetPkgVersionFromRegistry = async (options): Promise<string> => {
  const result = await runShellCmd('yarn',
    ['npm', 'info', options.pkgName, '--fields', options.versionStrategy === 'latest' ? 'version' : 'versions'])
  const content = JSON.parse(result).version
  if (options.versionStrategy === 'latest') return content.version
  if (options.version) {
    return content.versions.includes(options.version) ? options.version : ''
  }
  return content.versions.pop()
}

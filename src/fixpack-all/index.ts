import fixpackLib from 'fixpack'
import path from 'path'
import {
  getAllPackageDigests,
  IPackageFilterOptions,
  IPackageDigest,
  logger,
} from '../common'
import defaultConfig from './config'

export interface IFixPackOptions {
  /**
   * which package's should be fixed
   */
  packageFilter?: IPackageFilterOptions
  /**
   * package fix configuration
   *  see https://github.com/HenrikJoreteg/fixpack#configuration for details
   */
  config?: any
}

export async function fixpack (options: IFixPackOptions = {}): Promise<IPackageDigest[]> {
  const pkgs = await getAllPackageDigests(options.packageFilter)
  const pwd = process.cwd()
  return pkgs.filter((pkg) => {
    logger.info(`\nchecking '${pkg.name}' in ${pkg.location.replace(pwd, '.')}`)
    const changed = fixpackLib(path.join(pkg.location, 'package.json'), options.config || defaultConfig)
    return changed
  })
}

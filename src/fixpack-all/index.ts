import fixpack from 'fixpack'
import path from 'path'
import { IPackageDigest } from '../types'
import { getAllPackageDigests, IPackageFilterOptions} from '../pkg-info'
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

export async function fixPackageJson (options: IFixPackOptions = {}): Promise<IPackageDigest[]> {
  const pkgs = await getAllPackageDigests(options.packageFilter)
  const pwd = process.cwd()
  return pkgs.filter((pkg) => {
    console.log(`\nchecking '${pkg.name}' in ${pkg.location.replace(pwd, '.')}`)
    const changed = fixpack(path.join(pkg.location, 'package.json'), options.config || defaultConfig)
    return changed
  })
}

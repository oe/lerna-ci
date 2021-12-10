import fixpack from './fixpack'
import path from 'path'
import { getAllPackageDigests, IPkgFilter } from '../utils'


/**
 * format all packages' package.json
 * @param config custom fixpack config, see https://github.com/HenrikJoreteg/fixpack
 */
export async function fixPackageJson (config?: object)
/**
 * format all packages' package.json 
 * @param filter filter specific package
 * @param config custom fixpack config, see https://github.com/HenrikJoreteg/fixpack
 */
export async function fixPackageJson (filter: IPkgFilter, config: object)
export async function fixPackageJson (filter?: IPkgFilter | object, config?: object) {
  let pkgs = await getAllPackageDigests()
  if (!filter) {
    config = {}
  } else {
    if (typeof filter === 'function') {
      // @ts-ignore
      pkgs = pkgs.filter(filter)
    } else {
      config = filter
    }
  }
  return pkgs.filter((pkg) => fixpack(path.join(pkg.location, 'package.json'), config))
}
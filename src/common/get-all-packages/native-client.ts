import path from 'path'
import { runShellCmd } from 'deploy-toolkit'
import { IPackageDigest } from '../types'
import { getProjectRoot, readPackageJson, readRootPkgJson } from '../utils'
import { getRepoNpmClient } from '../get-package-version/npm'
/**
 * get all package's info in a lerna project
 */
export async function getAllPackages(): Promise<IPackageDigest[] | false> {
  const rootPath = await getProjectRoot()
  const pkgJson = await readRootPkgJson()
  // not managed by npm or yarn's workspace feature
  if (!pkgJson.workspaces || !pkgJson.workspaces.length) return false
  const client = await getRepoNpmClient()
  switch (client) {
    case 'yarn':
      return await getPackagesViaYarn(rootPath)
    case 'yarn-next':
      return await getPackagesViaYarnNext(rootPath)
    case 'pnpm':
      return await getPackagesViaPnpm(rootPath)
    case 'npm':    
      return await getPackagesViaNpm(rootPath)
    default:
      return false
  }
}

async function getPackagesViaYarn(rootPath: string): Promise<IPackageDigest[]> {
  const content = await runShellCmd('yarn', ['workspaces', 'info', '--json'], {
    cwd: rootPath,
  })
  const lines = content.split('\n')
  if (!lines[0].trim().startsWith('{')) lines.shift()
  if (!lines[lines.length - 1].trim().endsWith('}')) lines.pop()
  try {
    const json = JSON.parse(lines.join(''))
    return Object.keys(json).map(name => {
      const location = path.join(rootPath, json[name].location)
      const pkgJson = readPackageJson(location)
      return {
        name,
        location,
        version: pkgJson.version,
        private: !!pkgJson.private
      }
    })
  } catch (error: any) {
    throw new Error(`unable to get workspace packages via yarn classical: ${error.message}`)
  }
}

async function getPackagesViaYarnNext(rootPath: string): Promise<IPackageDigest[]> {
  const content = await runShellCmd('yarn', ['workspaces', 'list', '--json'], {
    cwd: rootPath,
  })
  
  try {
    const pkgs = content.split('\n')
      .map(line => JSON.parse(line))
      // ignore the root
      .filter(pkg => pkg.location !== '.')
    return pkgs.map(pkg => {
      const location = path.join(rootPath, pkg.location)
      const pkgJson = readPackageJson(location)
      return {
        name: pkg.name,
        location,
        version: pkgJson.version,
        private: !!pkgJson.private
      }
    })
  } catch (error: any) {
    throw new Error(`unable to get workspace packages via yarn next: ${error.message}`)
  }
}

async function getPackagesViaPnpm(rootPath: string): Promise<IPackageDigest[]> {
  const content = await runShellCmd('pnpm', ['m', 'ls', '--json'], {
    cwd: rootPath,
  })
  
  try {
    const pkgs = JSON.parse(content)
    return pkgs.map(pkg => {
      return {
        name: pkg.name,
        location: pkg.path,
        version: pkg.version,
        private: pkg.private
      }
    })
  } catch (error: any) {
    throw new Error(`unable to get workspace packages via pnpm: ${error.message}`)
  }
}

async function getPackagesViaNpm(rootPath: string): Promise<IPackageDigest[]> {
  const version = await runShellCmd('npm', ['--version'])
  // get major version
  if (Number(version.replace(/\..*$/, '')) < 7) {
    console.log('rootPath', rootPath)
    throw new Error(`npm@${version} does not support workspaces`)
  }
  // const content = await runShellCmd('npm', ['ls', '-prod', '-ws', '--json'], {
  //   cwd: rootPath,
  // })
  
  throw new Error('npm workspace management is messed up, currently not support')
}
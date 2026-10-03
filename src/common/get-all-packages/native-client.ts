import path from 'path'
import fs from 'fs'
import { findPackages as findPkgs } from 'find-packages'
import { IPackageDigest } from '../types'
import { getProjectRoot, readPackageJson, runShellCmd } from '../utils'
import { getRepoNpmClient } from '../get-package-version/npm'
/**
 * get all package's info in a lerna project
 */
export async function getAllPackages(rootPath?: string): Promise<IPackageDigest[] | false> {
  rootPath = rootPath || await getProjectRoot()
  const pkgJson = readPackageJson(rootPath)
  const client = await getRepoNpmClient(rootPath)
  if (client === 'pnpm' && fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml'))) {
    return await getPackagesViaPnpm(rootPath)
  }
  // not managed by npm or yarn's workspace feature
  const workspacePatterns = Array.isArray(pkgJson.workspaces) ? pkgJson.workspaces : pkgJson.workspaces?.packages
  if (!workspacePatterns?.length) return false
  switch (client) {
    case 'yarn':
      return await getPackagesViaYarn(rootPath)
    case 'yarn-next':
      return await getPackagesViaYarnNext(rootPath)
    case 'pnpm':
    case 'npm':
      return await getPackagesViaGlob(rootPath, workspacePatterns)
    default:
      return false
  }
}

async function getPackagesViaYarn(rootPath: string): Promise<IPackageDigest[]> {
  const content = await runShellCmd('yarn', ['workspaces', 'info', '--json'], {
    cwd: rootPath, shell: false,
  })
  const jsonOutput = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
  try {
    const json = JSON.parse(jsonOutput)
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
    cwd: rootPath, shell: false,
  })

  try {
    const pkgs = content.trim().split('\n')
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
    cwd: rootPath, shell: false,
  })

  try {
    const pkgs = JSON.parse(content)
    return pkgs.map(pkg => {
      // remove the root package to avoid duplicates
      if (pkg.path === rootPath) return false
      return {
        name: pkg.name,
        location: pkg.path,
        version: pkg.version,
        private: pkg.private
      }
    }).filter(Boolean)
  } catch (error: any) {
    throw new Error(`unable to get workspace packages via pnpm: ${error.message}`)
  }
}

async function getPackagesViaGlob(rootPath: string, workspacePatterns: string[]): Promise<IPackageDigest[]> {
  // braces currently has no patched release for GHSA-vfj7-8cjw-p6xm.
  // Bound AST nesting before passing project-supplied patterns to fast-glob.
  for (const pattern of workspacePatterns) {
    if (typeof pattern !== 'string') throw new Error('workspace patterns must be strings')
    const nesting: string[] = []
    for (let index = 0; index < pattern.length; index++) {
      const char = pattern[index]
      if (char === '\\') {
        index++
      } else if (char === '{' || char === '(') {
        nesting.push(char)
        if (nesting.length > 32) throw new Error('workspace pattern nesting exceeds the supported limit of 32')
      } else if ((char === '}' && nesting[nesting.length - 1] === '{')
        || (char === ')' && nesting[nesting.length - 1] === '(')) {
        nesting.pop()
      }
    }
  }
  // find packages via pnpm's find-packages
  const pkgs = await findPkgs(rootPath, {
    patterns: workspacePatterns
  })
  return pkgs.sort((a, b) => a.dir.localeCompare(b.dir)).map(pkg => ({
    name: pkg.manifest.name || '',
    version: pkg.manifest.version || '',
    private: !!pkg.manifest.private,
    location: pkg.dir,
  }))
}

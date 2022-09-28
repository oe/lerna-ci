import semver from 'semver'
import { runShellCmd } from 'deploy-toolkit'
import {
  getAllPackageDigests,
  EVerSource,
  IVersionPublishStrategy,
  getGitRoot,
  syncPruneGitTags,
  getPkgVersionFormRegistry,
} from '../common'
import { syncLocal } from '../sync-local'

export interface ICanPushOptions {
  publishStrategy: IVersionPublishStrategy
  noPrivate: boolean
  checkCommit?: boolean
}

export async function canPublish(options: ICanPushOptions) {
  const gitRoot = await getGitRoot()
  if (gitRoot) {
    await checkGitLocalStatus(options.checkCommit)
    await checkGitIsUptoDate()
  } else {
    console.log('not in a git project')
  }

  if (options.publishStrategy !== 'alpha') {
    const result = await syncLocal({
      versionRangeStrategy: 'retain',
      versionSource: EVerSource.ALL,
      checkOnly: true
    })
    if (result.length) {
      throw new Error('local packages versions are not synced to the latest, this will break public progress')
    }
    return true
  }
  if (gitRoot) {
    await syncPruneGitTags()
  }
  // check alpha version
  const result = await checkNextVersionIsAvailable(options.publishStrategy, !!gitRoot)
  // if (result)
  return false
}

async function checkGitLocalStatus(checkCommit?: boolean) {
  const gitStatus = await runShellCmd('git', ['status', '--porcelain'])
  const messages = gitStatus.trim().split('\n')
  if (!messages.length) return true
  if (checkCommit) {
    const msg = 'local has uncommitted changes\n' + gitStatus
    throw new Error(msg)
  }
  const conflicts = messages.filter(l => l.startsWith('C '))
  if (conflicts.length) {
    const msg = 'local has unsolved conflicts\n'
    const conflictFiles = conflicts.map(l => l.replace('C ', ''))
    throw new Error(msg + conflictFiles.join('\n'))
  }
  return true
}


async function checkGitIsUptoDate() {
  const result = await runShellCmd('git', ['status', '-uno'])
  if (result.includes('is up to date with')) return true
  const lines = result.trim().split('\n').slice(0, 2)
  const msg = lines[1].replace('Your branch', lines[0].replace('On branch ', ''))
  throw new Error(msg)
}

async function checkNextVersionIsAvailable(publishStrategy: IVersionPublishStrategy, checkGit: boolean) {
  const pkgs = await getAllPackageDigests()
  const metas = pkgs.map(pkg => ({
    name: pkg.name,
    version: pkg.version && getNextVersion(pkg.name, pkg.version, publishStrategy),
    private: pkg.private
  }))
  let result = await Promise.all(metas.map(meta => checkPkg(meta, checkGit)))
  result = result.filter(item => item !== true)
  return result.length ? result : true
}

async function checkPkg(meta: {name: string; version?: string | null; private: boolean}, checkGit: boolean) {
  // no version available
  if (!meta.version) return true
  const errors: string[] = []
  if (checkGit) {
    const tagName = `${meta.name}@${meta.version}`
    const result = await runShellCmd('git', ['tag', '-l', tagName])
    if (result.trim()) {
      errors.push(`upcoming tag ${tagName} is existing on git`)
    }
  }
  // only check public package for version
  if (!meta.private) {
    const version = await getPkgVersionFormRegistry({pkgName: meta.name, version: meta.version})
    if (version) {
      errors.push(`${meta.name} upcoming version ${version} is existing on registry`)
    }
  }
  return errors.length ? errors : true
}

function getNextVersion(pkgName: string, version: string, publishStrategy: IVersionPublishStrategy) {
  if (!version) return version
  let ver: string | null
  if (publishStrategy === 'alpha') {
    ver =semver.inc(version, 'prerelease', 'alpha')
  } else {
    ver = semver.inc(version, publishStrategy)
  }
  if (ver === null) {
    throw new Error(`package ${pkgName}'s version ${version} is invalid`)
  }
  return ver
}

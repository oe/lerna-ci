import semver from 'semver'
import { runShellCmd } from 'deploy-toolkit'
import {
  getAllPackageDigests,
  EVerSource,
  IVersionPublishStrategy,
  getGitRoot,
  IPackageDigest,
  syncPruneGitTags,
  getPkgVersionFormRegistry,
  logger,
  IChangedPackage,
} from '../common'
import { syncLocal } from '../sync-local'

export interface ICanPushOptions {
  publishStrategy: IVersionPublishStrategy
  noPrivate: boolean
  checkCommit?: boolean
}

export type IFailPublishReason = { type: 'git-not-clean'; content: IGitStatus }
| { type: 'git-outdated'; content: IGitSyncStatus }
| { type: 'local-version-outdated'; content: IChangedPackage[] }
| { type: 'next-version-unavailable'; content: IPkgVersionAvailability[] }

export interface IPublishQualification {
  /** whether can publish or not */
  eligible: boolean
  /**
   * has value when ineligible
   */
  reasons?: IFailPublishReason[]
}

export async function canPublish(options: ICanPushOptions): Promise<IPublishQualification> {
  const gitRoot = await getGitRoot()
  const reasons: IFailPublishReason[] = []
  if (gitRoot) {
    const gitStatus = await checkGitLocalStatus(options.checkCommit)
    if (gitStatus.status !== 'clean') {
      reasons.push({
        type: 'git-not-clean',
        content: gitStatus
      })
    }
    const gitSyncStatus =  await checkGitSyncStatus()
    if (!gitSyncStatus.isUp2dated) {
      reasons.push({
        type: 'git-outdated',
        content: gitSyncStatus
      })
    }
  } else {
    logger.warn('current project not in a git repo')
  }

  if (options.publishStrategy !== 'alpha') {
    const result = await syncLocal({
      versionRangeStrategy: 'retain',
      versionSource: EVerSource.ALL,
      checkOnly: true
    })
    if (result && result.length) {
      reasons.push({
        type: 'local-version-outdated',
        content: result
      })
    }
  } else {
    if (gitRoot) {
      await syncPruneGitTags()
    }
    // check alpha version
    const versionAvailable = await checkNextVersionIsAvailable(options.publishStrategy, !!gitRoot)
    if (versionAvailable !== true) {
      reasons.push({
        type: 'next-version-unavailable',
        content: versionAvailable
      })
    }
  }
  return reasons.length ? { eligible: false, reasons } : { eligible: true }
}

export interface IGitStatus {
  status: 'clean' | 'uncommitted' | 'conflicts'
  files?: string[]
}

async function checkGitLocalStatus(checkCommit?: boolean): Promise<IGitStatus> {
  const gitStatus = await runShellCmd('git', ['status', '--porcelain'])
  const messages = gitStatus.trim().split('\n')
  if (!messages.length) return { status: 'clean' }
  if (checkCommit) {
    return {
      status: 'uncommitted',
      files: messages
    }
  }
  const conflicts = messages.filter(l => l.startsWith('C '))
  if (conflicts.length) {
    const conflictFiles = conflicts.map(l => l.replace('C ', ''))
    return {
      status: 'conflicts',
      files: conflictFiles
    }
  }
  return { status: 'clean' }
}

export interface IGitSyncStatus {
  isUp2dated: boolean
  message?: string
}

async function checkGitSyncStatus(): Promise<IGitSyncStatus> {
  const result = await runShellCmd('git', ['status', '-uno'])
  if (result.includes('is up to date with')) return { isUp2dated: true }
  const lines = result.trim().split('\n').slice(0, 2)
  const message = lines[1].replace('Your branch', lines[0].replace('On branch ', ''))
  return {
    isUp2dated: false,
    message,
  }
}

async function checkNextVersionIsAvailable(publishStrategy: IVersionPublishStrategy, checkGit: boolean) {
  const pkgs = await getAllPackageDigests()
  const metas = pkgs.map(pkg => Object.assign({}, pkg, {
    version: pkg.version && getNextVersion(pkg.name, pkg.version, publishStrategy),
  }))
  let result = await Promise.all(metas.map(meta => checkPkgVersionAvailable(meta, checkGit)))
  result = result.filter(item => item.available !== true)
  return result.length ? result : true
}

export interface IPkgVersionAvailability {
  available: boolean
  name: string
  version: string
  location: string
  reasons?: Array<'git' | 'npm'>
}

async function checkPkgVersionAvailable(meta: IPackageDigest, checkGit: boolean): Promise<IPkgVersionAvailability> {
  const result: IPkgVersionAvailability = {
    available: true,
    name: meta.name,
    location: meta.location,
    version: meta.version,
  }
  // no version available
  if (!meta.version) return result
  if (checkGit) {
    const tagName = `${meta.name}@${meta.version}`
    const tag = await runShellCmd('git', ['tag', '-l', tagName])
    if (tag.trim()) {
      result.available = false
      result.reasons = [ 'git' ]
    }
  }
  // only check public package for version
  if (!meta.private) {
    const version = await getPkgVersionFormRegistry({pkgName: meta.name, version: meta.version})
    if (version) {
      result.available = false
      result.reasons = (result.reasons || []).concat(['npm'])
    }
  }
  return result
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
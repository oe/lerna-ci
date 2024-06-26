import semver from 'semver'
import {
  getAllPackageDigests,
  EVerSource,
  IReleaseType,
  getGitRoot,
  IPackageDigest,
  syncPruneGitTags,
  getVersionFormRegistry,
  logger,
  IChangedPackage,
  runShellCmd,
} from '../common'
import { syncLocal } from '../sync-local'
import { getChanged } from '../changed'

export interface ICanPushOptions {
  /**
   * version release type
   * @default patch
   */
  releaseType: IReleaseType
  /**
   * available when releaseType is pre*
   * @default alpha
   */
  period?: string
  /**
   * check local git has uncommitted changes
   */
  checkCommit?: boolean
  /**
   * whether use max version to release
   *  if set true, it will try sync all local packages' versions to the maximal,
   *    if any package is not up to date, check failed
   */
  useMaxVersion?: boolean
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
  if (gitRoot) {
    await syncPruneGitTags()
  }
  let changedPkgs: IPackageDigest[] = []
  try {
    changedPkgs = await getChanged()
    if (!changedPkgs.length) {
      logger.warn('no changed packages found, nothing to publish')
    }
  } catch (error) {
    // @ts-ignore
    if (error.type === 'not-support') {
      logger.warn('unable to get changed packages(via `lerna-ci changed`), will check all packages')
      changedPkgs = await getAllPackageDigests()
    } else {
      throw error
    }
  }

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

  // check whether local are using the maximal versions
  if (options.useMaxVersion) {
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
  }
  if (changedPkgs.length) {
    // check alpha version
    const versionAvailable = await checkNextVersionIsAvailable(changedPkgs, options.releaseType, !!gitRoot, options.period)
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
  let gitStatus = await runShellCmd('git', ['status', '--porcelain'])
  gitStatus = gitStatus.trim()
  if (!gitStatus) return { status: 'clean' }
  const messages = gitStatus.split('\n').map(l => l.trim())
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
  // "ahead of remote" is ok, publish won't be blocked
  if (result.includes('is up to date with') || result.includes('is ahead of')) return { isUp2dated: true }
  const message = result.replace('Your branch', '')
    .replace('On branch ', '')
    .replace(/[\n\r]/g, ' ')
  return {
    isUp2dated: false,
    message,
  }
}

async function checkNextVersionIsAvailable(pkgs: IPackageDigest[], publishStrategy: IReleaseType, checkGit: boolean, period?: string) {
  const metas = pkgs.map(pkg => Object.assign({}, pkg, {
    version: pkg.version && getNextVersion({
      pkgName: pkg.name,
      version: pkg.version,
      releaseType: publishStrategy,
      period,
    }),
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
    const version = await getVersionFormRegistry({pkgName: meta.name, version: meta.version})
    if (version) {
      result.available = false
      result.reasons = (result.reasons || []).concat(['npm'])
    }
  }
  return result
}

interface IGetNextVersionOptions {
  pkgName: string
  version: string
  releaseType: IReleaseType
  period?: string
}

function getNextVersion(options: IGetNextVersionOptions) {
  if (!options.version) return options.version
  const releaseType = options.releaseType || 'patch'
  const identifier = /^pre/.test(options.releaseType) ? (options.period || 'alpha') : undefined
  const ver = semver.inc(options.version, releaseType, identifier)
  if (ver === null) {
    throw new Error(`package ${options.pkgName}'s version ${options.version} is invalid, unable to get its next version`)
  }
  return ver
}

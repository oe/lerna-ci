import { runShellCmd } from 'deploy-toolkit'
import {
  getAllPackageDigests,
  EVerSource,
  IVersionPublishStrategy,
  getGitRoot,
  syncPruneGitTags
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
  const pkgs = await getAllPackageDigests()

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

async function checkNextV(params:type) {
  
}

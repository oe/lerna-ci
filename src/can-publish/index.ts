import { runShellCmd } from 'deploy-toolkit'
import { getAllPackageDigests, EVerSource, IVersionPublishStrategy } from '../common'
import { syncLocal } from '../sync-local'

export interface ICanPushOptions {
  publishStrategy: IVersionPublishStrategy
  noPrivate: boolean
  checkCommit?: boolean
}

export async function canPublish(options: ICanPushOptions) {
  try {
    const gitStatus = await runShellCmd('git', ['status', '--porcelain'])
    const messages = gitStatus.trim().split('\n')
    if (messages.length) {
      if (options.checkCommit) {
        console.log('local has uncommitted changes')
      } else {
        const conflicts = messages.filter(l => l.startsWith('C '))
        if (conflicts.length) {
          console.log('local has unsolved conflicts')
          const conflictFiles = conflicts.map(l => l.replace('C ', ''))
          console.log(conflictFiles)
        }
      }
    }
  } catch (error) {
    if (!options.checkCommit) {
      console.log('not in a git project')
    }
  }
  if (options.publishStrategy !== 'alpha') {
    const result = await syncLocal({
      versionRangeStrategy: 'retain',
      versionSource: EVerSource.ALL,
      checkOnly: true
    })
    if (result.length) {
      throw new Error('local packages version are not synced to the latest')
    }
    return true
  }
  // check alpha version
  const pkgs = await getAllPackageDigests()
  
  return false
}

import { runShellCmd } from 'deploy-toolkit'
import { IVersionPickStrategy, IVersionMap } from '../types'
import { maxVersion, syncPruneGitTags } from '../utils'
/**
 * get package version from git tags
 */


const tagVerReg = /^((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*)@(\d.*)$/
/**
 * convert git tag to {name, version}
 * @param tag tag name: @elements/list@1.2.3
 */
function convertGitTag(tag: string) {
  if (tagVerReg.test(tag)) {
    return {
      name: RegExp.$1,
      version: RegExp.$2,
    }
  }
  return
}

/**
 * get newest tag from remote git server
 */
export async function getPackageVersionsFromGit(type: IVersionPickStrategy = 'latest') {
  await syncPruneGitTags()
  // git semver sorting failed to sort with prerelease version // ['tag', '-l', '|', 'sort', '-V', '--reverse']
  const tagArgs = ['tag', '-l', '--sort=-creatordate']
  // get tags sort by tag version desc
  const tags = await runShellCmd('git', tagArgs)
  if (!tags) return {}
  const tagLines = tags.trim().split('\n')
  if (type === 'latest') {
    return tagLines.reduce((acc, cur) => {
      const tagInfo = convertGitTag(cur)
      if (!tagInfo) return acc
      if (!acc[tagInfo.name]) {
        acc[tagInfo.name] = tagInfo.version
      }
      return acc
    }, {} as IVersionMap)
  } else {
    const versionMap = tagLines.reduce((acc, cur) => {
      const tagInfo = convertGitTag(cur)
      if (!tagInfo) return acc
      if (!acc[tagInfo.name]) {
        acc[tagInfo.name] = [tagInfo.version]
      } else {
        acc[tagInfo.name].push(tagInfo.version)
      }
      return acc
    }, {} as Record<string, string[]>)
    return Object.keys(versionMap).reduce((acc, key) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      acc[key] = maxVersion(...versionMap[key])!
      return acc
    }, {} as IVersionMap)
  }
}
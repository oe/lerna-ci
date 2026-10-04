
import { IVersionPickStrategy, IVersionMap } from '../types'
import { runShellCmd, maxVersion, syncPruneGitTags } from '../utils'
import semver from 'semver'
/**
 * get package version from git tags
 */


const tagVerReg = /^((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*)@(\d.*)$/
/**
 * convert git tag to {name, version}
 * @param tag tag name: @elements/list@1.2.3
 */
function convertGitTag(tag: string) {
  const match = tag.match(tagVerReg)
  if (match && semver.valid(match[2])) {
    return {
      name: match[1],
      version: match[2],
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
  const tags = await runShellCmd('git', tagArgs, { shell: false })
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

      const versions = versionMap[key]
      const stable = versions.filter(v => !semver.prerelease(v))
      acc[key] = maxVersion(...(type === 'max-stable' && stable.length ? stable : versions))!
      return acc
    }, {} as IVersionMap)
  }
}

import { runShellCmd } from 'deploy-toolkit'
import { join } from 'path'
import fs from 'fs'
import { getConfig } from './config'

/**
 * remove version in tag
 * @param tag tag name: @elements/list@1.2.3
 */
function removeTagVersion(tag) {
  return tag.replace(/@\d.*$/, '')
}

/**
 * get newest tag from remote git server
 */
async function getLatestTag() {
  // sync all tags from remote, and prune noexists tags in locale
  await runShellCmd('git', ['fetch', 'origin', '--prune', '--tags'])
  // get tags sort by tag version desc
  const tags = await runShellCmd('git', [
    'tag',
    '-l',
    '|',
    'sort',
    '-V',
    '--reverse'
  ])
  return tags
    .trim()
    .split('\n')
    .reduce((acc, cur) => {
      const last = acc[acc.length - 1]
      if (last && removeTagVersion(last) === removeTagVersion(cur)) return acc
      acc.push(cur)
      return acc
    }, [] as string[])
    .reduce((acc, cur) => {
      const matches = /^((?:@[\w-]+\/)?[\w-]+)@(\d.*)$/.exec(cur)
      if (matches) {
        acc[matches[1]] = matches[2]
      } else {
        console.warn('[warning]unmatched tag', cur)
      }
      return acc
    }, {} as { [k: string]: string })
}

async function getAllLocalPkgs() {
  try {
    const result = await runShellCmd('npx', ['lerna', 'list', '--json'])
    return JSON.parse(
      result
        .split('\n')
        .filter(l => /^[\s\[\]]/.test(l))
        .join('\n')
    )
  } catch (error) {
    console.warn('[lerna-ci]exec lerna failed', error)
    const pkg = require(join(getConfig('projectRoot')!, './package.json'))
    return [
      {
        name: pkg.name,
        version: pkg.version,
        private: pkg.private || false,
        location: __dirname
      }
    ]
  }
}

function updateDepsVersion(deps, versions) {
  if (!deps) return
  Object.keys(deps).forEach(k => {
    if (k in versions) {
      deps[k] = `^${versions[k]}`
    }
  })
}

function updatePkg(pkgDigest, latestVersions) {
  const pkgPath = join(pkgDigest.location, 'package.json')
  const pkg = require(pkgPath)
  if (latestVersions[pkg.name]) {
    if (latestVersions[pkg.name] !== pkg.version) {
      console.log(
        `[sync pkg versions] update ${pkg.name}'s version from ${
        pkg.version
        } => ${latestVersions[pkg.name]}`
      )
      pkg.version = latestVersions[pkg.name]
    }
  }
  updateDepsVersion(pkg.devDependencies, latestVersions)
  updateDepsVersion(pkg.dependencies, latestVersions)
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
}

export async function syncPkgVersions() {
  const latestVersions = await getLatestTag()
  const allPkgs = await getAllLocalPkgs()
  allPkgs.forEach(item => updatePkg(item, latestVersions))
  console.log(
    `[sync pkg versions] Your local packages' versions have been updated to git tags`
  )
}


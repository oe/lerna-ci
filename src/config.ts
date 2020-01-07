import { findFileRecursive } from 'deploy-toolkit'

// interface IConfig {
//   /** remote git url */
//   remoteUrl?: string
//   /** project root dir, default dir contains .git folder */
//   projectRoot?: string
//   /** release branch: default master */
//   releaseBranch?: string
//   /** dev branch: default dev */
//   devBranch?: string
// }


interface IConfig {
  /** lerna-ci version */
  // version?: string
  /** remote git url */
  gitRemoteUrl?: string
  /** project root dir, default dir contains .git folder */
  projectRoot?: string
  /** release branch: default master */
  releaseBranch?: string
  /** dev branch: default dev */
  devBranch?: string
  /** git user email: default $GITLAB_USER_EMAIL */
  gitUserEmail?: string
  /** git user name: default lerna-ci-robot */
  gitUserName?: string
  /** bump version for lerna: default patch */
  lernaBumpVersion?: string
  /** npm registry, default https://registry.npmjs.com */
  npmRegistry?: string
  /** alter file to generate a new commit */
  alterFileName?: string
  /** commit message for release branch: default [lerna-ci] publish [skip ci]. (will append [skip ci] if it's missing) */
  releaseCommitMessage?: string
  /** commit message for dev branch:  default [lerna-ci] sync package versions  */
  devCommitMessage?: string
}

const config: IConfig = {}

let isInited = false

export function setup (cfg: IConfig = {}) {
  isInited = true
  const defaults: IConfig = {
    projectRoot: findFileRecursive('.git', process.cwd(), true),
    releaseBranch: 'master',
    devBranch: 'dev',
    gitUserEmail: process.env.GITLAB_USER_EMAIL,
    gitUserName: 'lerna-ci-robot',
    lernaBumpVersion: 'patch',
    npmRegistry: 'https://registry.npmjs.org',
    alterFileName: '.change',
    releaseCommitMessage: '[lerna-ci] publish [skip ci]',
    devCommitMessage: '[lerna-ci] sync package versions'
  }
  Object.assign(config, defaults, cfg)
  // config.version = require(join(__dirname, '../package.json')).version
  // append `[skip ci]` if it's missing
  // @ts-ignore
  if (!/\[skip ci\]/.test(config.releaseCommitMessage)) {
    config.releaseCommitMessage += '[skip ci]'
  }
}

export function getConfig (key: keyof IConfig) {
  if (!isInited) throw new Error('[lerna-ci] you need to call `setup` before get config')

  return config[key]
}
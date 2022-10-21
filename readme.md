<h1 align="center">lerna-ci</h1>

<div align="center">
  <a href="https://github.com/oe/lerna-ci/actions">
    <img src="https://github.com/oe/lerna-ci/actions/workflows/main.yml/badge.svg" alt="github actions">
  </a>
  <a href="#readme">
    <img src="https://badgen.net/badge/Built%20With/TypeScript/blue" alt="code with typescript" height="20">
  </a>
  <a href="#readme">
    <img src="https://badge.fury.io/js/lerna-ci.svg" alt="npm version" height="20">
  </a>
  <a href="https://www.npmjs.com/package/lerna-ci">
    <img src="https://img.shields.io/npm/dm/lerna-ci.svg" alt="npm downloads" height="20">
  </a>
</div>
<h4 align="center">The essential toolkit for monorepo managed by <a href="https://lerna.js.org/">lerna/npm/yarn/pnpm/turbo</a></h4>


- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Cli commands](#cli-commands)
  - [synclocal](#synclocal)
  - [syncremote](#syncremote)
  - [canpublish](#canpublish)
  - [fixpack](#fixpack)
- [API](#api)
  - [getAllPackageDigests](#getallpackagedigests)
  - [syncPackageVersions](#syncpackageversions)
  - [syncPackageDependenceVersion](#syncpackagedependenceversion)
  - [fixPackageJson](#fixpackagejson)
  - [getChangedPackages](#getchangedpackages)
  - [getRepoNpmClient](#getreponpmclient)
  - [addRange2VersionMap](#addrange2versionmap)
  - [getSingleVersionFromNpm](#getsingleversionfromnpm)
  - [getVersionsFromNpm](#getversionsfromnpm)
  - [getPackageVersionsFromGit](#getpackageversionsfromgit)
  - [isLernaAvailable](#islernaavailable)
  - [maxVersion](#maxversion)
  - [pickOne](#pickone)
- [Configuration file](#configuration-file)
- [Breaking changes](#breaking-changes)

## Features
* sync versions of packages in monorepo (with cli command)
* sync dependencies versions of all packages (with cli command)
* format all package.json files (with cli command)
* check if all packages are qualified to publish to npm (with cli command)
* get all packages' meta info
* some other useful utilities

**`lerna-ci` is designed for monorepo, but it can also be used in standard repo.**

## Install
```sh
# with yarn, install as a devDependency
yarn add lerna-ci -D

# with npm, install as a devDependency
npm install lerna-ci -D
```
you may also install it to global if you use cli commands frequently(not recommended)

Notice: **lerna-ci requires node `>=14.6`**

## Usage

```sh
# sync versions of packages in monorepo, to fix versions of packages in monorepo when they are messed up
yarn lerna-ci synclocal

# sync all packages' dependencies versions
#   following command will sync all @babel scoped npm packages and typescript to latest version, but react and react-dom will be set to 16.x
yarn lerna-ci syncremote "@babel/*" "react@16.x" "react-dom@16.x" typescript

# format all package.json files
yarn lerna-ci fixpack

```

## Cli commands
`lerna-ci` also provide some cli commands, so that you do some task with a single line code.

### synclocal
sync versions of packages in monorepo, using [syncPackageVersions](#syncpackageversions) under the hood.

```sh
# with yarn
yarn lerna-ci synclocal [source] [--check-only]

# version source, determine where to get the packages' versions, could be: 
#   git, npm, local, or all, default all
# if check-only is true, it will only check if packages' versions are synced, exit 1 if not synced

# or if you prefer npm
npx lerna-ci synclocal [source] [--check-only]

# check for more options and examples
yarn lerna-ci synclocal --help
```

It's very useful when local packages versions are messed up, such as:
1. you have a monorepo with 2 packages, `a` and `b`, and `b` depends on `a`
2. `a` has published a new version `1.0.2`, but `a`'s version in `b` is still `0.3.0`

this may lead to some unexpected errors, it can happens in some cases:
1. publish a beta version inside a package without using lerna(or other monorepo tools)
2. partial success when publish packages with lerna(or other monorepo tools), you may use `yarn lerna-ci synclocal all` to fix it

You may need to run `yarn` or `npm install` to make your changes take effect.

### syncdeps
sync all packages' dependencies versions in monorepo, using [syncPackageDependenceVersion](#syncpackagedependenceversion) under the hood

```sh
# with yarn
yarn lerna-ci syncdeps <packageNames...> [--check-only]
# packageNames could be a list of package names, or a list of package name with version range, such as: 
#     "@babel/*" "@babel/core@^7.0.0" "parcel@^2.0.0" "rollup-plugin*"
#     package name with asterisk(*) must be quoted
# if check-only is true, it will check if any package's dependencies need be synced, exit 1 if found

# or if you prefer npm, must use quotes when specify scoped wildcard package name
npx lerna-ci syncdeps <packageNames...> [--check-only]

# check for more options and examples
yarn lerna-ci syncdeps --help
```

You may need to run `yarn` or `npm install` to make your changes take effect.

### canpublish
check if all packages are qualified to publish to npm, using [getChangedPackages](#getchangedpackages) under the hood, it will check:
1. if local has uncommitted changes when in git repo and `--check-git` is true
2. if local has conflicts when in git repo
3. whether local is ahead of remote when in git repo
4. if local packages' versions are synced with the latest version when `use-max-version` is true
5. if next versions(can be configured via `releaseType` and `period`) of local packages are available on npm and git

it will exit 1 if any of the above conditions is satisfied


```sh
yarn lerna-ci canpublish [--releaseType=patch]


# check for more options and examples
yarn lerna-ci canpublish --help
```

### fixpack
format all packages' package.json, using [fixPackageJson](#fixpackagejson) under the hood

```sh
# with yarn
yarn lerna-ci fixpack

# or if you prefer npm
npx lerna-ci fixpack
```
above command will format all package.json files with default configuration, you can configure `fixpack`'s params via [configuration file](#configurationfile)


## API

### getAllPackageDigests
get all packages info in monorepo(including the root package), you can filter with custom options

e.g.
```js
import { getAllPackageDigests } from 'lerna-ci'

// get all packages
getAllPackageDigests().then(res => console.log(res))
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]

// find packages with custom filter function
getAllPackageDigests((digest => digest.name.startWith('@inner/a-'))).then(res => console.log(res))

// find public packages which package name contains '@inner/'
getAllPackageDigests({ignorePrivate: true, keyword: '@inner/'}).then(res => console.log(res))
```

Type Declarations:
```ts
getAllPackageDigests(filter?: IPackageFilterOptions) => Promise<IPackageDigest[]>

/** package filter object */
export interface IPackageFilterObject {
  /** whether need private package */
  ignorePrivate?: boolean
  /** search package contains the keyword */
  keyword?: string
}
/** package filter function */
export type IPackageFilter = (pkg: IPackageDigest, index: number, arr: IPackageDigest[]) => boolean

export type IPackageFilterOptions = IPackageFilterObject | IPackageFilter

/**
 * package digest info
 */
export interface IPackageDigest {
  /** package name */
  name: string
  /** package version */
  version: string
  /** whether package is private */
  private: boolean
  /** package folder full path */
  location: string
}
```
### syncPackageVersions
sync versions of packages in monorepo(version info can be fetch from npm or git tag), if they depend each other and dependence version will be rematched.

> also available as command [synclocal](#synclocal)

e.g.
```js
import { syncPackageVersions } from 'lerna-ci'
// return all changed package infos
const updatedPkgs = await syncPackageVersions({ versionSource: 'npm' })
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]
```

Type Declarations:
```ts
syncPackageVersions(options?: ISyncPackageOptions) => Promise<IPackageDigest[]>


export interface ISyncPackageOptions {
  /**
   * version source, default to `local`
   *  how to get latest locale package versions: npm, git, local or all
   */
  versionSource?: 'npm' | 'git' | 'local' | 'all'
  /**
   * npm/git version strategy
   *  default to 'latest', works only versionSource including `git` or `npm`
   *    latest: last published version number
   *    max: max version number sorted by semver
   */
  versionStrategy?: 'max' | 'latest'
  /**
   * filter which package should be synced
   *  same as the params of `getAllPackageDigests`
   */
  packageFilter?: IPackageFilterOptions
  /**
   * version range strategy that will written to package.json's dependencies, default to '^'
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /**
   * only check, with package.json files untouched
   */
  checkOnly?: boolean
}

export type IVersionRangeStrategy = '>' | '~' | '^' | '>=' | '<' | '<=' | '=' | ((name: string, version: string) => string)

```

Tips: you may need to reinstall your dependence via `yarn && yarn lerna bootstrap` or `npm install && npx lerna bootstrap` if anything changed


### syncPackageDependenceVersion
sync packages dependencies(e.g. babel, react, typescript, etc) versions at once

> also available as command [syncremote](#syncremote)

```js
import { syncPackageDependenceVersion } from 'lerna-ci'

// update all packages that depend `react` and `react-dom` to their latest version(will fetch from npm)
//  return all changed package infos(aka all packages that depend on these packageNames and be updated)
const updatedPkgs = await syncPackageDependenceVersion({ packageNames: ['react', 'react-dom'] })
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]

// as above, but will also update dependence typescript to a fixed version 3.1.0 and parcel to ^2.0.0
const updatedPkgs = await syncPackageDependenceVersion({ packageNames: ['react', 'react-dom'], versionMap: { typescript: '=3.1.0', parcel: '2.0.0' } })
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]
```

Type Declarations:
```ts
syncPackageDependenceVersion(syncOptions: ISyncDepOptions)=> Promise<IPackageDigest[]>

export interface ISyncDepOptions {
  /** 
   * package names that should update
   *  will fetch its version from npm by default
   *  could be specified package name, or scoped wildcard package name(like @babel/preset-*, @parcel/*)
   */
  packageNames?: string[]
  /**
   * version map<pkgName, version>
   *  prefer use this as version source if provided
   *  if packageNames also provided, will fetch unstated packages' version in versionMap
   */
  versionMap?: IVersionMap
  /**
   * npm version strategy
   *  default to 'latest'
   *    latest: last published version number
   *    max: max version number sorted by semver
   */
  versionStrategy?: 'max' | 'latest'
  /**
   * version range strategy, use ^ by default
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /** only check, with package.json files untouched */
  checkOnly?: boolean
}
```

Tips: you may need to reinstall your dependence via `yarn && yarn lerna bootstrap` or `npm install && npx lerna bootstrap` if anything changed

### fixPackageJson
Make all your package.json files are written in same criterion: sorting fields, validating required fields.
This feature is powered by [fixpack](https://github.com/HenrikJoreteg/fixpack).

> also available as command [fixpack](#fixpack)

e.g.
```js
import { fixPackageJson } from 'lerna-ci'

const updatedPkgs = await fixPackageJson()
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]

```

Type Declarations:
```ts
fixPackageJson (options?: IFixPackOptions) => Promise<IPackageDigest[]>

export interface IFixPackOptions {
  /**
   * which package's should be fixed
   */
  packageFilter?: IPackageFilterOptions
  /**
   * package fix configuration
   *  check source <src/fixpack-all/config.ts> for default configuration
   *  see https://github.com/HenrikJoreteg/fixpack#configuration for details
   */
  config?: any
}
```

### getChangedPackages
get local changed packages that will emit a new version

e.g.
```js
import { getChangedPackages } from 'lerna-ci'
getChangedPackages().then(res => console.log(res))
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]
```

Type Declarations:
```ts
getChangedPackages() => Promise<IPackageDigest[]>
```
### getRepoNpmClient
get lerna preferred npm client, aka `npmClient` field's value in `lerna.json`

e.g.
```js
import { getRepoNpmClient } from 'lerna-ci'

// will return npm for default if not specified
getRepoNpmClient().then(client => console.log(client))
// yarn
```

### addRange2VersionMap
convert fixed version number to ranged version number

e.g.
```js
import { addRange2VersionMap } from 'lerna-ci'

// default strategy is '^', version with custom range will be ignore
const verMap = addRange2VersionMap({'lerna-ci': '1.0.2', 'parcel': '2.0', 'react': '>17.0.0'})
// {'lerna-ci': '^1.0.2', 'parcel': '^2.0', 'react': '>17.0.0'}

// use strategy '>='
const verMap = addRange2VersionMap({'lerna-ci': '1.0.2', 'parcel': '2.0', 'react': '>17.0.0'}, '>=')
// {'lerna-ci': '>=1.0.2', 'parcel': '>=2.0', 'react': '>17.0.0'}

// use a custom function
const verMap2 = addRange2VersionMap({'lerna-ci': '1.0.2', 'parcel': '2.0', 'react': '>17.0.0'}, (name, version) => {
  // fix parcel version
  if (name === 'parcel') return version
  // remove custom range, prefix with ^
  return `^${version.replace(/^[^\d]+/,'')}`
})
// {'lerna-ci': '^1.0.2', 'parcel': '2.0', 'react': '^17.0.0'}
```

Type Declarations:
```ts
addRange2VersionMap(versionMap: Record<string, string>, rangeStrategy?: IVersionRangeStrategy) => Record<string, string>

export type IVersionRangeStrategy = '>' | '~' | '^' | '>=' | '<' | '<=' | '=' | ((name: string, version: string) => string)
```

### getSingleVersionFromNpm
get version from npm registry, you can get the latest version or the max version

e.g.
```js
import { getSingleVersionFromNpm } from 'lerna-ci'

getSingleVersionFromNpm('lerna-ci').then(ver => console.log(ver))
// 1.0.2
```

Type Declarations:
```ts
// return undefined if not found
// use getRepoNpmClient to get preferred npm client if npmClient not specified
//   latest: last published version
//   max: max version sorted in semver
getSingleVersionFromNpm(pkgName: string, type: 'latest' | 'max' = 'latest', npmClient?: 'yarn' | 'npm') => Promise<string | undefined>
```
tips: if you want to fetch version from a npm mirror, you should specify the mirror in the `.yarnrc` or `.npmrc` file

### getVersionsFromNpm
batch version of `getSingleVersionFromNpm`, but return an object(key is package name, value is version)

e.g.
```js
import { getVersionsFromNpm } from 'lerna-ci'

getVersionsFromNpm(['lerna-ci', 'react']).then(ver => console.log(ver))
// {'lerna-ci': '1.0.2', react: '17.0.2'}
```

Type Declarations:
```ts
// if some package not found, then its key will be missing in the result
// use getRepoNpmClient to get preferred npm client if npmClient not specified
getVersionsFromNpm(pkgNames: string[], type: 'latest' | 'max' = 'latest', npmClient?: 'yarn' | 'npm') => Promise<Record<string, string>>
```

### getPackageVersionsFromGit
get monorepo package version map from git tag list(only tags in `packageName@versionNumber` like `react@1.0.0` will be recognized).  
**caution**: this api will run `git fetch origin --prune --tags` to sync tags from server, local un-pushed tags will be removed

e.g.
```js
import { getPackageVersionsFromGit } from 'lerna-ci'

// will return npm for default if not specified
getPackageVersionsFromGit().then(ver => console.log(ver))
// {'duplex-message': '1.1.2', 'simple-electron-ipc': '1.1.2'}
```

Type Declarations:
```ts
getPackageVersionsFromGit(type: 'latest' | 'max' = 'latest') => Promise<Record<string, string>>
```

### isLernaAvailable
check whether lerna is installed in current repo

e.g.
```js
import { isLernaAvailable } from 'lerna-ci'

isLernaAvailable().then(isInstalled => console.log(isInstalled))
// true
```

### maxVersion
get max version(compare in semver) from a version list

e.g.
```js
import { maxVersion } from 'lerna-ci'

const maxVer = maxVersion('0.1', '0.0.1', '1.0.0-alpha.1', '1.0.0')
// 1.0.0
```

### pickOne
pick a value from a list with a custom method

e.g.
```js
import { pickOne } from 'lerna-ci'

const picked = pickOne([{name: 'Lisa', age: 10}, {name: 'Janie', age: 12}, {name: 'Marry', age: 9}], (a, b) => a.age - b.age)
// {name: 'Janie', age: 12}
```

Type Declarations:
```ts
pickOne<V>(list: V[], compare: ICompare<V>) => V | undefined

// return `a` if result >= 0, or return `b`
type ICompare<V> = ((a: V, b: V) => -1 | 0 | 1
```


## Configuration file
You may also add config for these commands via following ways(powered by [cosmiconfig](https://github.com/davidtheclark/cosmiconfig)) so that you don't need to specify the arguments:
* add `lerna-ci` field to `package.json` in the root of the project
* add `.lerna-circ` file in the root of the project with json or yaml format
* add `.lerna-circ.json`, `.lerna-circ.yaml`, `.lerna-circ.yml` or `.lerna-circ.cjs` file in the root of the project
* add `lerna-ci.config.js` or `lerna-ci.config.cjs` file in the root of the project

all these configurations should return an object with the following properties:
* `synclocal`: same as the params of [syncPackageVersions](#syncpackageversions)
* `syncremote`: same as the params of [syncPackageDependenceVersion](#syncpackagedependenceversion)
* `fixpack`: same as the params of [fixPackageJson](#fixpackagejson)


## Breaking changes
If you are updating from `0.0.x`, you should be careful about following changes:

1. default configuration for `fixpack` has been changed, you may restore the former behavior by setting `fixpack.config` to [old configuration](https://github.com/oe/lerna-ci/blob/legacy/src/fixpack/config.ts) in [configuration file](#configurationfile)
2. if you are using APIs, most useful APIs are renamed for better understanding, but no feature is removed, you may read docs above to upgrade

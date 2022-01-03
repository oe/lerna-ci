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
<h4 align="center">The essential toolkit for monorepo managed by <a href="https://lerna.js.org/">lerna</a></h4>

- [Features](#features)
- [Install](#install)
- [API](#api)
  - [syncPackageVersions](#syncpackageversions)
  - [syncPackageDependenceVersion](#syncpackagedependenceversion)
  - [fixPackageJson](#fixpackagejson)
  - [getAllPackageDigests](#getallpackagedigests)
  - [getChangedPackages](#getchangedpackages)
  - [getRepoNpmClient](#getreponpmclient)
  - [addRange2VersionMap](#addrange2versionmap)
  - [getSingleVersionFromNpm](#getsingleversionfromnpm)
  - [getVersionsFromNpm](#getversionsfromnpm)
  - [getPackageVersionsFromGit](#getpackageversionsfromgit)
  - [isLernaAvailable](#islernaavailable)
  - [maxVersion](#maxversion)
  - [pickOne](#pickone)
- [Cli commands](#cli-commands)
  - [synclocal](#synclocal)
  - [syncremote](#syncremote)
  - [fixpack](#fixpack)
- [Configuration file](#configuration-file)
- [Breaking changes](#breaking-changes)

## Features
* sync versions of packages in monorepo (with cli command)
* sync dependencies versions of all packages (with cli command)
* format all package.json files (with cli command)
* get all packages' meta info
* get all changed packages' meta info
* some other useful utilities

## Install
```sh
# with yarn, install as a devDependency
yarn add lerna-ci -D

# with npm, install as a devDependency
npm install lerna-ci -D
```
you may also install it to global if you use cli commands frequently(not recommended)

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

## Cli commands
`lerna-ci` also provide some cli commands, so that you do some task with a single line code.

### synclocal
sync versions of packages in monorepo, using [syncPackageVersions](#syncpackageversions) under the hood

```sh
# with yarn
yarn lerna-ci synclocal [version source]

# version source, could be: git, npm, local, or all, default to local

# or if you prefer npm
npx lerna-ci synclocal [version source]
```

### syncremote
sync all packages' dependencies versions in monorepo, using [syncPackageDependenceVersion](#syncpackagedependenceversion) under the hood

```sh
# with yarn
yarn lerna-ci syncremote <packageName1> <packageName2> ... <packageNameN>

# or if you prefer npm
npx lerna-ci syncremote <packageName1> <packageName2> ... <packageNameN>
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

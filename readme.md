# lerna-ci

lerna ci toolkit for monorepo managed by lerna, but works with normal repo too.

## Install
```sh
# with yarn, install as a devDependency
yarn add lerna-ci -D

# with npm, install as a devDependency
npm install lerna-ci -D
```

## usage
### getAllPackageDigests(filter?)
get all packages(including the root package) info in monorepo(including the root package), you can filter with custom options

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
getAllPackageDigests(filter?: IPackageFilter | IPackageFilterOptions) => Promise<IPackageDigest[]>

/** package filter object */
export interface IPackageFilterOptions {
  /** whether need private package */
  ignorePrivate?: boolean
  /** search packages which name contains the keyword */
  keyword?: string
}

/** package filter function */
export type IPackageFilter = (pkg: IPackageDigest, index: number, arr: IPackageDigest[]) => boolean

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

### getChangedPackages
get local changed packages that will trigger its version change

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

### syncPackageVersions(options?)
sync monorepo package versions(version info can be fetch from npm or git tag), if they depend each other and dependence version will be rematched.

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
   *    max: max version number sorted by semver version
   */
  versionStrategy?: 'max' | 'latest'
  /**
   * filter which package should be synced
   *  same as the params of `getAllPackageDigests`
   */
  packageFilter?: IPackageFilter | IPackageFilterOptions
  /**
   * version range strategy, default to '^'
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /**
   * only check, with package.json files untouched
   */
  checkOnly?: boolean
}

export type IVersionRangeStrategy = '>' | '~' | '^' | '>=' | '<' | '<=' | ((name: string, version: string) => string)

```

Tips: you may need to reinstall your dependence via `yarn && yarn lerna bootstrap` or `npm install && npx lerna bootstrap` if anything changed


### syncPackageDependenceVersion(options)
sync packages dependencies(e.g. babel, react, typescript, etc) versions at once

```js
import { syncPackageDependenceVersion } from 'lerna-ci'

// update all packages that depend `react` and `react-dom` to their latest version(will fetch from npm)
//  return all changed package infos
const updatedPkgs = await syncPackageDependenceVersion({ packageNames: ['react', 'react-dom'] })
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]

// as above, but will also update dependence typescript to version 3.1.0
const updatedPkgs = await syncPackageDependenceVersion({ packageNames: ['react', 'react-dom'], versionMap: { typescript: '3.1.0'} })
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
   *    max: max version number sorted by semver version
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


## cli commands
`lerna-ci` also provide some cli commands, so that you do some task with a single line code.

### sync mono repo packages' versions
using [syncPackageVersions](#syncpackageversionsoptions) under the hood

```sh
# with yarn
yarn lerna-ci synclocal [version source]

# version source, could be git, npm, local, or all, default to local

# or if you prefer npm
npx lerna-ci synclocal [version source]
```

You may also add a `lerna-ci.synclocal` field to `package.json` in the root of the project, its value is same as the params of [syncPackageVersions](#syncpackageversionsoptions), then you can run command: `yarn lerna-ci synclocal` without extra arguments


### sync mono repo packages dependencies' version
using [syncPackageDependenceVersion](#syncpackagedependenceversionoptions) under the hood

```sh
# with yarn
yarn lerna-ci syncremote <packageName1> <packageName2> ... <packageNameN>

# or if you prefer npm
npx lerna-ci syncremote <packageName1> <packageName2> ... <packageNameN>
```

You may also add config for these commands via following ways(powered by [cosmiconfig](https://github.com/davidtheclark/cosmiconfig)) so that you don't need to specify the arguments:
* add `lerna-ci` field to `package.json` in the root of the project
* add `.lerna-circ` file in the root of the project with json or yaml format
* add `.lerna-circ.json`, `.lerna-circ.yaml`, `.lerna-circ.yml` or `.lerna-circ.cjs` file in the root of the project
* add `lerna-ci.config.js` or `lerna-ci.config.cjs` file in the root of the project

all these configurations should return an object with the following properties:
* `synclocal`: same as the params of [syncPackageVersions](#syncpackageversionsoptions)
* `syncremote`: same as the params of [syncPackageDependenceVersion](#syncpackagedependenceversionoptions)


## breaking changes on version 1.0
1. fixpack has been removed from lerna-ci, you may use [fixpack](https://github.com/henrikjoreteg/fixpack) instead, it has been much more complete 
2. most useful methods are renamed for better understanding, but no more features is removed, you may read docs above to upgrade

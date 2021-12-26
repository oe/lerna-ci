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

method define
```ts

```

### getChangedPackages
get local changed packages that will trigger its version change

e.g.
```js
import { getChangedPackages } from 'lerna-ci'
getChangedPackages().then(res => console.log(res))
// [{name: 'my-package', version: '1.0.1', private: false, location: '/Users/xx/work/monorepo/my-package'}]
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
you may need to reinstall your dependence via `yarn && yarn lerna bootstrap` or `npm install && npx lerna bootstrap` if anything changed


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
you may need to reinstall your dependence via `yarn && yarn lerna bootstrap` or `npm install && npx lerna bootstrap` if anything changed


## cli command

## changes on version 1.0
1. fixpack has been removed from lerna-ci, you may use [fixpack](https://github.com/henrikjoreteg/fixpack) instead, it has been much more complete 
2. most useful methods are renamed for better understanding, but no more features is removed, you may read docs above to upgrade

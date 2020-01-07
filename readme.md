# lerna-ci

lerna ci toolkit for monorepo managed by lerna, but works with normal repo too.

## Install
```sh
# with yarn, install as a devDependency
yarn add lerna-ci -D

# with npm, install as a devDependency
npm install lerna-ci -D
```

## Scenarios

### sync all local packages' version with npm/git tag


### check whether local packages' version is synced with remote(npm/git) version

### sync all local packages' common dependces to the same versions at the same time
If you are using lerna to manage to monorepo, the packages in your repo are keeping growing, and packages may depend on each other, then packages' dependencies' version may not match with packages in the monorepo by some mistakes.

To fix this, just run:

``` sh
# with yarn
yarn lerna-ci synclocal

# or if you prefer npm
npx lerna-ci synclocal
```

### format all packages' package.json file
This feature is forked from [fixpack](https://github.com/henrikjoreteg/fixpack) by [Henrik Joreteg](https://github.com/HenrikJoreteg)

By this feature, you can do following things to `package.json`s:
- sort fields (even in `dependencies`, `scripts`, and can specify special fields always top)
- validate required fileds
- warning some optional fileds

To do that, just run:

``` sh
# with yarn
yarn lerna-ci fixpack

# or if you prefer npm
npx lerna-ci fixpack
```

The default config for fixpack can be found at [config.ts](./src/fixpack/config.ts). You can custom it by adding `lerna-ci.fixpack` field to overwrite the defaults in the package.json file within the root of project:

```json
"lerna-ci": {
  "fixpack": {
    "required": [
        "name",
        "version",
        "typings"
    ]
  }
}

```

You can read the full config instructions at [fixpack configuration](https://github.com/henrikjoreteg/fixpack#configuration).


## Useful functions

### getAllPkgDigest

get all local packages' digest info, return an array of `IPkgDigest`

```ts
export async function getAllPkgDigest (needPrivate = true, searchKwd = ''): IPkgDigest[]

export interface IPkgDigest {
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


### getLatestPkgVersFromGit
get local packages' latest version info from git tag. This requires you publish monorepo's packages via `lerna publish`

```ts
export async function getLatestPkgVersFromGit (): IPkgVersions

export interface IPkgVersions {
  /** package name: package version no.(without `v`) */
  [k: string]: string
}

```


# lerna-ci

lerna ci toolkit for monorepo managed by lerna.

readme WIP

## Scenarios

### sync all local packages' version with npm/git tag

### check whether local packages' version is synced with remote(npm/git) version

### sync all local packages' common dependces to the same versions at the same time

### fix all local packages' package.json's dependces/devDependces/peerDependces order

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


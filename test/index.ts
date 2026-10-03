import { getVersionsFromRegistry } from '../src'

getVersionsFromRegistry({ pkgNames: ['lerna-ci', '@abc/xxxx'], versionStrategy: 'max' }).then(res => console.log(res))
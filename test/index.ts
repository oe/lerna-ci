import { getVersionsFromNpm } from '../src'

getVersionsFromNpm(['lerna-ci', '@abc/xxxx'], 'max').then(res => console.log(res))
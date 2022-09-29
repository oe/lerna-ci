import path from 'path'
import {
  IChangedPackage,
  formatMessages,
  IMessageTree,
  getProjectRoot,
  logger,
  ILoggerLevel,
  IGitStatus,
  IPkgVersionAvailability,
  getIndent,
  IGitSyncStatus,
} from '../index'

export async function printChangedPackages(changes: IChangedPackage[], indent = 0, level: ILoggerLevel = 'warn') {
  const rootPath = await getProjectRoot()
  const msgs: IMessageTree[] = changes.map(item => {
    return {
      title: `${item.name}(${shortenLocation(item.location, rootPath)})`,
      children: item.changes.map(item => ({
        title: item.field,
        children: item.changes.map(item => `${item.name}: ${item.oldVersion} => ${item.newVersion}`)
      }))
    }
  })
  msgs.forEach(item => logger[level](formatMessages(item, indent)))
}

export function printGitStatus(status: IGitStatus, indent = 0) {
  switch (status.status) {
    case 'clean':
      return logger.success(`${getIndent(indent)}local git is clean`)
    case 'uncommitted':
      return logger.warn(formatMessages({
        title: 'local git has uncommitted changes:',
        children: status.files
      }, indent))
    case 'conflicts':
      return logger.warn(formatMessages({
        title: 'local git has unresolved conflicts:',
        children: status.files
      }, indent))
  }
}

export function printGitSyncStatus(status: IGitSyncStatus, indent = 0) {
  logger.warn(`${getIndent(indent)}${status.message}`)
}

export async function printPkgVersionConflicts(infos: IPkgVersionAvailability[], indent = 0) {
  const rootPath = await getProjectRoot()
  const logs: IMessageTree[] = infos.map(item => ({
    title: `${item.name}(${shortenLocation(item.location, rootPath)})`,
    // @ts-ignore
    children: item.reasons!.map(reason => {
      if (reason === 'git') {
        return `git tag ${item.name}@${item.version} is existing`
      }
      return `npm version ${item.version} for ${item.name}@ is existing on registry`
    })
  }))

  logs.forEach(item => {
    logger.warn(formatMessages(item, indent))
  })
}

function shortenLocation(location: string, rootPath: string) {
  let res = location.replace(rootPath, '')
  if (res.startsWith(path.sep)) res = res.replace(path.sep, '')
  return res || '.'
}
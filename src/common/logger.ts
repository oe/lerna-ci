import colors from 'picocolors'
import { getConfig } from './config'

/** 
 * custom logger to control log output and colors
 */
export const logger ={
  info: (...args: any[]) => {
    if (!getConfig('debug')) return
    console.info(...args.map(l => colors.dim(l)))
  },
  log: (...args: any[]) => {
    if (!getConfig('debug')) return
    console.log(...args)
  },
  warn(...args: string[]): void {
    if (!getConfig('debug')) return
    console.warn(...args.map(l => colors.yellow(l)))
  },
  error(...args: string[]): void {
    if (!getConfig('debug')) return
    console.warn(...args.map(l => colors.red(l)))
  },
  success(...args: string[]): void {
    if (!getConfig('debug')) return
    console.warn(...args.map(l => colors.green(l)))
  }
}

/**
 * available logger level
 */
export type ILoggerLevel = keyof typeof logger

export interface IMessageTree {
  title: string
  children?: Array<string | IMessageTree>
}

export function formatMessages(msg: IMessageTree, indent = 0): string {
  const logs: string[] = [ getIndent(indent) + msg.title ]
  if (!msg.children || !msg.children.length) return logs.join('\n')
  if (typeof msg.children[0] === 'string') {
    logs.push(...msg.children.map(l => getIndent(indent + 1) + l))
  } else {
    // @ts-ignore
    const groups = msg.children.map(item => formatMessages(item, indent + 1))
    groups.reduce((acc, cur) => {
      acc.push(cur)
      return acc
    }, logs)
  }
  return logs.join('\n')
}

export function getIndent(indent: number) {
  return Array(indent * 2 + 1).join(' ')
}

import colors from 'picocolors'
import { getConfig } from './config'

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

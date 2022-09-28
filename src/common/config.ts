export interface IConfig {
  debug: boolean
}

const config: Partial<IConfig> = {}

export function setConfig(cfg: Partial<IConfig>) {
  Object.assign(config, cfg)
}

export function getConfig(): Partial<IConfig>
export function getConfig<T extends keyof IConfig>(key: T): IConfig[T]
export function getConfig(key?: keyof IConfig) {
  if (!key) return Object.assign({}, config)
  return config[key]
}

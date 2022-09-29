
/**
 * package version data source
 */
export const enum EVerSource {
  /** both npm and git */
  ALL = 'all',
  /** from monorepo itself */
  LOCAL = 'local',
  /** from npm */
  NPM = 'npm',
  /** from git */
  GIT = 'git'
}


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

/** Object type */
export type IObject<V = unknown> = Record<string, V>

/** package name: package version no.(without `v`) */
export type IVersionMap =  IObject<string>

/**
 * npm version strategy
 *  max: max package version
 *  latest: latest release package version
 */
export type IVersionPickStrategy = 'max' | 'latest'

/**
 * custom version transform
 */
export type IVerTransform = (name: string, newVersion: string, oldVersion: string) => string

/**
 * upgrade version strategy
 */
export type IUpgradeVersionStrategy = '>' | '~' | '^' | '>=' | '' | 'retain' | IVerTransform 
/**
 * version transform strategy
 *  '' for exact version
 */
export type IVersionRangeStrategy = IUpgradeVersionStrategy | '<' | '<='

/**
 * all public strategy
 *  alpha is alias for prerelease
 */
export const PUBLIC_STRATEGY = <const>['major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor', 'alpha']

/**
 * alpha for prerelease
 */
export type IVersionPublishStrategy = typeof PUBLIC_STRATEGY[number]


/**
 * package.json changed info
 */
export interface IChangedPackage {
  name: string
  location: string
  private: boolean
  changes: IChangedCategory[]
}

/**
 * package.json changed category
 */
export interface IChangedCategory {
  /**
   * cate: dependencies / devDependencies / peerDependencies / optionalDependencies
   */
  field: string
  /**
   * changed packages
   */
  changes: IChangedPkg[]
}


/**
 * single changed dependence info
 */
export interface IChangedPkg {
  /**
   * package name
   */
  name: string
  /**
   * old version
   */
  oldVersion: string
  /**
   * new version
   */
  newVersion: string
}


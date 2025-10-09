interface VersionInfo {
  update: boolean
  version: string
  newVersion?: string
}

interface ErrorType {
  message: string
  error: Error
}

declare module 'better-sqlite3' {
  const Database: any
  export = Database
}

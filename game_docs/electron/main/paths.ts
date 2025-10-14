// paths.ts
import { app } from 'electron'
import path from 'path'

// cache the root once
const APP_ROOT =
  app?.isPackaged
    ? app.getAppPath()        // points inside asar in production
    : process.cwd()           // dev mode

export function fromAppRoot(...segments: string[]): string {
  return path.join(APP_ROOT, ...segments)
}
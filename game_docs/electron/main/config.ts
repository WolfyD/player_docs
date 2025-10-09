import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'

export type AppConfig = {
  projectDir: string | null
}

const DEFAULT_CONFIG: AppConfig = {
  projectDir: null,
}

function getBaseConfigDir(): string {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || app.getPath('userData')
    return path.join(base, 'PlayerDocs')
  }
  // macOS/Linux fall back to per-user data dir
  return path.join(app.getPath('userData'), 'PlayerDocs')
}

export function getConfigPath(): string {
  const dir = getBaseConfigDir()
  return path.join(dir, 'config.json')
}

export async function readConfig(): Promise<AppConfig> {
  const file = getConfigPath()
  try {
    const raw = await fsp.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as AppConfig
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch (e) {
    return { ...DEFAULT_CONFIG }
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const file = getConfigPath()
  const dir = path.dirname(file)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(file, JSON.stringify(config, null, 2), 'utf8')
}

export async function ensureProjectScaffold(projectDir: string): Promise<void> {
  // Create global root folders under the chosen project directory
  // Keep it minimal: games root now; game-specific subfolders will be created later
  await fsp.mkdir(projectDir, { recursive: true })
  await fsp.mkdir(path.join(projectDir, 'games'), { recursive: true })
  await fsp.mkdir(path.join(projectDir, 'backups'), { recursive: true })
  await fsp.mkdir(path.join(projectDir, 'export'), { recursive: true })
}



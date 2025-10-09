import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { readConfig, writeConfig, ensureProjectScaffold } from './config'
import { initGameDatabase } from './db'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
let editorWin: BrowserWindow | null = null
let projectDirCache: string | null = null

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\- ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 64)
}

function generateObjectId(name: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '')
  const short = uuid.slice(0, 8)
  return `${short}_${toSlug(name) || 'root'}`
}

async function createEditorWindow(title: string, routeHash: string) {
  if (editorWin) {
    editorWin.focus()
    return editorWin
  }
  editorWin = new BrowserWindow({
    title,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
    },
  })
  if (VITE_DEV_SERVER_URL) {
    editorWin.loadURL(`${VITE_DEV_SERVER_URL}#${routeHash}`)
  } else {
    editorWin.loadFile(indexHtml, { hash: routeHash })
  }
  editorWin.on('closed', () => {
    editorWin = null
    win?.show()
  })
  return editorWin
}

async function listCampaigns(dbFile: string) {
  const Database = createRequire(process.cwd() + '/package.json')('better-sqlite3') as typeof import('better-sqlite3')
  const db = new Database(dbFile)
  const rows = db.prepare('SELECT id, name FROM games WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
  db.close()
  return rows as Array<{ id: string; name: string }>
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'PlayerDocs',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  update(win)
}

app.whenReady().then(async () => {
  const cfg = await readConfig()
  let projectDir = cfg.projectDir
  projectDirCache = projectDir || null
  if (!projectDir) {
    const res = await dialog.showOpenDialog({
      title: 'Select PlayerDocs project folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!res.canceled && res.filePaths.length) {
      projectDir = res.filePaths[0]
      projectDirCache = projectDir
      await ensureProjectScaffold(projectDir)
      await writeConfig({ projectDir })
    }
  } else {
    await ensureProjectScaffold(projectDir)
  }

  ipcMain.handle('gamedocs:list-campaigns', async () => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { file } = await initGameDatabase(projectDirCache, schemaSql)
    return listCampaigns(file)
  })

  ipcMain.handle('gamedocs:create-campaign', async (_evt, name: string, dbName: 'player_docs.sql3' | 'player_docs.db' = 'player_docs.db') => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const campaignsRoot = path.join(projectDirCache, 'games')
    const safeName = name.replace(/[^a-zA-Z0-9_\- ]+/g, '').trim() || 'NewCampaign'
    const gameDir = path.join(campaignsRoot, safeName)
    await fs.mkdir(path.join(gameDir, 'images'), { recursive: true })
    await fs.mkdir(path.join(gameDir, 'thumbs'), { recursive: true })

    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db, file } = await initGameDatabase(projectDirCache, schemaSql, dbName)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO games (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)').run(id, safeName, now, now)

    // Create root folder object for this campaign
    const rootId = generateObjectId(safeName)
    db.prepare(
      'INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)'
    ).run(rootId, id, safeName, 'Folder', '', now, now)
    db.close()

    // Open editor for the new campaign and hide main
    await createEditorWindow(`PlayerDocs - ${safeName}`, `/editor/${id}`)
    win?.hide()
    return { gameDir, dbFile: file, gameId: id }
  })

  ipcMain.handle('gamedocs:open-campaign', async (_evt, gameId: string) => {
    await createEditorWindow('PlayerDocs - Editor', `/editor/${gameId}`)
    win?.hide()
    return true
  })

  ipcMain.handle('gamedocs:get-campaign', async (_evt, gameId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db, file } = await initGameDatabase(projectDirCache, schemaSql)
    const row = db.prepare('SELECT id, name FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId)
    db.close()
    if (!row) throw new Error('Campaign not found')
    return row as { id: string; name: string }
  })

  ipcMain.handle('gamedocs:get-root', async (_evt, gameId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    let row = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id IS NULL AND deleted_at IS NULL LIMIT 1').get(gameId)
    if (!row) {
      // Backfill: create a root object for existing campaigns created before root insertion logic
      const game = db.prepare('SELECT name FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId) as { name?: string } | undefined
      const now = new Date().toISOString()
      const rootId = generateObjectId(game?.name || 'Root')
      db.prepare(
        'INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)'
      ).run(rootId, gameId, game?.name || 'Root', 'Folder', '', now, now)
      row = { id: rootId, name: game?.name || 'Root', type: 'Folder' }
    }
    db.close()
    return row as { id: string; name: string; type: string }
  })

  ipcMain.handle('gamedocs:list-children', async (_evt, gameId: string, parentId: string | null) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    let rows: any[]
    if (parentId) {
      rows = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE').all(gameId, parentId)
    } else {
      rows = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY name COLLATE NOCASE').all(gameId)
    }
    db.close()
    return rows as Array<{ id: string; name: string; type: string }>
  })

  ipcMain.handle('gamedocs:rename-campaign', async (_evt, gameId: string, newName: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db, file } = await initGameDatabase(projectDirCache, schemaSql)
    const name = (newName || '').replace(/[^a-zA-Z0-9_\- ]+/g, '').trim()
    if (!name) throw new Error('Invalid name')
    const now = new Date().toISOString()
    db.prepare('UPDATE games SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(name, now, gameId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:delete-campaign', async (_evt, gameId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const now = new Date().toISOString()
    db.prepare('UPDATE games SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, gameId)
    db.close()
    return true
  })

  await createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

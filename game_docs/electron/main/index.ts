import { app, BrowserWindow, shell, ipcMain, dialog, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { readConfig, writeConfig, ensureProjectScaffold } from './config'
import { initGameDatabase } from './db'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
// duplicate import removed
import crypto from 'node:crypto'
import sharp from 'sharp'
import { exec } from 'child_process';
import { platform } from 'os';

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
let mapWin: BrowserWindow | null = null
let pendingSelect: { gameId: string; objectId: string } | null = null
let projectDirCache: string | null = null

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\- ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 64)
}

// Settings helpers (reuse DB access without IPC)
async function readSetting<T = any>(key: string): Promise<T | null> {
  if (!projectDirCache) return null
  const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
  const schemaSql = await fs.readFile(schemaPath, 'utf8')
  const { db } = await initGameDatabase(projectDirCache, schemaSql)
  try { ensureMigrations(db) } catch {}
  const row = db.prepare('SELECT setting_value FROM settings WHERE setting_name = ? AND deleted_at IS NULL').get(key) as { setting_value?: string } | undefined
  db.close()
  if (!row?.setting_value) return null
  try { return JSON.parse(row.setting_value) as T } catch { return null }
}

async function writeSetting(key: string, value: any): Promise<boolean> {
  if (!projectDirCache) return false
  const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
  const schemaSql = await fs.readFile(schemaPath, 'utf8')
  const { db } = await initGameDatabase(projectDirCache, schemaSql)
  try { ensureMigrations(db) } catch {}
  const now = new Date().toISOString()
  const text = JSON.stringify(value ?? null)
  const exists = db.prepare('SELECT 1 FROM settings WHERE setting_name = ? AND deleted_at IS NULL').get(key)
  if (exists) {
    db.prepare('UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_name = ? AND deleted_at IS NULL').run(text, now, key)
  } else {
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO settings (id, setting_name, setting_value, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .run(id, key, text, now, now)
  }
  db.close()
  return true
}

function generateObjectId(name: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '')
  const short = uuid.slice(0, 8)
  return `${short}_${toSlug(name) || 'root'}`
}

function generateTagId(): string {
  return 'tag_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

  function getPathString(db: any, gameId: string, startId: string): string {
    const parts: string[] = []
    let cur: { id: string; name: string; parent_id: string | null } | undefined = db.prepare('SELECT id, name, parent_id FROM objects WHERE id = ? AND game_id = ?').get(startId, gameId)
    while (cur) {
      parts.push(escapeHtml(cur.name))
      if (!cur.parent_id) break
      cur = db.prepare('SELECT id, name, parent_id FROM objects WHERE id = ? AND game_id = ?').get(cur.parent_id, gameId)
    }
    let new_paths =  parts.reverse().join("<span class='path-separator'>" + '→' + "</span>")
    //let new_paths =  parts.reverse().join("[" + '→' + "]")
    // console.log('[getPathString] New paths:', new_paths)
    return new_paths
  }

// Ensure runtime migrations for existing databases
async function ensureMigrations(db: any) {
  try {
    const cols = db.prepare('PRAGMA table_info(link_tags)').all() as Array<{ name: string }>
    const hasObjectId = cols.some(c => c.name === 'object_id')
    if (!hasObjectId) {
      db.prepare('ALTER TABLE link_tags ADD COLUMN object_id TEXT').run()
    }
    // Add locked column to objects if missing
    const objCols = db.prepare('PRAGMA table_info(objects)').all() as Array<{ name: string }>
    const hasLocked = objCols.some(c => c.name === 'locked')
    if (!hasLocked) {
      db.prepare('ALTER TABLE objects ADD COLUMN locked INTEGER NOT NULL DEFAULT 0').run()
      // No backfill needed beyond default
    }
    // Backfill owner object for legacy rows where missing
    const legacy = db.prepare('SELECT id FROM link_tags WHERE object_id IS NULL AND deleted_at IS NULL').all() as Array<{ id: string }>
    for (const t of legacy) {
      const owner = db.prepare('SELECT id FROM objects WHERE deleted_at IS NULL AND description LIKE ? LIMIT 1').get('%|' + t.id + ']%') as { id: string } | undefined
      if (owner?.id) {
        db.prepare('UPDATE link_tags SET object_id = ? WHERE id = ?').run(owner.id, t.id)
      }
    }
  } catch {
    // ignore
  }
}

// Cleanup orphaned and floating link data
function cleanupLinkData(db: any) {
  // Remove tag_links pointing to missing tags
  db.prepare('DELETE FROM tag_links WHERE tag_id NOT IN (SELECT id FROM link_tags WHERE deleted_at IS NULL)').run()
  // Remove tag_links pointing to missing objects
  db.prepare('DELETE FROM tag_links WHERE object_id NOT IN (SELECT id FROM objects WHERE deleted_at IS NULL)').run()
  // Remove floating link_tags with no tag_links
  db.prepare('DELETE FROM link_tags WHERE deleted_at IS NULL AND id NOT IN (SELECT DISTINCT tag_id FROM tag_links)').run()
  // Remove link_tags whose owner object no longer references the token in its description
  const tags = db.prepare('SELECT id, object_id FROM link_tags WHERE deleted_at IS NULL').all() as Array<{ id: string; object_id: string | null }>
  for (const t of tags) {
    if (!t.object_id) continue
    const obj = db.prepare('SELECT description FROM objects WHERE id = ? AND deleted_at IS NULL').get(t.object_id) as { description?: string } | undefined
    const text = (obj?.description || '') as string
    if (!text.includes(`|${t.id}]`)) {
      db.prepare('DELETE FROM tag_links WHERE tag_id = ?').run(t.id)
      db.prepare('DELETE FROM link_tags WHERE id = ?').run(t.id)
    }
  }
}

function extractTagIdsFromText(text: string): Set<string> {
  const set = new Set<string>()
  const re = /\[\[[^\]|]+\|([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    set.add(String(m[1]))
  }
  return set
}

function cleanupTagsForObject(db: any, objectId: string) {
  const row = db.prepare('SELECT description FROM objects WHERE id = ? AND deleted_at IS NULL').get(objectId) as { description?: string } | undefined
  const text = (row?.description || '') as string
  const present = extractTagIdsFromText(text)
  const tags = db.prepare('SELECT id FROM link_tags WHERE object_id = ? AND deleted_at IS NULL').all(objectId) as Array<{ id: string }>
  for (const t of tags) {
    if (!present.has(t.id)) {
      db.prepare('DELETE FROM tag_links WHERE tag_id = ?').run(t.id)
      db.prepare('DELETE FROM link_tags WHERE id = ?').run(t.id)
    }
  }
  }

async function createEditorWindow(title: string, routeHash: string) {
  if (editorWin) {
    editorWin.focus()
    return editorWin
  }
  // Restore previous window bounds and state
  const saved = await readSetting<any>('ui.editorWindow').catch(() => null)
  const baseOptions: Electron.BrowserWindowConstructorOptions = {
    title,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: { preload },
  }
  if (saved && saved.bounds && typeof saved.bounds.width === 'number' && typeof saved.bounds.height === 'number') {
    baseOptions.width = Math.max(400, saved.bounds.width)
    baseOptions.height = Math.max(300, saved.bounds.height)
    if (typeof saved.bounds.x === 'number' && typeof saved.bounds.y === 'number') {
      baseOptions.x = saved.bounds.x
      baseOptions.y = saved.bounds.y
    }
  }
  editorWin = new BrowserWindow(baseOptions)
  // Apply saved state (maximized/fullscreen) after creation
  if (saved) {
    if (saved.isFullScreen) {
      editorWin.setFullScreen(true)
    } else if (saved.isMaximized) {
      editorWin.maximize()
    }
  }
  if (VITE_DEV_SERVER_URL) {
    editorWin.loadURL(`${VITE_DEV_SERVER_URL}#${routeHash}`)
  } else {
    editorWin.loadFile(indexHtml, { hash: routeHash })
  }
  editorWin.on('closed', () => {
    editorWin = null
    win?.show()
    // If map window is open, close it when editor closes
    if (mapWin && !mapWin.isDestroyed()) {
      try { mapWin.close() } catch {}
      mapWin = null
    }
  })
  // Persist state on changes
  const saveBounds = async () => {
    if (!editorWin) return
    const isMaximized = editorWin.isMaximized()
    const isFullScreen = editorWin.isFullScreen()
    const bounds = isMaximized || isFullScreen ? editorWin.getNormalBounds() : editorWin.getBounds()
    await writeSetting('ui.editorWindow', { bounds, isMaximized, isFullScreen })
  }
  editorWin.on('resize', () => { saveBounds() })
  editorWin.on('move', () => { saveBounds() })
  editorWin.on('maximize', () => { saveBounds() })
  editorWin.on('unmaximize', () => { saveBounds() })
  editorWin.on('enter-full-screen', () => { saveBounds() })
  editorWin.on('leave-full-screen', () => { saveBounds() })
  editorWin.on('close', () => { saveBounds() })
  return editorWin
}

async function listCampaigns(dbFile: string) {
  const Database = createRequire(process.cwd() + '/package.json')('better-sqlite3') as typeof import('better-sqlite3')
  const db = new Database(dbFile)
  const rows = db.prepare('SELECT id, name FROM games WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
  db.close()
  return rows as Array<{ id: string; name: string }>
}

async function generateThumbnailWithBrowser(buffer: Buffer, mime: string): Promise<Buffer | null> {
  try {
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
    const viewer = new BrowserWindow({
      width: 300,
      height: 300,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { sandbox: false, contextIsolation: true }
    })
    const html = `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:300px;height:300px;background:transparent;display:flex;align-items:center;justify-content:center}
      img{max-width:300px;max-height:300px;object-fit:contain}
    </style><img src="${dataUrl}" />`
    await viewer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // small delay to ensure image decode
    await new Promise(r => setTimeout(r, 80))
    const img = await viewer.webContents.capturePage()
    const out = img.toPNG()
    viewer.destroy()
    if (out && out.length > 0) return out
    return null
  } catch {
    return null
  }
}

async function transcodeToPngDataUrl(buffer: Buffer, mime: string): Promise<string | null> {
  try {
    const img = nativeImage.createFromBuffer(buffer)
    const out = img.toPNG()
    if (out && out.length > 0) return `data:image/png;base64,${out.toString('base64')}`
  } catch {}
  try {
    const thumb = await generateThumbnailWithBrowser(buffer, mime)
    if (thumb && thumb.length > 0) return `data:image/png;base64,${thumb.toString('base64')}`
  } catch {}
  return null
}

function tryTranscodeBufferToPNG(buffer: Buffer): Buffer | null {
  try {
    const img = nativeImage.createFromBuffer(buffer)
    const out = img.toPNG()
    console.log('[tryTranscodeBufferToPNG] Out:', out.length)
    console.log('[tryTranscodeBufferToPNG] Out:', out.toString('base64'))
    if (out && out.length > 0) return out
  } catch { 
    console.log('[tryTranscodeBufferToPNG] Error')
  }
  return null
}

async function createWindow() {
  // Restore main window state
  const savedMain = await readSetting<any>('ui.mainWindow').catch(() => null)
  const mainOpts: Electron.BrowserWindowConstructorOptions = {
    title: 'PlayerDocs',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: { preload },
  }
  if (savedMain && savedMain.bounds && typeof savedMain.bounds.width === 'number' && typeof savedMain.bounds.height === 'number') {
    mainOpts.width = Math.max(600, savedMain.bounds.width)
    mainOpts.height = Math.max(400, savedMain.bounds.height)
    if (typeof savedMain.bounds.x === 'number' && typeof savedMain.bounds.y === 'number') {
      mainOpts.x = savedMain.bounds.x
      mainOpts.y = savedMain.bounds.y
    }
  }
  win = new BrowserWindow(mainOpts)
  if (savedMain) {
    if (savedMain.isFullScreen) win.setFullScreen(true)
    else if (savedMain.isMaximized) win.maximize()
  }

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

  // Persist main window state
  const saveMain = async () => {
    if (!win) return
    const isMaximized = win.isMaximized()
    const isFullScreen = win.isFullScreen()
    const bounds = isMaximized || isFullScreen ? win.getNormalBounds() : win.getBounds()
    await writeSetting('ui.mainWindow', { bounds, isMaximized, isFullScreen })
  }
  win.on('resize', () => { saveMain() })
  win.on('move', () => { saveMain() })
  win.on('maximize', () => { saveMain() })
  win.on('unmaximize', () => { saveMain() })
  win.on('enter-full-screen', () => { saveMain() })
  win.on('leave-full-screen', () => { saveMain() })
  win.on('close', () => { saveMain() })
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
    const { file, db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db); cleanupLinkData(db) } catch {}
    db.close()
    return listCampaigns(file)
  })

  ipcMain.handle('gamedocs:open-map', async (_evt, gameId: string) => {
    const saved = await readSetting<any>('ui.mapWindow').catch(() => null)
    const opts: Electron.BrowserWindowConstructorOptions = {
      title: 'Places Map',
      icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
      webPreferences: { preload },
      width: 1000,
      height: 700,
    }
    if (saved && saved.bounds) {
      opts.width = Math.max(600, saved.bounds.width)
      opts.height = Math.max(400, saved.bounds.height)
      if (typeof saved.bounds.x === 'number' && typeof saved.bounds.y === 'number') {
        opts.x = saved.bounds.x
        opts.y = saved.bounds.y
      }
    }
    if (mapWin && !mapWin.isDestroyed()) {
      mapWin.focus()
      if (VITE_DEV_SERVER_URL) mapWin.loadURL(`${VITE_DEV_SERVER_URL}#/map?gameId=${encodeURIComponent(gameId)}`)
      else mapWin.loadFile(indexHtml, { hash: `/map?gameId=${encodeURIComponent(gameId)}` })
      return true
    }
    mapWin = new BrowserWindow(opts)
    if (saved) {
      if (saved.isFullScreen) mapWin.setFullScreen(true)
      else if (saved.isMaximized) mapWin.maximize()
    }
    if (VITE_DEV_SERVER_URL) mapWin.loadURL(`${VITE_DEV_SERVER_URL}#/map?gameId=${encodeURIComponent(gameId)}`)
    else mapWin.loadFile(indexHtml, { hash: `/map?gameId=${encodeURIComponent(gameId)}` })
    const save = async () => {
      if (!mapWin) return
      const isMaximized = mapWin.isMaximized()
      const isFullScreen = mapWin.isFullScreen()
      const bounds = isMaximized || isFullScreen ? mapWin.getNormalBounds() : mapWin.getBounds()
      await writeSetting('ui.mapWindow', { bounds, isMaximized, isFullScreen })
    }
    mapWin.on('resize', () => { save() })
    mapWin.on('move', () => { save() })
    mapWin.on('maximize', () => { save() })
    mapWin.on('unmaximize', () => { save() })
    mapWin.on('enter-full-screen', () => { save() })
    mapWin.on('leave-full-screen', () => { save() })
    mapWin.on('close', () => { save() })
    return true
  })

  ipcMain.handle('gamedocs:focus-editor-select', async (_evt, gameId: string, objectId: string) => {
    // Ensure editor window exists and is routed to this game, then send select message when ready
    const routeHash = `/editor/${encodeURIComponent(gameId)}`
    pendingSelect = { gameId, objectId }
    if (!editorWin || editorWin.isDestroyed()) {
      await createEditorWindow('Editor', routeHash)
      // Selection will be sent upon editor-ready
      return true
    }
    // If already open, navigate to the correct game and then send
    if (VITE_DEV_SERVER_URL) editorWin.loadURL(`${VITE_DEV_SERVER_URL}#${routeHash}`)
    else editorWin.loadFile(indexHtml, { hash: routeHash })
    editorWin.focus()
    return true
  })

  ipcMain.on('gamedocs:editor-ready', (_evt, gameId: string) => {
    if (!editorWin || editorWin.isDestroyed()) return
    if (pendingSelect && pendingSelect.gameId === gameId) {
      const toSend = pendingSelect.objectId
      pendingSelect = null
      editorWin.webContents.send('gamedocs:select-object', toSend)
    }
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
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO games (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)').run(id, safeName, now, now)

    // Create root object for this campaign
    const rootId = generateObjectId(safeName)
    db.prepare(
      'INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)'
    ).run(rootId, id, safeName, 'Other', '', now, now)
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
    try { ensureMigrations(db); cleanupLinkData(db) } catch {}
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
    try { ensureMigrations(db); cleanupLinkData(db) } catch {}
    let row = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id IS NULL AND deleted_at IS NULL LIMIT 1').get(gameId)
    if (!row) {
      // Backfill: create a root object for existing campaigns created before root insertion logic
      const game = db.prepare('SELECT name FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId) as { name?: string } | undefined
      const now = new Date().toISOString()
      const rootId = generateObjectId(game?.name || 'Root')
      db.prepare(
        'INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)'
      ).run(rootId, gameId, game?.name || 'Root', 'Other', '', now, now)
      row = { id: rootId, name: game?.name || 'Root', type: 'Other' }
    }
    db.close()
    return row as { id: string; name: string; type: string }
  })

  ipcMain.handle('gamedocs:list-children', async (_evt, gameId: string, parentId: string | null) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db); cleanupLinkData(db) } catch {}
    let rows: any[]
    if (parentId) {
      rows = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE').all(gameId, parentId)
    } else {
      rows = db.prepare('SELECT id, name, type FROM objects WHERE game_id = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY name COLLATE NOCASE').all(gameId)
    }
    db.close()
    return rows as Array<{ id: string; name: string; type: string }>
  })

  ipcMain.handle('gamedocs:create-object-and-link-tag', async (_evt, gameId: string, parentId: string | null, ownerObjectId: string, name: string, type: string | null) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}

    const now = new Date().toISOString()
    const objectId = generateObjectId(name)
    db.prepare(
      'INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
    ).run(objectId, gameId, name, type || null, parentId, '', now, now)

    const tagId = generateTagId()
    db.prepare('INSERT INTO link_tags (id, game_id, object_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .run(tagId, gameId, ownerObjectId, now, now)
    db.prepare('INSERT INTO tag_links (tag_id, object_id, created_at, deleted_at) VALUES (?, ?, ?, NULL)')
      .run(tagId, objectId, now)

    db.close()
    return { objectId, tagId }
  })

  ipcMain.handle('gamedocs:create-category', async (_evt, gameId: string, parentId: string, name: string, objType: string | null = null) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    const exists = db.prepare('SELECT 1 FROM objects WHERE game_id = ? AND parent_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1').get(gameId, parentId, name)
    if (exists) { db.close(); throw new Error('A category with this name already exists here.') }
    const newId = generateObjectId(name)
    const allowed = new Set(['Place', 'Person', 'Lore', 'Other'])
    const t = (objType || 'Other')
    const safeType = allowed.has(t) ? t : 'Other'
    db.prepare('INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
      .run(newId, gameId, name, safeType, parentId, '', now, now)
    db.close()
    return { id: newId, name }
  })

  ipcMain.handle('gamedocs:list-objects-for-fuzzy', async (_evt, gameId: string, limit = 2000) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const rows = db.prepare('SELECT id, name, parent_id FROM objects WHERE game_id = ? AND deleted_at IS NULL LIMIT ?').all(gameId, limit)
    db.close()
    return rows as Array<{ id: string; name: string; parent_id: string | null }>
  })

  ipcMain.handle('gamedocs:get-objects-by-name-with-paths', async (_evt, gameId: string, name: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const rows = db.prepare('SELECT id, name FROM objects WHERE game_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?)').all(gameId, name)
    const withPaths = rows.map((r: any) => ({ id: r.id, name: r.name, path: getPathString(db, gameId, r.id) }))
    db.close()
    return withPaths as Array<{ id: string; name: string; path: string }>
  })

  // Settings: get/set key-value JSON
  ipcMain.handle('gamedocs:get-setting', async (_evt, key: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const row = db.prepare('SELECT setting_value FROM settings WHERE setting_name = ? AND deleted_at IS NULL').get(key) as { setting_value?: string } | undefined
    db.close()
    if (!row?.setting_value) return null
    try { return JSON.parse(row.setting_value) } catch { return null }
  })

  ipcMain.handle('gamedocs:set-setting', async (_evt, key: string, value: any) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    const text = JSON.stringify(value ?? null)
    const exists = db.prepare('SELECT 1 FROM settings WHERE setting_name = ? AND deleted_at IS NULL').get(key)
    if (exists) {
      db.prepare('UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_name = ? AND deleted_at IS NULL').run(text, now, key)
    } else {
      const id = crypto.randomUUID()
      db.prepare('INSERT INTO settings (id, setting_name, setting_value, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)')
        .run(id, key, text, now, now)
    }
    db.close()
    return true
  })

  // Quick search across objects by name and description, and link_tags by id
  ipcMain.handle('gamedocs:quick-search', async (_evt, gameId: string, query: string, limit = 20) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const q = (query || '').trim()
    if (!q) { db.close(); return { objects: [], tags: [] } }
    const like = `%${q.replace(/%/g, '')}%`
    const objects = db.prepare('SELECT id, name FROM objects WHERE game_id = ? AND deleted_at IS NULL AND (name LIKE ? OR description LIKE ?) ORDER BY name COLLATE NOCASE LIMIT ?').all(gameId, like, like, limit)
    const tags = db.prepare('SELECT id, object_id FROM link_tags WHERE deleted_at IS NULL AND id LIKE ? LIMIT ?').all(like, limit)
    db.close()
    return { objects, tags }
  })

  // Choose image file from disk
  ipcMain.handle('gamedocs:choose-image', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] })
    if (res.canceled || res.filePaths.length === 0) return { path: null }
    return { path: res.filePaths[0] }
  })

  // Choose a font file (TTF/OTF/WOFF) - placeholder for future custom font loading
  ipcMain.handle('gamedocs:choose-font-file', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose font', properties: ['openFile'], filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] })
    if (res.canceled || res.filePaths.length === 0) return { path: null }
    return { path: res.filePaths[0] }
  })

  ipcMain.handle('gamedocs:read-font-as-dataurl', async (_evt, fontPath: string) => {
    try {
      const buf = await fs.readFile(fontPath)
      const ext = (path.extname(fontPath) || '').toLowerCase()
      const mime = ext === '.ttf' ? 'font/ttf' : ext === '.otf' ? 'font/otf' : ext === '.woff' ? 'font/woff' : ext === '.woff2' ? 'font/woff2' : 'application/octet-stream'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      const base = path.basename(fontPath).replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '')
      return { dataUrl, suggestedFamily: base, mime }
    } catch (e) {
      return { dataUrl: null, suggestedFamily: null, mime: null }
    }
  })

  ipcMain.handle('gamedocs:get-file-dataurl', async (_evt, filePath: string) => {
    try {
      const buf = await fs.readFile(filePath)
      const ext = (path.extname(filePath) || '').toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'application/octet-stream'
      return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    } catch (e) {
      return { ok: false, dataUrl: null }
    }
  })

  // Open image externally (default browser) or in a simple viewer window
  ipcMain.handle('gamedocs:open-image-external', async (_evt, filePath: string) => {
    try {
      const url = pathToFileURL(filePath).href
      //await shell.openExternal(url)
      
      if (platform() === 'win32') {
        await exec(`start Firefox "${url}"`)
      } else {
        await exec(`open "${url}"`)
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gamedocs:open-image-window', async (_evt, filePath: string) => {
    // Read file and embed via minimal HTML (data:text/html) to ensure rendering in window
    try {
      const buf = await fs.readFile(filePath)
      const ext = (path.extname(filePath) || '.png').toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
      const imgDataUrl = `data:${mime};base64,${buf.toString('base64')}`
      const viewer = new BrowserWindow({
        title: 'Image',
        width: 900,
        height: 700,
        backgroundColor: '#111111',
        webPreferences: { sandbox: false, contextIsolation: true }
      })
      const html = `<!doctype html><meta charset="utf-8"><title>Image</title><style>html,body{margin:0;height:100%;background:#111;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}</style><img src="${imgDataUrl}" alt="image">`
      await viewer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      return true
    } catch {
      return false
    }
  })

  // List images for an object
  ipcMain.handle('gamedocs:list-images', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const rows = db.prepare('SELECT id, object_id, file_path, thumb_path, name, is_default FROM images WHERE object_id = ? AND deleted_at IS NULL ORDER BY created_at ASC').all(objectId) as Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number }>
    const withUrls = await Promise.all(rows.map(async (r) => {
      let thumb_data_url: string | null = null
      try {
        const buf = await fs.readFile(r.thumb_path)
        const ext = (path.extname(r.thumb_path) || '.png').toLowerCase()
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
        if (buf && buf.length > 0) thumb_data_url = `data:${mime};base64,${buf.toString('base64')}`
      } catch {}
      if (!thumb_data_url) {
        try {
          const buf = await fs.readFile(r.file_path)
          const ext = (path.extname(r.file_path) || '.png').toLowerCase()
          const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
          if (buf && buf.length > 0) thumb_data_url = `data:${mime};base64,${buf.toString('base64')}`
        } catch {}
      }
      return { ...r, file_url: null, thumb_url: null, thumb_data_url }
    }))
    db.close()
    return withUrls
  })

  // Add image to object, copy file or download URL, create thumb, set default if requested
  ipcMain.handle('gamedocs:add-image', async (_evt, objectId: string, opts: { name?: string | null; source: { type: 'file' | 'url'; value: string }; isDefault?: boolean }) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const obj = db.prepare('SELECT id, game_id FROM objects WHERE id = ? AND deleted_at IS NULL').get(objectId) as { id: string; game_id: string } | undefined
    if (!obj) { db.close(); throw new Error('Object not found') }
    const gameId = obj.game_id
    const game = db.prepare('SELECT name FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId) as { name?: string } | undefined
    const campaignFolder = game?.name || 'UnknownCampaign'
    const now = new Date().toISOString()
    const baseDir = path.join(projectDirCache!, 'games', campaignFolder)
    const imagesDir = path.join(baseDir, 'images')
    const thumbsDir = path.join(baseDir, 'thumbs')
    await fs.mkdir(imagesDir, { recursive: true })
    await fs.mkdir(thumbsDir, { recursive: true })

    // Resolve source to buffer and extension
    let buffer: Buffer
    let ext = ''
    if (opts.source.type === 'file') {
      const srcPath = opts.source.value
      buffer = await (await import('node:fs/promises')).readFile(srcPath)
      const guess = path.extname(srcPath).toLowerCase()
      ext = guess && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(guess) ? guess : '.png'
    } else {
      const urlStr = opts.source.value
      const res = await fetch(urlStr)
      if (!res.ok) { db.close(); throw new Error('Failed to download image') }
      const ab = await res.arrayBuffer()
      buffer = Buffer.from(ab)
      const urlExt = path.extname(new URL(urlStr).pathname).toLowerCase()
      ext = urlExt && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(urlExt) ? urlExt : '.png'
    }

    console.log('[gamedocs:add-image] Source:', opts.source.type, opts.source.value, 'Ext:', ext)

    // If source is webp, transcode buffer to PNG with sharp for downstream processing
    if (ext === '.webp') {
      try {
        buffer = await sharp(buffer).rotate().png({ compressionLevel: 6 }).toBuffer()
        ext = '.png'
      } catch {
        const dataUrl = await transcodeToPngDataUrl(buffer, 'image/webp')
        if (dataUrl) {
          const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
          buffer = Buffer.from(b64, 'base64')
          ext = '.png'
        }
      }
    }

    // Write original
    const uuid = crypto.randomUUID().replace(/-/g, '')
    const fileName = uuid + ext
    const filePath = path.join(imagesDir, fileName)
    await fs.writeFile(filePath, buffer)

    // Create thumb (max 300x300) using sharp; ensure non-empty buffer
    let thumbBuffer: Buffer | null = null
    let thumbExt = '.png'
    try {
      thumbBuffer = await sharp(buffer)
        .rotate()
        .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer()
    } catch {}
    if (!thumbBuffer || thumbBuffer.length === 0) {
      try {
        const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
        const browserThumb = await generateThumbnailWithBrowser(buffer, mime)
        if (browserThumb && browserThumb.length > 0) {
          thumbBuffer = browserThumb
          thumbExt = '.png'
        }
      } catch {}
    }
    if (!thumbBuffer || thumbBuffer.length === 0) {
      // Final fallback: 1x1 transparent PNG placeholder (never copy full-size)
      const oneByOne = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2nH3EAAAAASUVORK5CYII='
      thumbBuffer = Buffer.from(oneByOne, 'base64')
      thumbExt = '.png'
    }
    const thumbName = uuid + thumbExt
    const thumbPath = path.join(thumbsDir, thumbName)
    await fs.writeFile(thumbPath, thumbBuffer)

    // Determine default flag
    const existing = db.prepare('SELECT COUNT(1) as c FROM images WHERE object_id = ? AND deleted_at IS NULL').get(objectId) as { c: number }
    const shouldDefault = existing.c === 0 ? 1 : (opts.isDefault ? 1 : 0)
    if (shouldDefault === 1) {
      db.prepare('UPDATE images SET is_default = 0 WHERE object_id = ? AND deleted_at IS NULL').run(objectId)
    }

    const imageId = crypto.randomUUID().replace(/-/g, '')
    db.prepare('INSERT INTO images (id, object_id, file_path, thumb_path, name, is_default, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
      .run(imageId, objectId, filePath, thumbPath, (opts.name || null), shouldDefault, now, now)

    const row = db.prepare('SELECT id, object_id, file_path, thumb_path, name, is_default FROM images WHERE id = ?').get(imageId) as any
    try {
      const buf = await fs.readFile(row.thumb_path)
      const ext = (path.extname(row.thumb_path) || '.png').toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
      row.thumb_data_url = `data:${mime};base64,${buf.toString('base64')}`
      row.file_url = pathToFileURL(row.file_path).href
      row.thumb_url = pathToFileURL(row.thumb_path).href
    } catch {}
    db.close()
    return row
  })

  ipcMain.handle('gamedocs:list-link-targets', async (_evt, tagId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const links = db.prepare('SELECT o.id, o.name, o.game_id FROM tag_links tl JOIN objects o ON o.id = tl.object_id WHERE tl.tag_id = ? AND o.deleted_at IS NULL').all(tagId)
    const withPaths = links.map((r: any) => ({ id: r.id, name: r.name, path: getPathString(db, r.game_id, r.id) }))
    db.close()
    return withPaths as Array<{ id: string; name: string; path: string }>
  })

  // List link tags owned by an object
  ipcMain.handle('gamedocs:list-owner-tags', async (_evt, ownerObjectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const tags = db.prepare('SELECT id FROM link_tags WHERE object_id = ? AND deleted_at IS NULL').all(ownerObjectId)
    db.close()
    return tags as Array<{ id: string }>
  })

  // List incoming links pointing to this object
  ipcMain.handle('gamedocs:list-incoming-links', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const rows = db.prepare('SELECT lt.id as tag_id, lt.object_id as owner_id, o2.name as owner_name, o2.game_id as game_id FROM tag_links tl JOIN link_tags lt ON lt.id = tl.tag_id JOIN objects o2 ON o2.id = lt.object_id WHERE tl.object_id = ? AND lt.deleted_at IS NULL AND o2.deleted_at IS NULL').all(objectId) as Array<{ tag_id: string; owner_id: string; owner_name: string; game_id: string }>
    const withPaths = rows.map(r => ({ tag_id: r.tag_id, owner_id: r.owner_id, owner_name: r.owner_name, owner_path: getPathString(db, r.game_id, r.owner_id) }))
    db.close()
    return withPaths as Array<{ tag_id: string; owner_id: string; owner_name: string; owner_path: string }>
  })

  ipcMain.handle('gamedocs:remove-link-target', async (_evt, tagId: string, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    db.prepare('DELETE FROM tag_links WHERE tag_id = ? AND object_id = ?').run(tagId, objectId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:delete-link-tag', async (_evt, tagId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    db.prepare('DELETE FROM tag_links WHERE tag_id = ?').run(tagId)
    db.prepare('DELETE FROM link_tags WHERE id = ?').run(tagId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:rename-object', async (_evt, objectId: string, newName: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const name = (newName || '').trim()
    if (!name) { db.close(); throw new Error('Invalid name') }
    const now = new Date().toISOString()
    db.prepare('UPDATE objects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(name, now, objectId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:update-object-type', async (_evt, objectId: string, newType: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const t = (newType || 'Other').trim()
    const allowed = new Set(['Place', 'Person', 'Lore', 'Other'])
    if (!allowed.has(t)) { db.close(); throw new Error('Invalid type') }
    const now = new Date().toISOString()
    db.prepare('UPDATE objects SET type = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(t, now, objectId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:set-default-image', async (_evt, objectId: string, imageId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    db.prepare('UPDATE images SET is_default = 0 WHERE object_id = ? AND deleted_at IS NULL').run(objectId)
    db.prepare('UPDATE images SET is_default = 1 WHERE id = ? AND object_id = ? AND deleted_at IS NULL').run(imageId, objectId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:rename-image', async (_evt, imageId: string, newName: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    db.prepare('UPDATE images SET name = ? WHERE id = ? AND deleted_at IS NULL').run((newName || '').trim() || null, imageId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:delete-image', async (_evt, imageId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const row = db.prepare('SELECT object_id, file_path, thumb_path FROM images WHERE id = ?').get(imageId) as { object_id: string; file_path: string; thumb_path: string } | undefined
    db.prepare('DELETE FROM images WHERE id = ?').run(imageId)
    db.close()
    try { if (row?.file_path) await fs.unlink(row.file_path).catch(() => {}) } catch {}
    try { if (row?.thumb_path) await fs.unlink(row.thumb_path).catch(() => {}) } catch {}
    return true
  })

  ipcMain.handle('gamedocs:create-link-tag', async (_evt, gameId: string, ownerObjectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    const tagId = generateTagId()
    // Owner object provided from renderer
    db.prepare('INSERT INTO link_tags (id, game_id, object_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)').run(tagId, gameId, ownerObjectId, now, now)
    db.close()
    return { tagId }
  })

  ipcMain.handle('gamedocs:add-link-target', async (_evt, tagId: string, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO tag_links (tag_id, object_id, created_at, deleted_at) VALUES (?, ?, ?, NULL)').run(tagId, objectId, now)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:object-has-content', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const row = db.prepare(`
      SELECT
        CASE WHEN COALESCE(TRIM(description),'') <> '' THEN 1
             WHEN EXISTS(SELECT 1 FROM images WHERE object_id = objects.id AND deleted_at IS NULL) THEN 1
             ELSE 0 END AS has
      FROM objects WHERE id = ? AND deleted_at IS NULL
    `).get(objectId) as { has?: number } | undefined
    db.close()
    return !!(row && row.has)
  })

  ipcMain.handle('gamedocs:get-or-create-tag-for-target', async (_evt, gameId: string, ownerObjectId: string, targetObjectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    const existing = db.prepare(`
      SELECT lt.id AS id
      FROM link_tags lt
      JOIN tag_links tl ON tl.tag_id = lt.id AND tl.deleted_at IS NULL
      WHERE lt.game_id = ? AND lt.object_id = ? AND tl.object_id = ? AND lt.deleted_at IS NULL
      LIMIT 1
    `).get(gameId, ownerObjectId, targetObjectId) as { id?: string } | undefined
    if (existing?.id) { db.close(); return { tagId: existing.id } }
    const tagId = generateTagId()
    db.prepare('INSERT INTO link_tags (id, game_id, object_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)').run(tagId, gameId, ownerObjectId, now, now)
    db.prepare('INSERT INTO tag_links (tag_id, object_id, created_at, deleted_at) VALUES (?, ?, ?, NULL)').run(tagId, targetObjectId, now)
    db.close()
    return { tagId }
  })

  ipcMain.handle('gamedocs:get-object', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const row = db.prepare('SELECT id, game_id, name, type, parent_id, description, locked FROM objects WHERE id = ? AND deleted_at IS NULL').get(objectId)
    db.close()
    if (!row) throw new Error('Object not found')
    return row as { id: string; game_id: string; name: string; type: string; parent_id: string | null; description: string | null; locked: number }
  })

  ipcMain.handle('gamedocs:set-object-locked', async (_evt, objectId: string, locked: boolean) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    db.prepare('UPDATE objects SET locked = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(locked ? 1 : 0, now, objectId)
    db.close()
    return true
  })

  ipcMain.handle('gamedocs:has-places', async (_evt, gameId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const row = db.prepare('SELECT 1 AS has FROM objects WHERE game_id = ? AND type = ? AND deleted_at IS NULL LIMIT 1').get(gameId, 'Place') as any
    db.close()
    return !!row
  })

  ipcMain.handle('gamedocs:get-place-graph', async (_evt, gameId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}

    const rows = db.prepare('SELECT id, name, type, parent_id FROM objects WHERE game_id = ? AND deleted_at IS NULL').all(gameId) as Array<{ id: string; name: string; type: string; parent_id: string | null }>
    const idToNode = new Map<string, { id: string; name: string; type: string; parent_id: string | null; children: string[] }>()
    for (const r of rows) idToNode.set(r.id, { ...r, children: [] })
    for (const r of rows) if (r.parent_id && idToNode.has(r.parent_id)) idToNode.get(r.parent_id)!.children.push(r.id)

    // Count descendants among Place-only nodes
    const isPlace = (n: { type: string }) => n.type === 'Place'
    function placeDescCount(id: string): number {
      const n = idToNode.get(id)!; let count = 0
      for (const cid of n.children) {
        const c = idToNode.get(cid)!; if (isPlace(c)) count += 1
        count += placeDescCount(cid)
      }
      return count
    }

    // Build nodes (only Place)
    const placeIds = rows.filter(r => r.type === 'Place').map(r => r.id)
    const nodes = placeIds.map(pid => {
      const n = idToNode.get(pid)!
      // depth among places: walk up until null, counting only transitions to nearest Place parent
      let depth = 0
      let cur = n.parent_id ? idToNode.get(n.parent_id) || null : null
      while (cur) {
        if (cur.type === 'Place') depth += 1
        cur = cur.parent_id ? (idToNode.get(cur.parent_id) || null) : null
      }
      const size = 1 + placeDescCount(pid)
      return { id: n.id, name: n.name, depth, size }
    })

    // Build edges between each Place and its nearest Place ancestor
    const edges: Array<{ from: string; to: string; dashed: boolean }> = []
    for (const pid of placeIds) {
      const n = idToNode.get(pid)!
      let curId = n.parent_id
      let dashed = false
      let to: string | null = null
      while (curId) {
        const p = idToNode.get(curId)
        if (!p) break
        if (p.type === 'Place') { to = p.id; break }
        dashed = true
        curId = p.parent_id
      }
      if (to) edges.push({ from: n.id, to, dashed })
    }

    db.close()
    return { nodes, edges }
  })

  // Delete an object and cascade: children, tag_links, orphan link_tags
  ipcMain.handle('gamedocs:delete-object-cascade', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const now = new Date().toISOString()
    // Collect all descendant object ids (simple iterative approach)
    const toDelete: string[] = []
    const queue: string[] = [objectId]
    while (queue.length) {
      const cur = queue.shift()!
      toDelete.push(cur)
      const rows = db.prepare('SELECT id FROM objects WHERE parent_id = ? AND deleted_at IS NULL').all(cur) as Array<{ id: string }>
      for (const r of rows) queue.push(r.id)
    }
    // Soft delete objects
    const stmtDelObj = db.prepare('UPDATE objects SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    for (const id of toDelete) stmtDelObj.run(now, id)
    // Remove tag_links to these objects
    const stmtDelLinks = db.prepare('DELETE FROM tag_links WHERE object_id = ?')
    for (const id of toDelete) stmtDelLinks.run(id)
    // Remove floating link_tags
    cleanupLinkData(db)
    db.close()
    return { count: toDelete.length }
  })

  // Lightweight preview payload for hover/tooltips
  ipcMain.handle('gamedocs:get-object-preview', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const obj = db.prepare('SELECT id, game_id, name, description FROM objects WHERE id = ? AND deleted_at IS NULL').get(objectId) as { id: string; game_id: string; name: string; description: string | null } | undefined
    if (!obj) { db.close(); throw new Error('Object not found') }
    // Prefer default image; if none, take the first available image
    const img = db.prepare('SELECT thumb_path, file_path FROM images WHERE object_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, created_at ASC LIMIT 1').get(objectId) as { thumb_path?: string; file_path?: string } | undefined
    db.close()
    const raw = obj.description || ''
    // Preserve tag labels in snippet: [[Label|tag_xxx]] -> Label
    const withLabels = raw
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
    const snippet = withLabels.slice(0, 240)
    const thumbPath = img?.thumb_path || null
    const imagePath = img?.file_path || null
    let fileUrl: string | null = null
    let thumbDataUrl: string | null = null
    try {
      if (thumbPath) {
        const buf = await fs.readFile(thumbPath)
        const ext = (path.extname(thumbPath) || '.png').toLowerCase()
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
        thumbDataUrl = await transcodeToPngDataUrl(buf, mime) || `data:${mime};base64,${buf.toString('base64')}`
      } else if (imagePath) {
        const buf = await fs.readFile(imagePath)
        const ext = (path.extname(imagePath) || '.png').toLowerCase()
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
        thumbDataUrl = await transcodeToPngDataUrl(buf, mime) || `data:${mime};base64,${buf.toString('base64')}`
      }
    } catch {}
    // fileUrl retained for legacy fallback; computed from thumbPath if present
    try { if (thumbPath) fileUrl = pathToFileURL(thumbPath).href } catch {}
    return { id: obj.id, name: obj.name, snippet, thumbPath, imagePath, fileUrl, thumbDataUrl }
  })

  ipcMain.handle('gamedocs:update-object-description', async (_evt, objectId: string, description: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const now = new Date().toISOString()
    db.prepare('UPDATE objects SET description = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(description ?? '', now, objectId)
    try {
      ensureMigrations(db)
      cleanupTagsForObject(db, objectId)
      cleanupLinkData(db)
    } catch {}
    db.close()
    return true
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

  // Import from share zip: unzip -> parse manifest -> delete existing game -> remap ids -> insert -> copy images -> regenerate thumbs
  ipcMain.handle('gamedocs:import-from-share', async () => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const pick = await dialog.showOpenDialog({ title: 'Import PlayerDocs Share', properties: ['openFile'], filters: [{ name: 'PlayerDocs Share (zip)', extensions: ['pdshare.zip','zip'] }] })
    if (pick.canceled || pick.filePaths.length === 0) return { ok: false }
    const zipPath = pick.filePaths[0]
    // Extract to temp dir
    const osTmp = await import('node:os')
    const tmpDir = await fs.mkdtemp(path.join(osTmp.tmpdir(), 'pdshare-'))
    const unzipper = await import('yauzl')
    await new Promise<void>((resolve, reject) => {
      unzipper.open(zipPath, { lazyEntries: true }, (err: any, zip: any) => {
        if (err || !zip) return reject(err)
        zip.readEntry()
        zip.on('entry', (entry: any) => {
          const dest = path.join(tmpDir, entry.fileName)
          if (/\/$/.test(entry.fileName)) {
            fssync.mkdirSync(dest, { recursive: true })
            zip.readEntry()
          } else {
            fssync.mkdirSync(path.dirname(dest), { recursive: true })
            zip.openReadStream(entry, (err2: any, stream: any) => {
              if (err2) return reject(err2)
              const out = fssync.createWriteStream(dest)
              stream.pipe(out)
              out.on('close', () => zip.readEntry())
            })
          }
        })
        zip.on('end', () => resolve())
        zip.on('error', (e: any) => reject(e))
      })
    })
    // Read manifest
    const manifestPath = path.join(tmpDir, 'manifest.json')
    const text = await fs.readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(text) as { version: number; game: { id: string; name: string }; objects: any[]; linkTags: any[]; tagLinks: any[]; images: Array<{ id: string; object_id: string; name: string | null; is_default: boolean; file: string }> }
    // Open DB
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    const gameId = manifest.game.id
    // Confirm overwrite if game exists
    const exists = db.prepare('SELECT 1 FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId)
    if (exists) {
      const res = await dialog.showMessageBox({
        type: 'warning',
        title: 'Overwrite campaign?',
        message: `A campaign with id ${gameId} already exists. Overwrite it? This cannot be undone.`,
        buttons: ['Overwrite', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (res.response !== 0) { db.close(); return { ok: false, cancelled: true } }
    }
    // Delete existing game data (hard delete) in FK-safe order inside a transaction
    try { db.prepare('BEGIN IMMEDIATE').run() } catch {}
    db.prepare('DELETE FROM images WHERE object_id IN (SELECT id FROM objects WHERE game_id = ?)').run(gameId)
    db.prepare('DELETE FROM object_tags WHERE object_id IN (SELECT id FROM objects WHERE game_id = ?)').run(gameId)
    db.prepare('DELETE FROM notes WHERE object_id IN (SELECT id FROM objects WHERE game_id = ?)').run(gameId)
    db.prepare('DELETE FROM tag_links WHERE tag_id IN (SELECT id FROM link_tags WHERE game_id = ?)').run(gameId)
    db.prepare('DELETE FROM link_tags WHERE game_id = ?').run(gameId)
    db.prepare('DELETE FROM objects WHERE game_id = ?').run(gameId)
    try { db.prepare('DELETE FROM fts_objects WHERE game_id = ?').run(gameId) } catch {}
    try { db.prepare('COMMIT').run() } catch { try { db.prepare('ROLLBACK').run() } catch {} }
    // Ensure game exists (insert if not exists) and set name
    const now = new Date().toISOString()
    try { db.prepare('BEGIN IMMEDIATE').run() } catch {}
    db.prepare('INSERT OR IGNORE INTO games (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
      .run(gameId, manifest.game.name || 'Imported', now, now)
    db.prepare('UPDATE games SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(manifest.game.name || 'Imported', now, gameId)
    // Remap ids with random prefix (except game id)
    const randPrefix = crypto.randomUUID().slice(0, 8)
    const mapId = (id: string) => id.replace(/^(\w+_)/, `$1${randPrefix}_`)
    const objectIdMap = new Map<string, string>()
    for (const o of manifest.objects) objectIdMap.set(o.id, mapId(o.id))
    const tagIdMap = new Map<string, string>()
    for (const t of manifest.linkTags) tagIdMap.set(t.id, mapId(t.id))
    const imageIdMap = new Map<string, string>()
    for (const im of manifest.images) imageIdMap.set(im.id, mapId(im.id))
    // Build tag owner map from descriptions as fallback (original ids)
    const tokenRe = /\[\[[^\]|]+\|([^\]]+)\]\]/g
    const tagOwnerOriginal = new Map<string, string>()
    for (const o of manifest.objects) {
      const text = String(o.description || '')
      let m: RegExpExecArray | null
      while ((m = tokenRe.exec(text))) {
        const tagId = m[1]
        if (!tagOwnerOriginal.has(tagId)) tagOwnerOriginal.set(tagId, o.id)
      }
    }
    // Helper: remap description tag ids to new tag ids
    const remapDescription = (text: string | null | undefined): string => {
      if (!text) return ''
      return String(text).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, label, tag) => {
        const newTag = tagIdMap.get(String(tag)) || String(tag)
        return `[[${String(label)}|${newTag}]]`
      })
    }
    // Insert objects (parents first)
    const stmtObj = db.prepare('INSERT INTO objects (id, game_id, name, type, parent_id, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
    const byId = new Map<string, any>()
    for (const o of manifest.objects) byId.set(o.id, o)
    const depthMemo = new Map<string, number>()
    const depthOf = (id: string): number => {
      if (depthMemo.has(id)) return depthMemo.get(id)!
      const o = byId.get(id)
      if (!o || !o.parent_id) { depthMemo.set(id, 0); return 0 }
      const d = 1 + depthOf(o.parent_id as string)
      depthMemo.set(id, d)
      return d
    }
    const ordered = manifest.objects
      .map(o => ({ o, depth: depthOf(o.id), idNew: objectIdMap.get(o.id)!, parentNew: o.parent_id ? (objectIdMap.get(o.parent_id) || null) : null }))
      .sort((a, b) => a.depth - b.depth)
    for (const it of ordered) {
      const desc = remapDescription(it.o.description)
      stmtObj.run(it.idNew, gameId, it.o.name || '', it.o.type || 'Other', it.parentNew, desc, now, now)
    }
    // Insert link tags
    const stmtTag = db.prepare('INSERT INTO link_tags (id, game_id, object_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)')
    // Insert link tags from manifest or derived owners
    const seenTag = new Set<string>()
    for (const t of manifest.linkTags) {
      const idNew = tagIdMap.get(t.id)
      const ownerOrig = t.object_id || tagOwnerOriginal.get(t.id) || null
      const ownerNew = ownerOrig ? (objectIdMap.get(ownerOrig) || null) : null
      if (!idNew || !ownerNew) continue
      stmtTag.run(idNew, gameId, ownerNew, now, now)
      seenTag.add(t.id)
    }
    // Create missing link_tags derived solely from descriptions
    for (const [tagOrig, ownerOrig] of tagOwnerOriginal) {
      if (seenTag.has(tagOrig)) continue
      const idNew = mapId(tagOrig)
      tagIdMap.set(tagOrig, idNew)
      const ownerNew = objectIdMap.get(ownerOrig) || null
      if (!ownerNew) continue
      stmtTag.run(idNew, gameId, ownerNew, now, now)
    }
    // Insert tag links
    const stmtLink = db.prepare('INSERT INTO tag_links (tag_id, object_id, created_at, deleted_at) VALUES (?, ?, ?, NULL)')
    for (const l of manifest.tagLinks) {
      const tagNew = tagIdMap.get(l.tag_id) || mapId(l.tag_id)
      const objNew = objectIdMap.get(l.object_id)
      if (!tagNew || !objNew) continue
      stmtLink.run(tagNew, objNew, now)
    }
    // Copy images and create DB rows; regenerate thumbs
    const game = db.prepare('SELECT name FROM games WHERE id = ?').get(gameId) as { name?: string } | undefined
    const campaignFolder = game?.name || 'Imported'
    const baseDir = path.join(projectDirCache!, 'games', campaignFolder)
    const imagesDir = path.join(baseDir, 'images')
    const thumbsDir = path.join(baseDir, 'thumbs')
    await fs.mkdir(imagesDir, { recursive: true })
    await fs.mkdir(thumbsDir, { recursive: true })
    for (const im of manifest.images) {
      const oldId = im.id
      const newId = imageIdMap.get(oldId)!
      const src = path.join(tmpDir, im.file)
      if (!fssync.existsSync(src)) continue
      const ext = path.extname(src) || '.png'
      const fileName = newId + ext
      const dest = path.join(imagesDir, fileName)
      await fs.copyFile(src, dest)
      // Create DB row
      const objectNew = objectIdMap.get(im.object_id) || im.object_id
      db.prepare('INSERT INTO images (id, object_id, name, is_default, file_path, thumb_path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
        .run(newId, objectNew, im.name || null, im.is_default ? 1 : 0, dest, '', now, now)
      // Generate thumbnail via existing pipeline
      try {
        const buf = await fs.readFile(dest)
        let thumbBuffer: Buffer | null = null
        try {
          thumbBuffer = await sharp(buf).rotate().resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 6 }).toBuffer()
        } catch {}
        if (!thumbBuffer || thumbBuffer.length === 0) {
          const extmime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png'
          const browserThumb = await generateThumbnailWithBrowser(buf, extmime)
          if (browserThumb && browserThumb.length > 0) thumbBuffer = browserThumb
        }
        if (!thumbBuffer || thumbBuffer.length === 0) {
          const oneByOne = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2nH3EAAAAASUVORK5CYII='
          thumbBuffer = Buffer.from(oneByOne, 'base64')
        }
        const thumbPath = path.join(thumbsDir, newId + '.png')
        await fs.writeFile(thumbPath, thumbBuffer)
        db.prepare('UPDATE images SET thumb_path = ? WHERE id = ?').run(thumbPath, newId)
      } catch {}
    }
    try { db.prepare('COMMIT').run() } catch { try { db.prepare('ROLLBACK').run() } catch {} }
    db.close()
    return { ok: true }
  })

  // Export current game to shareable JSON (includes data and embedded images)
  ipcMain.handle('gamedocs:export-to-share', async (_evt, rootObjectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db) } catch {}
    // Resolve game id from root object
    const root = db.prepare('SELECT id, game_id FROM objects WHERE id = ? AND deleted_at IS NULL').get(rootObjectId) as { id: string; game_id: string } | undefined
    if (!root) { db.close(); throw new Error('Root object not found') }
    const gameId = root.game_id
    const game = db.prepare('SELECT id, name, created_at, updated_at FROM games WHERE id = ? AND deleted_at IS NULL').get(gameId) as { id: string; name: string; created_at: string; updated_at: string } | undefined
    if (!game) { db.close(); throw new Error('Game not found') }
    // Fetch all objects for the game
    const objects = db.prepare('SELECT id, game_id, name, type, parent_id, description, created_at, updated_at FROM objects WHERE game_id = ? AND deleted_at IS NULL').all(gameId) as Array<any>
    // Fetch link_tags and tag_links
    const linkTags = db.prepare('SELECT id, game_id, object_id, created_at, updated_at FROM link_tags WHERE game_id = ? AND deleted_at IS NULL').all(gameId) as Array<any>
    const tagLinks = db.prepare('SELECT tag_id, object_id, created_at FROM tag_links WHERE tag_id IN (SELECT id FROM link_tags WHERE game_id = ? AND deleted_at IS NULL)').all(gameId) as Array<any>
    // Fetch images
    const images = db.prepare('SELECT id, object_id, name, is_default, file_path, thumb_path, created_at FROM images WHERE object_id IN (SELECT id FROM objects WHERE game_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL').all(gameId) as Array<any>
    // Build manifest image entries (no base64); archive will include original files only.
    // Use stable unique filenames based on image id to avoid collisions.
    const manifestImages: Array<any> = []
    for (const img of images) {
      const ext = (img.file_path && path.extname(img.file_path)) || ''
      const fileName = `${img.id}${ext || ''}`
      const relPath = `images/${fileName}`
      manifestImages.push({ id: img.id, object_id: img.object_id, name: img.name, is_default: !!img.is_default, file: relPath })
    }
    // Generate export metadata (prefix remap deferred to import)
    const share = {
      version: 1,
      exportedAt: new Date().toISOString(),
      game: { id: game.id, name: game.name },
      objects,
      linkTags,
      tagLinks,
      images: manifestImages,
    }
    db.close()
    // Save dialog for zip
    const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Export to Share', defaultPath: path.join(projectDirCache, `${game.name.replace(/[^a-z0-9_\-]+/ig,'_') || 'campaign'}.pdshare.zip`), filters: [{ name: 'PlayerDocs Share (zip)', extensions: ['pdshare.zip','zip'] }] })
    if (canceled || !filePath) return { ok: false }
    // Create zip archive with manifest.json and images
    const archiver = (await import('archiver')).default
    await new Promise<void>((resolve, reject) => {
      const output = fssync.createWriteStream(filePath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', (e) => reject(e))
      archive.on('error', (e: any) => reject(e))
      archive.pipe(output)
      const manifestBuffer = Buffer.from(JSON.stringify(share, null, 2), 'utf8')
      archive.append(manifestBuffer, { name: 'manifest.json' })
      // Add original images only (skip thumbs; regenerate on import)
      for (const img of images) {
        if (img.file_path && fssync.existsSync(img.file_path)) {
          const ext = path.extname(img.file_path) || ''
          const fileName = `${img.id}${ext || ''}`
          archive.file(img.file_path, { name: `images/${fileName}` })
        }
      }
      archive.finalize()
    })
    return { ok: true, filePath }
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

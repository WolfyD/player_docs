import { app, BrowserWindow, shell, ipcMain, dialog, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { readConfig, writeConfig, ensureProjectScaffold } from './config'
import { initGameDatabase } from './db'
import fs from 'node:fs/promises'
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
    const { file, db } = await initGameDatabase(projectDirCache, schemaSql)
    try { ensureMigrations(db); cleanupLinkData(db) } catch {}
    db.close()
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

  ipcMain.handle('gamedocs:get-object', async (_evt, objectId: string) => {
    if (!projectDirCache) throw new Error('No project directory configured')
    const schemaPath = path.join(process.env.APP_ROOT!, 'db', 'schema.sql')
    const schemaSql = await fs.readFile(schemaPath, 'utf8')
    const { db } = await initGameDatabase(projectDirCache, schemaSql)
    const row = db.prepare('SELECT id, game_id, name, type, parent_id, description FROM objects WHERE id = ? AND deleted_at IS NULL').get(objectId)
    db.close()
    if (!row) throw new Error('Object not found')
    return row as { id: string; game_id: string; name: string; type: string; parent_id: string | null; description: string | null }
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

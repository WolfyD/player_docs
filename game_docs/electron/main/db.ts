import path from 'node:path'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'

export type DbHandle = {
  db: Database.Database
  file: string
}

type BetterSqlite3 = typeof import('better-sqlite3')

function loadBetterSqlite3(): BetterSqlite3 {
  // Resolve from project root to avoid dev runtime resolution issues
  const requireFromRoot = createRequire(process.cwd() + '/package.json')
  return requireFromRoot('better-sqlite3') as BetterSqlite3
}

export async function initGameDatabase(gameDir: string, schemaSql: string, dbBaseName: 'player_docs.sql3' | 'player_docs.db' = 'player_docs.db'): Promise<DbHandle> {
  await fsp.mkdir(gameDir, { recursive: true })
  const dbFile = path.join(gameDir, dbBaseName)
  const Database = loadBetterSqlite3()
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  return { db, file: dbFile }
}



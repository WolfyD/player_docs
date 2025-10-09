export async function createCampaign(name: string, dbName: 'player_docs.sql3' | 'player_docs.db' = 'player_docs.db') {
  // @ts-expect-error injected by preload
  const res = await window.ipcRenderer.invoke('gamedocs:create-campaign', name, dbName)
  return res as { gameDir: string; dbFile: string; gameId: string }
}



export async function createCampaign(name: string, dbName: 'player_docs.sql3' | 'player_docs.db' = 'player_docs.db') {
  const res = await window.ipcRenderer.invoke('gamedocs:create-campaign', name, dbName)
  return res as { gameDir: string; dbFile: string; gameId: string }
}



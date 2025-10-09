import React, { useEffect, useMemo, useState } from 'react'
import { createCampaign } from '../utils/ipc'

export const ProjectSetup: React.FC = () => {
  const [name, setName] = useState('My Campaign')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ gameDir: string; dbFile: string; gameId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])

  async function loadCampaigns(): Promise<Array<{ id: string; name: string }>> {
    try {
      // @ts-expect-error injected by preload
      const rows = await window.ipcRenderer.invoke('gamedocs:list-campaigns')
      setCampaigns(rows || [])
      return rows || []
    } catch (e) {
      setCampaigns([])
      return []
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  const [showCreate, setShowCreate] = useState(false)

  const onCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      //Get campaign titles from db and check if name is already in use
      const campaigns = await loadCampaigns()
      if (campaigns.some(c => c.name === name)) {
        setError('Campaign name already in use')
        return
      }
      const res = await createCampaign(name)
      setResult(res)
      await loadCampaigns()
    } catch (e: any) {
      setError(e?.message || 'Failed to create campaign')
    } finally {
      setBusy(false)
    }
  }

  const onShowCreate = () => {
    setShowCreate(true)
  }

  const onOpen = async (id: string) => {
    // @ts-expect-error injected by preload
    await window.ipcRenderer.invoke('gamedocs:open-campaign', id)
  }

  return (
    <div style={{ padding: 24, position: 'relative', minHeight: 400 }}>
      <div style={{ border: '1px solid #3a3a3a', borderRadius: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', padding: '8px 12px', background: '#202020', fontWeight: 600 }}>
          <div>Existing Campaigns</div>
        </div>
        {campaigns.length === 0 ? (
          <div style={{ padding: 12, color: '#aaa' }}>No campaigns yet.</div>
        ) : (
          campaigns.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', padding: '10px 12px', borderTop: '1px solid #2a2a2a', alignItems: 'center' }}>
              <button onClick={() => onOpen(c.id)} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>{c.name}</button>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={async () => {
                  const newName = prompt('Rename campaign', c.name)
                  if (!newName) return
                  // @ts-expect-error injected by preload
                  await window.ipcRenderer.invoke('gamedocs:rename-campaign', c.id, newName)
                  loadCampaigns()
                }}>E</button>
                <button onClick={async () => {
                  if (!confirm('Delete this campaign? (soft delete)')) return
                  // @ts-expect-error injected by preload
                  await window.ipcRenderer.invoke('gamedocs:delete-campaign', c.id)
                  loadCampaigns()
                }}>D</button>
                <button title="More">⋯</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating create button */}
      <div style={{ position: 'absolute', right: 24, bottom: 24 }}>
        {!showCreate && 
        <button onClick={onShowCreate} disabled={busy} title="Create new campaign" style={{ fontSize: 28, paddingTop: 0, paddingLeft: 10, paddingBottom: 5, paddingRight: 10 }}>
          +
        </button>
        }
        {showCreate && 
        <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', right: 0, bottom: 0 }}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name" style={{ fontSize: 28, padding: 3, marginRight: 10 }}/>
          <button onClick={onCreate} disabled={busy} title="Create new campaign" style={{ fontSize: 28, paddingTop: 0, paddingLeft: 10, paddingBottom: 5, paddingRight: 10 }}>Create</button>
        </div>
        }
      </div>

      {/* Hidden create controls, kept for future wizard */}
      <div style={{ marginTop: 16, display: 'none' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name" />
      </div>

      {result && (
        <div style={{ marginTop: 12 }}>
          <div>Folder: {result.gameDir}</div>
          <div>DB: {result.dbFile}</div>
          <div>Game ID: {result.gameId}</div>
        </div>
      )}
      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </div>
  )
}



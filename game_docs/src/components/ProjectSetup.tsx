import React, { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from './Confirm'
import { createCampaign } from '../utils/ipc'
import '../components/editor.css'

export const ProjectSetup: React.FC = () => {
  const [name, setName] = useState('My Campaign')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ gameDir: string; dbFile: string; gameId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])
  const [showRename, setShowRename] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [renameName, setRenameName] = useState('')

  async function loadCampaigns(): Promise<Array<{ id: string; name: string }>> {
    try {
      const rows = await (window as any).ipcRenderer.invoke('gamedocs:list-campaigns')
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
    await (window as any).ipcRenderer.invoke('gamedocs:open-campaign', id)
  }

  return (
    <div className="project-setup">
      <h1 className="project-setup-title">PlayerDocs</h1>
      <div className="project-setup-list">
        <div className="project-setup-list-header">
          <div>Existing Campaigns</div>
        </div>
        {campaigns.length === 0 ? (
          <div style={{ padding: 12, color: '#aaa' }}>No campaigns yet.</div>
        ) : (
          campaigns.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', padding: '10px 12px', borderTop: '1px solid #2a2a2a', alignItems: 'center' }}>
              <button className="main-campaign-listing" onClick={() => onOpen(c.id)}>{c.name}</button>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="main-button-edit" onClick={() => { setShowRename(true); setRenameTarget(c); setRenameName(c.name) }}><i className="ri-pencil-fill"></i></button>
                <button className="main-button-delete" onClick={async () => {
                  const ok = await confirmDialog({ title: 'Delete campaign', message: 'Delete this campaign? (soft delete)', variant: 'yes-no' })
                  if (!ok) return
                  await (window as any).ipcRenderer.invoke('gamedocs:delete-campaign', c.id)
                  loadCampaigns()
                }}><i className="ri-delete-bin-fill"></i></button>
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

      {/* Rename Campaign modal */}
      {showRename && renameTarget && (
        <div className="modal-overlay" onClick={() => setShowRename(false)}>
          <div className="dialog-card w-360" onClick={e => e.stopPropagation()}>
            <h3 className="mt-0">Rename campaign</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                <div>Name</div>
                <input value={renameName} onChange={e => setRenameName(e.target.value)} className="input-100" autoFocus />
              </label>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button onClick={() => setShowRename(false)}>Cancel</button>
              <button onClick={async () => {
                const nn = (renameName || '').trim()
                if (!nn || !renameTarget) { setShowRename(false); return }
                await (window as any).ipcRenderer.invoke('gamedocs:rename-campaign', renameTarget.id, nn)
                await loadCampaigns()
                setShowRename(false)
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



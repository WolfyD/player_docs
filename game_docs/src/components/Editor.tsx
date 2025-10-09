import React, { useEffect, useState } from 'react'

type Campaign = { id: string; name: string }

export const Editor: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [root, setRoot] = useState<{ id: string; name: string; type: string } | null>(null)
  const [children, setChildren] = useState<Array<{ id: string; name: string; type: string }>>([])

  useEffect(() => {
    const id = location.hash.replace(/^#\/editor\//, '')
    if (!id) return
    ;(async () => {
      try {
        // @ts-expect-error preload inject
        const row = await window.ipcRenderer.invoke('gamedocs:get-campaign', id)
        setCampaign(row)
        // Load root and its children
        // @ts-expect-error preload inject
        const r = await window.ipcRenderer.invoke('gamedocs:get-root', id)
        setRoot(r)
        // @ts-expect-error preload inject
        const ch = await window.ipcRenderer.invoke('gamedocs:list-children', id, r.id)
        setChildren(ch)
      } catch (e: any) {
        setError(e?.message || 'Failed to load campaign')
      }
    })()
  }, [])

  const getHeight = () => {
    let title = document.querySelector('.header_line')?.clientHeight || 0
    return `calc(100vh - ${30 + title + 10 + 10 + 60}px)`
  }

  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>
  if (!campaign) return <div style={{ padding: 16 }}>Loading…</div>

  return (
    <div style={{ display: 'grid', gridTemplateRows: '30px 1fr', gridTemplateColumns: '1fr', height: '90vh', width: '98%', position: 'absolute', left: '1%', top: 40 }}>
      <div className="main_header" style={{ display: 'grid', gridTemplateColumns: '1fr', position: 'absolute', left: 10, width: '90%' }}>
        <h2 style={{ position: 'absolute', marginTop: -40, left: '0px' }}>{campaign.name}</h2>
        <button className="menu_button" style={{ marginTop: -30, position: 'fixed', right: '2%' }}>...</button>
      </div>
      <div style={{ width: '100%', height: '96%', margin: 0, position: 'absolute', left: 0, top: 30, display: 'grid', gridTemplateColumns: '200px 1fr' }}>
        {/* Sidebar */}
        <div style={{ borderRight: '1px solid #333', padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}></div>
          {root && (
            <div>
              <div className="header_line" style={{ fontWeight: 600, paddingBottom: 10, borderBottom: '1px solid #333'}}>{root.name}</div>
              <div className="menu_items_container" style={{ display: 'flex', flexDirection: 'column', height: getHeight(), width: '100%', flexGrow: 1 }}>
                {children.map(c => (
                  <div key={c.id} style={{ paddingBottom: 10, borderBottom: '1px solid #333'}}>{c.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Main panel placeholder */}
        <div className="editor_container" style={{ padding: 16 }}>
          <textarea style={{ width: '100%', height: '100%' }}></textarea>
        </div>
      </div>
    </div>
  )
}



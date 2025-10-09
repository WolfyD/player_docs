import React, { useCallback, useEffect, useRef, useState } from 'react'
import Fuse from 'fuse.js'

type Campaign = { id: string; name: string }

export const Editor: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [root, setRoot] = useState<{ id: string; name: string; type: string } | null>(null)
  const [children, setChildren] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null)
  const [showCat, setShowCat] = useState(false)
  const [catName, setCatName] = useState('')
  const [catErr, setCatErr] = useState<string | null>(null)

  useEffect(() => {
    const id = location.hash.replace(/^#\/editor\//, '')
    if (!id) return
    ;(async () => {
      try {
        const row = await window.ipcRenderer.invoke('gamedocs:get-campaign', id)
        setCampaign(row)
        // Load root and its children
        const r = await window.ipcRenderer.invoke('gamedocs:get-root', id)
        setRoot(r)
        const ch = await window.ipcRenderer.invoke('gamedocs:list-children', id, r.id)
        setChildren(ch)
        setParent(null)
      } catch (e: any) {
        setError(e?.message || 'Failed to load campaign')
      }
    })()
  }, [])

  const getHeight = () => {
    let title = document.querySelector('.header_line')?.clientHeight || 0
    return `calc(100vh - ${30 + title + 10 + 10 + 60}px)`
  }

  const [desc, setDesc] = useState<string>('')
  const [activeId, setActiveId] = useState<string>('')
  const [activeName, setActiveName] = useState<string>('')
  const editorRef = useRef<HTMLDivElement | null>(null)
  const selectionRangeRef = useRef<Range | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    selText: string
  }>({ visible: false, x: 0, y: 0, selText: '' })
  const [showWizard, setShowWizard] = useState(false)
  const [wizardName, setWizardName] = useState('')
  const [wizardType, setWizardType] = useState('')
  // Linker modal state
  const [showLinker, setShowLinker] = useState(false)
  const [linkerInput, setLinkerInput] = useState('')
  const [linkerMatches, setLinkerMatches] = useState<Array<{ id: string; name: string; path?: string }>>([])
  const [linkerTagId, setLinkerTagId] = useState<string | null>(null)
  const [allObjects, setAllObjects] = useState<Array<{ id: string; name: string; parent_id: string | null }>>([])
  const [pathChoices, setPathChoices] = useState<Array<{ id: string; name: string; path: string }>>([])
  const fuseRef = useRef<Fuse<any> | null>(null)
  const [ctxLinkedTargets, setCtxLinkedTargets] = useState<Array<{ id: string; name: string; path: string }>>([])
  // Hover preview for single-target tags
  const [hoverCard, setHoverCard] = useState<{ visible: boolean; x: number; y: number; name: string; snippet: string; imageUrl: string | null }>({ visible: false, x: 0, y: 0, name: '', snippet: '', imageUrl: null })
  const lastHoverTagRef = useRef<string | null>(null)
  // Left-click menu for multi-target tags
  const [tagMenu, setTagMenu] = useState<{ visible: boolean; x: number; y: number; items: Array<{ id: string; name: string; path: string }>; hoverPreview: { id: string; name: string; snippet: string; imageUrl: string | null } | null }>({ visible: false, x: 0, y: 0, items: [], hoverPreview: null })
  useEffect(() => {
    if (!root || !campaign) return
    selectObject(root.id, root.name)
  }, [root?.id])

  useEffect(() => {
    if (!activeId) return
    const handler = setTimeout(async () => {
      await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, desc)
    }, 500)
    return () => clearTimeout(handler)
  }, [desc, activeId])

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (el) setDesc(htmlToDesc(el))
  }, [])

  const expandSelectionToWord = useCallback((sel: Selection, e: React.MouseEvent) => {
    const caretRange = (document as any).caretRangeFromPoint ? (document as any).caretRangeFromPoint(e.clientX, e.clientY) : null
    const range = caretRange || (sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null)
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const node = range.startContainer as Text
      const textContent = node.textContent || ''
      let start = range.startOffset
      let end = range.startOffset
      while (start > 0 && /[\w\p{L}\p{N}_]/u.test(textContent[start - 1])) start--
      while (end < textContent.length && /[\w\p{L}\p{N}_]/u.test(textContent[end])) end++
      const newRange = document.createRange()
      newRange.setStart(node, start)
      newRange.setEnd(node, end)
      sel.removeAllRanges()
      sel.addRange(newRange)
      return true
    }
    return false
  }, [])

  const handleEditorContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    const sel = window.getSelection()
    if (!sel) return
    if (sel.rangeCount === 0 || sel.isCollapsed) {
      const ok = expandSelectionToWord(sel, e)
      if (!ok) { setCtxMenu(m => ({ ...m, visible: false })); return }
    }
    selectionRangeRef.current = sel.getRangeAt(0).cloneRange()
    const selText = sel.toString()
    // If inside a tag span, fetch linked targets
    let tagId: string | null = null
    const node = selectionRangeRef.current.startContainer as Node
    let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { tagId = el.getAttribute('data-tag'); break }
      el = el.parentElement
    }
    if (tagId) {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => [])
      setCtxLinkedTargets(rows || [])
    } else {
      setCtxLinkedTargets([])
    }
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, selText })
  }, [expandSelectionToWord])

  const handleAddLinkOpen = useCallback(async () => {
    setCtxMenu(m => ({ ...m, visible: false }))
    setPathChoices([])
    // If selection is inside an existing tag span, reuse that tag id
    let existingTag: string | null = null
    if (selectionRangeRef.current) {
      const node = selectionRangeRef.current.startContainer as Node
      let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
      while (el) {
        if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { existingTag = el.getAttribute('data-tag'); break }
        el = el.parentElement
      }
    }
    setLinkerTagId(existingTag)
    setLinkerInput(ctxMenu.selText.trim())
    setShowLinker(true)
    // preload objects for fuzzy
    const rows = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id)
    setAllObjects(rows || [])
    fuseRef.current = new Fuse(rows || [], { keys: ['name'], threshold: 0.4 })
    setLinkerMatches((rows || []).slice(0, 10))
  }, [campaign, ctxMenu.selText])

  const handleEditOpen = useCallback(() => {
    setCtxMenu(m => ({ ...m, visible: false }))
    setWizardName(ctxMenu.selText.trim())
    setWizardType('')
    setShowWizard(true)
  }, [ctxMenu.selText])

  const handleClearLink = useCallback(() => {
    const range = selectionRangeRef.current
    if (!range) { setCtxMenu(m => ({ ...m, visible: false })); return }
    let el: HTMLElement | null = (range.startContainer as any).parentElement
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { break }
      el = el.parentElement
    }
    if (el && editorRef.current) {
      const text = document.createTextNode(el.textContent || '')
      el.replaceWith(text)
      setDesc(htmlToDesc(editorRef.current))
    }
    setCtxMenu(m => ({ ...m, visible: false }))
  }, [])

  const handleLinkerInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setLinkerInput(v)
    setPathChoices([])
    if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
    const fuse = fuseRef.current
    if (fuse) {
      const res = fuse.search(v).map(r => r.item).slice(0, 10)
      setLinkerMatches(res)
    }
  }, [allObjects])

  const handleSelectPathChoice = useCallback(async (pc: { id: string; name: string; path: string }) => {
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, pc.id)
    if (createdNew) {
      replaceSelectionWithSpan(linkerInput || pc.name, tid)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId])

  const handleSelectMatch = useCallback(async (m: { id: string; name: string }) => {
    const same = await window.ipcRenderer.invoke('gamedocs:get-objects-by-name-with-paths', campaign!.id, m.name)
    if ((same || []).length > 1) {
      setPathChoices(same || [])
      return
    }
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, m.id)
    if (createdNew) {
      replaceSelectionWithSpan(linkerInput || m.name, tid)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId])

  const handleWizardCreate = useCallback(async () => {
    const label = (wizardName || '').trim()
    if (!label) return
    const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
    const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, activeId || rootObj.id, label, (wizardType || null))
    setShowWizard(false)
    replaceSelectionWithSpan(label, res.tagId)
  }, [wizardName, wizardType, campaign, activeId])

  const handleCreateCategory = useCallback(async () => {
    const name = (catName || '').trim()
    if (!name) { setCatErr('Name is required'); return }
    try {
      await window.ipcRenderer.invoke('gamedocs:create-category', campaign!.id, activeId || root!.id, name)
      // Reload children
      const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
      setChildren(kids)
      setShowCat(false)
    } catch (e: any) {
      setCatErr(e?.message || 'Failed to create category')
    }
  }, [catName, campaign, activeId, root])

  const openAddChildModal = useCallback(() => {
    setCatErr(null)
    setCatName('')
    setShowCat(true)
  }, [])

  const handleParentClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (parent) selectObject(parent.id, parent.name)
  }, [parent])

  const handleMenuItemsClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const item = target.closest('[data-oid]') as HTMLElement | null
    if (!item) return
    const id = item.getAttribute('data-oid') || ''
    const name = item.getAttribute('data-oname') || ''
    if (id) selectObject(id, name)
  }, [])

  const handleCtxMenuLeave = useCallback(() => setCtxMenu(m => ({ ...m, visible: false })), [])

  const handleCloseLinker = useCallback(() => setShowLinker(false), [])

  const handlePathChoicesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
    if (!el) return
    const pc = { id: el.dataset.id!, name: el.dataset.name!, path: el.dataset.path! }
    handleSelectPathChoice(pc)
  }, [handleSelectPathChoice])

  const handleMatchesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
    if (!el) return
    const m = { id: el.dataset.id!, name: el.dataset.name! }
    handleSelectMatch(m)
  }, [handleSelectMatch])

  async function selectObject(id: string, name: string) {
    setActiveId(id)
    setActiveName(name)
    const obj = await window.ipcRenderer.invoke('gamedocs:get-object', id)
    const text = obj?.description || ''
    setDesc(text)
    // Render tokens as span tags with data-tag
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = descToHtml(text)
      }
    })
    // Load children and parent
    const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, id)
    setChildren(kids)
    const pId = obj?.parent_id as string | null
    if (pId) {
      const pobj = await window.ipcRenderer.invoke('gamedocs:get-object', pId)
      setParent({ id: pobj.id, name: pobj.name })
    } else {
      setParent(null)
    }
  }

  const handleCreateChild = useCallback(async () => {

    const name = (catName || '').trim()
    if (!name) { setCatErr('Name is required'); return }
    try {
      await window.ipcRenderer.invoke('gamedocs:create-category', campaign!.id, activeId || root!.id, name)
      // Reload children
      const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
      setChildren(kids)
      setShowCat(false)
    } catch (e: any) {
      setCatErr(e?.message || 'Failed to create category')
    }

  }, [catName, campaign, activeId, root])

  function insertAtSelection(text: string) {
    // For contentEditable, prefer replacing current Range; fallback to append
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(document.createTextNode(text))
      const txt = el.innerText
      setDesc(txt)
      return
    }
    setDesc(prev => (prev ? prev + text : text))
  }

  function replaceSelectionWith(text: string) {
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(document.createTextNode(text))
      const txt = el.innerText
      setDesc(txt)
      return
    }
    insertAtSelection(text)
  }

  function replaceSelectionWithSpan(label: string, tagId: string) {
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    const span = document.createElement('span')
    span.textContent = label
    span.setAttribute('data-tag', tagId)
    span.style.background = 'rgba(100, 149, 237, 0.2)'
    span.style.borderBottom = '1px dotted #6495ED'
    span.style.cursor = 'pointer'
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(span)
      setDesc(htmlToDesc(el))
      return
    }
    if (el) {
      el.appendChild(span)
      setDesc(htmlToDesc(el))
    }
  }

  function descToHtml(text: string): string {
    // Convert [[label|tag_xxx]] tokens to span elements
    return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, label, tag) => {
      const safeLabel = String(label)
      const safeTag = String(tag)
      return `<span data-tag="${safeTag}" style="background: rgba(100,149,237,0.2); border-bottom: 1px dotted #6495ED; cursor: pointer;">${safeLabel}</span>`
    })
  }

  function htmlToDesc(container: HTMLElement): string {
    // Convert spans back to token syntax for persistence
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelectorAll('span[data-tag]').forEach((el) => {
      const label = el.textContent || ''
      const tag = el.getAttribute('data-tag') || ''
      const token = document.createTextNode(`[[${label}|${tag}]]`)
      el.replaceWith(token)
    })
    return clone.innerText
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
              {parent && parent.id && parent.id !== activeId && (
                <a className="jump_to_parent" style={{ position: 'absolute', width: '200px', whiteSpace: 'nowrap', marginTop: -30, marginLeft: -10, display: 'flex', flexDirection: 'column', alignItems: 'center'}} href='#' onClick={(e) => { e.preventDefault(); selectObject(parent.id, parent.name) }}><span style={{ whiteSpace: 'nowrap' }}>parent <i className="ri-arrow-up-circle-line"></i></span></a>
              )}
              <div className="header_line" style={{ fontWeight: 600, paddingBottom: 10}}>{activeName || root.name}</div>
              <a className="add_child" href='#' onClick={() => { setCatErr(null); setCatName(''); setShowCat(true) }}>Add Child <i className="ri-add-circle-line"></i></a>
              <div  style={{ height: '10px', borderBottom: '1px solid #333' }}></div>
              <div className="menu_items_container" style={{ display: 'flex', flexDirection: 'column', height: getHeight(), width: '100%', flexGrow: 1 }}>
                {children.map(c => (
                  <div key={c.id} onClick={() => selectObject(c.id, c.name)} style={{ paddingBottom: 10, borderBottom: '1px solid #333', cursor: 'pointer' }}>{c.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main panel: interactive editor (root description for now) */}
        <div className="editor_container" style={{ padding: 16 }}>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onContextMenu={handleEditorContextMenu}
            onMouseMove={async (e) => {
              const target = e.target as HTMLElement
              const span = target && (target.closest && target.closest('span[data-tag]')) as HTMLElement | null
              if (!span) {
                lastHoverTagRef.current = null
                if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              const tagId = span.getAttribute('data-tag') || ''
              if (!tagId) return
              // Only show hover card for single-target tags
              if (lastHoverTagRef.current === tagId && hoverCard.visible) {
                // Just reposition
                setHoverCard(h => ({ ...h, x: e.clientX + 10, y: e.clientY + 10 }))
                return
              }
              lastHoverTagRef.current = tagId
              const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string; path: string }>
              if (!Array.isArray(targets) || targets.length !== 1) {
                if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              const only = targets[0]
              const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', only.id).catch(() => null) as { id: string; name: string; snippet: string; fileUrl?: string | null } | null
              if (!preview) return
              setHoverCard({ visible: true, x: e.clientX + 10, y: e.clientY + 10, name: preview.name || only.name, snippet: preview.snippet || '', imageUrl: (preview as any).fileUrl || null })
            }}
            onMouseLeave={() => { if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false })) }}
            onClick={async (e) => {
              const target = e.target as HTMLElement
              const span = target && (target.closest && target.closest('span[data-tag]')) as HTMLElement | null
              if (!span) return
              const tagId = span.getAttribute('data-tag') || ''
              if (!tagId) return
              const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string; path: string }>
              if (!Array.isArray(targets) || targets.length === 0) return
              // Shift+click jumps to first
              if ((e as React.MouseEvent).shiftKey) {
                const t0 = targets[0]
                selectObject(t0.id, t0.name)
                setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              if (targets.length === 1) {
                const t0 = targets[0]
                selectObject(t0.id, t0.name)
                setHoverCard(h => ({ ...h, visible: false }))
              } else {
                setTagMenu({ visible: true, x: (e as any).clientX, y: (e as any).clientY, items: targets, hoverPreview: null })
                setHoverCard(h => ({ ...h, visible: false }))
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== ' ') return
              const sel = window.getSelection()
              if (!sel || sel.rangeCount === 0) return
              const range = sel.getRangeAt(0)
              const node = range.startContainer
              let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
              while (el) {
                if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { break }
                el = el.parentElement
              }
              if (!el || !editorRef.current) return
              // Only special-handle when caret is at very start (<=1) or end (>=len)
              const textNode = (function findText(n: Node): Text | null {
                if (n.nodeType === Node.TEXT_NODE) return n as Text
                for (let i = 0; i < n.childNodes.length; i++) {
                  const r = findText(n.childNodes[i])
                  if (r) return r
                }
                return null
              })(el)
              if (!textNode) return
              const caretOffset = range.startContainer === textNode ? range.startOffset : (range.startContainer.nodeType === Node.ELEMENT_NODE ? 0 : 0)
              const len = textNode.textContent ? textNode.textContent.length : 0
              if (caretOffset <= 1 || caretOffset >= len) {
                e.preventDefault()
                const space = document.createTextNode(' ')
                if (caretOffset <= 1) {
                  el.parentElement?.insertBefore(space, el)
                } else {
                  if (el.nextSibling) el.parentElement?.insertBefore(space, el.nextSibling)
                  else el.parentElement?.appendChild(space)
                }
                // Move caret after inserted space
                const newRange = document.createRange()
                newRange.setStartAfter(space)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                setDesc(htmlToDesc(editorRef.current))
              }
            }}
            style={{ width: '100%', height: '100%', outline: 'none', whiteSpace: 'pre-wrap' }}
          />
          {/* Hover preview card for single-target tags */}
          {hoverCard.visible && (
            <div style={{ position: 'fixed', left: hoverCard.x, top: hoverCard.y, background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 8, maxWidth: 460, zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{hoverCard.name}</div>
              {hoverCard.imageUrl && (
                <img src={hoverCard.imageUrl} style={{ maxWidth: 400, maxHeight: 400, borderRadius: 4, display: 'block', marginBottom: 6 }} />
              )}
              {hoverCard.snippet && (
                <div style={{ color: '#bbb', fontSize: 12 }}>{hoverCard.snippet}</div>
              )}
            </div>
          )}
          {ctxMenu.visible && (
            <div
              style={{
                position: 'fixed',
                left: ctxMenu.x,
                top: ctxMenu.y,
                background: '#202020',
                border: '1px solid #333',
                borderRadius: 6,
                padding: 6,
                zIndex: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
              }}
              onMouseLeave={() => setCtxMenu(m => ({ ...m, visible: false }))}
            >
              <div style={{ padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}>Add</div>
              <div style={{ padding: '6px 10px', cursor: 'pointer' }} onClick={handleAddLinkOpen}>Add link…</div>
              <div style={{ padding: '6px 10px', cursor: 'pointer' }}
                onClick={handleEditOpen}
              >Edit…</div>
              <div style={{ padding: '6px 10px', cursor: 'pointer' }}
                onClick={handleClearLink}
              >Clear</div>
              <div style={{ borderTop: '1px solid #333', margin: '6px 0' }} />
              {ctxLinkedTargets.length === 0 ? (
                <div style={{ padding: '6px 10px', color: '#777' }}>No objects linked</div>
              ) : (
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  {ctxLinkedTargets.map(t => (
                    <div key={t.id} style={{ padding: '6px 10px' }}>{t.path}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Left-click tag menu for multi-target links */}
          {tagMenu.visible && (
            <div style={{ position: 'fixed', left: tagMenu.x, top: tagMenu.y, background: '#202020', border: '1px solid #333', borderRadius: 6, padding: 6, zIndex: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.35)', display: 'flex', gap: 8 }}
              onMouseLeave={() => setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))}
            >
              <div style={{ maxHeight: 260, overflow: 'auto', minWidth: 220 }}>
                {tagMenu.items.map(t => (
                  <div key={t.id} style={{ padding: '6px 10px', cursor: 'pointer' }}
                    onMouseEnter={async () => {
                      const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', t.id).catch(() => null) as { id: string; name: string; snippet: string; fileUrl?: string | null } | null
                      if (preview) setTagMenu(m => ({ ...m, hoverPreview: { id: t.id, name: t.name, snippet: preview.snippet || '', imageUrl: (preview as any).fileUrl || null } }))
                    }}
                    onClick={() => { selectObject(t.id, t.name); setTagMenu(m => ({ ...m, visible: false, hoverPreview: null })) }}
                  >{t.name}</div>
                ))}
              </div>
              {tagMenu.hoverPreview && (
                <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 6, padding: 8, maxWidth: 420 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{tagMenu.hoverPreview.name}</div>
                  {tagMenu.hoverPreview.imageUrl && (
                    <img src={tagMenu.hoverPreview.imageUrl} style={{ maxWidth: 400, maxHeight: 400, borderRadius: 4, display: 'block', marginBottom: 6 }} />
                  )}
                  {tagMenu.hoverPreview.snippet && (
                    <div style={{ color: '#bbb', fontSize: 12 }}>{tagMenu.hoverPreview.snippet}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Child modal */}
          {showCat && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 16, width: 360 }}>
                <h3 style={{ marginTop: 0 }}>Add Child</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label>
                    <div>Name</div>
                    <input autoFocus value={catName} onKeyDown={e => { if (e.key === 'Enter') { handleCreateChild() } else if (e.key === 'Escape') { setShowCat(false) } }} onChange={e => setCatName(e.target.value)} style={{ width: '100%' }} />
                  </label>
                  {catErr && <div style={{ color: 'tomato' }}>{catErr}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowCat(false)}>Cancel</button>
                  <button onClick={async () => { handleCreateChild() }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Create linked object modal */}
          {showWizard && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 16, width: 420 }}>
                <h3 style={{ marginTop: 0 }}>Create linked object</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label>
                    <div>Name</div>
                    <input value={wizardName} onChange={e => setWizardName(e.target.value)} style={{ width: '100%' }} />
                  </label>
                  <label>
                    <div>Type (optional)</div>
                    <input value={wizardType} onChange={e => setWizardType(e.target.value)} style={{ width: '100%' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowWizard(false)}>Cancel</button>
                  <button onClick={async () => {
                  const label = (wizardName || '').trim()
                    if (!label) return
                    const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
                  const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, activeId || rootObj.id, label, (wizardType || null))
                    setShowWizard(false)
                  replaceSelectionWithSpan(label, res.tagId)
                  }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Link to object modal */}
          {showLinker && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 16, width: 520 }}>
                <h3 style={{ marginTop: 0 }}>Link to object</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={linkerInput} autoFocus onChange={async e => {
                    const v = e.target.value
                    setLinkerInput(v)
                    setPathChoices([])
                    if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
                    const fuse = fuseRef.current
                    if (fuse) {
                      const res = fuse.search(v).map(r => r.item).slice(0, 10)
                      setLinkerMatches(res)
                    }
                  }} style={{ flex: 1 }} placeholder={'Search or type new name'} />
                  {linkerTagId ? <span title='Existing link'>🔗</span> : <span title='New item'>⎇</span>}
                </div>

                {/* Path choices */}
                {pathChoices.length > 0 ? (
                  <div style={{ marginTop: 10, maxHeight: 260, overflow: 'auto', borderTop: '1px solid #333' }}>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {pathChoices.map(pc => (
                        <li key={pc.id} style={{ padding: '6px 4px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer' }}
                          onClick={async () => {
                            let tid = linkerTagId
                            if (!tid) {
                              const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
                              tid = res.tagId
                              setLinkerTagId(tid)
                            }
                            await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, pc.id)
                            replaceSelectionWithSpan(linkerInput || pc.name, tid as string)
                            setShowLinker(false)
                          }}
                        >{pc.path}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, maxHeight: 260, overflow: 'auto', borderTop: '1px solid #333' }}>
                    {linkerMatches.length === 0 ? (
                      <div style={{ padding: 8, color: '#888' }}>No objects</div>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {linkerMatches.map(m => (
                          <li key={m.id} style={{ padding: '6px 4px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer' }}
                            onClick={async () => {
                              // Check if multiple with same name
                              const same = await window.ipcRenderer.invoke('gamedocs:get-objects-by-name-with-paths', campaign!.id, m.name)
                              if ((same || []).length > 1) {
                                setPathChoices(same || [])
                                return
                              }
                              let tid = linkerTagId
                              if (!tid) {
                                const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
                                tid = res.tagId
                                setLinkerTagId(tid)
                              }
                              await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, m.id)
                              replaceSelectionWithSpan(linkerInput || m.name, tid as string)
                              setShowLinker(false)
                            }}
                          >{m.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowLinker(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function insertTextAt(el: HTMLTextAreaElement, text: string) {
  // legacy helper; unused with contentEditable
  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  const value = el.value
  const newValue = value.slice(0, start) + text + value.slice(end)
  el.value = newValue
  const newPos = start + text.length
  el.selectionStart = el.selectionEnd = newPos
}





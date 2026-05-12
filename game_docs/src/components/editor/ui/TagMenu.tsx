/**
 * editor/ui/TagMenu.tsx
 *
 * Left-click popup menu shown when the user clicks a token that resolves to
 * multiple linked objects (a "multi-target tag").
 *
 * Two source modes:
 *  - `'tag'`      — full object-navigation menu; items can be navigated to,
 *                   and hovering shows a preview card.
 *  - `'dropdown'` — simpler action list (settings, help, edit object, lock, etc.)
 *
 * Item ids prefixed with `__` are sentinel commands; `__ATTACHMENT__` items
 * carry an attachment id after the prefix.
 *
 * The menu is positioned absolutely (fixed viewport coords stored in state).
 * The parent must pass `menuRef` for outside-click dismissal.
 */

import React from 'react'
import type { ConfirmOptions } from '../../Confirm'
import type { Attachment } from '../types'

interface TagMenuItem {
  id: string
  name: string
  path: string
}

interface HoverPreview {
  id: string
  name: string
  snippet: string
  imageUrl: string | null
}

interface TagMenuState {
  visible: boolean
  x: number
  y: number
  items: TagMenuItem[]
  hoverPreview: HoverPreview | null
  source?: 'dropdown' | 'tag'
}

interface TagMenuProps {
  state: TagMenuState
  setState: React.Dispatch<React.SetStateAction<TagMenuState>>
  tagMenuWordAttachments: Attachment[]
  menuRef: React.RefObject<HTMLDivElement>
  /** The id of the currently active object (used by __DELETE__, etc.). */
  activeId: string
  activeName: string
  activeLocked: boolean
  parent: { id: string; name: string } | null
  root: { id: string; name: string } | null
  campaign: { id: string } | null
  setHasPlaces: (v: boolean) => void
  setShowSettings: (v: boolean) => void
  setShowHelp: (v: boolean) => void
  setShowMisc: (v: boolean) => void
  setActiveLocked: (v: boolean) => void
  setAddPictureModal: (v: boolean) => void
  setEditName: (v: string) => void
  setWizardType: (v: string) => void
  setOwnerTags: (v: any[]) => void
  setIncomingLinks: (v: any[]) => void
  setShowEditObject: (v: boolean) => void
  handleBulkMoveOpen: () => void
  handleOpenWordAttachment: (row: Attachment) => Promise<void>
  selectObject: (id: string, name: string) => void
  confirmDialog: (opts: ConfirmOptions) => Promise<boolean>
}

/** Multi-target and dropdown popup menu for tag token left-click events. */
const TagMenu: React.FC<TagMenuProps> = ({
  state, setState,
  tagMenuWordAttachments,
  menuRef,
  activeId, activeName, activeLocked,
  parent, root, campaign,
  setHasPlaces, setShowSettings, setShowHelp, setShowMisc,
  setActiveLocked, setAddPictureModal,
  setEditName, setWizardType, setOwnerTags, setIncomingLinks, setShowEditObject,
  handleBulkMoveOpen, handleOpenWordAttachment, selectObject, confirmDialog,
}) => {
  if (!state.visible) return null

  /** Closes the menu and clears any hover preview. */
  const close = () => setState(m => ({ ...m, visible: false, hoverPreview: null }))

  /** Handles a click on a menu item, dispatching to the correct sentinel action. */
  const handleItemClick = async (t: TagMenuItem) => {
    if (/^__SEPARATOR/.test(t.id)) return

    if (t.id.startsWith('__ATTACHMENT__')) {
      const aid = t.id.replace('__ATTACHMENT__', '')
      const row = tagMenuWordAttachments.find(r => r.id === aid)
      if (row) await handleOpenWordAttachment(row)
      close(); return
    }

    if (t.id === '__DELETE__') {
      const ok = await confirmDialog({ title: 'Delete', message: `Delete '${activeName}' and all descendants?`, variant: 'yes-no' })
      if (!ok) { close(); return }
      await window.ipcRenderer.invoke('gamedocs:delete-object-cascade', activeId)
      if (parent) selectObject(parent.id, parent.name)
      else if (root) selectObject(root.id, root.name)
      try {
        const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
        setHasPlaces(!!has)
      } catch {}
      close(); return
    }

    if (t.id === '__SETTINGS__') { setShowSettings(true); close(); return }
    if (t.id === '__HELP__') { setShowHelp(true); close(); return }

    if (t.id === '__EDITOBJECT__') {
      close()
      setEditName(activeName)
      const obj = await window.ipcRenderer.invoke('gamedocs:get-object', activeId)
      setWizardType((obj?.type_id as string) || (obj?.type as string) || 'type_other')
      const [ot, inc] = await Promise.all([
        window.ipcRenderer.invoke('gamedocs:list-owner-tags', activeId).catch(() => []),
        window.ipcRenderer.invoke('gamedocs:list-incoming-links', activeId).catch(() => []),
      ])
      setOwnerTags(ot || [])
      setIncomingLinks(inc || [])
      setShowEditObject(true)
      return
    }

    if (t.id === '__LOCK__') {
      await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, true)
      setActiveLocked(true)
      close()
      window.location.reload()
      return
    }

    if (t.id === '__UNLOCK__') {
      await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, false)
      setActiveLocked(false)
      close()
      window.location.reload()
      return
    }

    if (t.id === '__ADDPICTURE__') { setAddPictureModal(true); close(); return }
    if (t.id === '__MISC_STUFF__') { setShowMisc(true); close(); return }
    if (t.id === '__BULK_MOVE_ITEMS__') { handleBulkMoveOpen(); close(); return }

    selectObject(t.id, t.name)
    close()
  }

  /** Fetches and renders a hover preview for the given tag item. */
  const handleItemMouseEnter = async (t: TagMenuItem) => {
    if (state.source !== 'tag') return
    if (t.id.startsWith('__ATTACHMENT__')) return
    const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', t.id).catch(() => null) as {
      id: string; name: string; snippet: string; thumbDataUrl?: string | null; thumbPath?: string | null; imagePath?: string | null
    } | null
    let imgUrl = (preview as any)?.thumbDataUrl || null
    if (!imgUrl) {
      const primary = (preview as any)?.thumbPath as (string | undefined)
      const secondary = (preview as any)?.imagePath as (string | undefined)
      if (primary) {
        const resA = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', primary).catch(() => null)
        if (resA?.ok) imgUrl = resA.dataUrl
      }
      if (!imgUrl && secondary) {
        const resB = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', secondary).catch(() => null)
        if (resB?.ok) imgUrl = resB.dataUrl
      }
    }
    if (preview) setState(m => ({ ...m, hoverPreview: { id: t.id, name: preview.name || t.name, snippet: preview.snippet || '', imageUrl: imgUrl } }))
  }

  return (
    <div className="tag-menu" style={{ left: state.x, top: state.y }} ref={menuRef}>
      <div className="tag-menu-list">
        {state.items.map(t => {
          if (/^__SEPARATOR/.test(t.id)) {
            return <div key={t.id} className="separator" role="separator" />
          }
          return (
            <div
              key={t.id}
              className="tag-menu-item"
              onMouseEnter={() => handleItemMouseEnter(t)}
              onClick={() => handleItemClick(t)}
            >
              {t.name}
            </div>
          )
        })}
      </div>
      {state.hoverPreview && (
        <div className="preview-card">
          <div className="preview-card-title">{state.hoverPreview.name}</div>
          {state.hoverPreview.imageUrl && (
            <img src={state.hoverPreview.imageUrl} className="preview-card-image" alt="" />
          )}
          {state.hoverPreview.snippet && (
            <div className="preview-card-snippet">{state.hoverPreview.snippet}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default TagMenu

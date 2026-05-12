/**
 * editor/ui/EditorContextMenu.tsx
 *
 * The main right-click context menu for the description editor area.
 * When `toggleStylingOptions` is enabled, a formatting toolbar is shown at the
 * top (bold, italic, underline, strike, heading, code, quote, redacted, clear).
 * Below that, a "Links" section lists the objects linked to the hovered token,
 * along with actions to link, attach a file to the word, edit, clear, and
 * insert templates.
 *
 * Each linked target shows a hover preview card (position calculated here and
 * propagated via `setHoverCard`).
 */

import React from 'react'
import type { Attachment } from '../types'

interface HoverCardState {
  visible: boolean
  x: number
  y: number
  name: string
  snippet: string
  imageUrl: string | null
}

interface EditorContextMenuProps {
  visible: boolean
  x: number
  y: number
  activeStyles?: Set<string>
  /** Whether formatting tools are shown in the menu. */
  toggleStylingOptions: boolean
  /** Linked object targets for the hovered/clicked token. */
  ctxLinkedTargets: Array<{ id: string; name: string; path: string; tag_id: string }>
  /** Tag id for the current token (used for word-attachment actions). */
  ctxTagId: string | null
  ctxTagAttachments: Attachment[]
  activeLocked: boolean
  menuRef: React.RefObject<HTMLDivElement>
  hoverCard: HoverCardState
  setCtxTagAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  setHoverCard: React.Dispatch<React.SetStateAction<HoverCardState>>
  setCtxMenu: React.Dispatch<React.SetStateAction<{ visible: boolean; x: number; y: number; selText: string; activeStyles?: Set<string> }>>
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onStrikethrough: () => void
  onHeading: () => void
  onCode: () => void
  onQuote: () => void
  onRedacted: () => void
  onClearFormatting: () => void
  onAddLinkOpen: () => void
  onAttachFileToWord: () => Promise<void>
  onEditOpen: () => void
  onClearLink: () => void
  onInsertTemplate: () => void
  selectObject: (id: string, name: string) => void
}

/** Full editor right-click menu with formatting, linking and navigation actions. */
const EditorContextMenu: React.FC<EditorContextMenuProps> = ({
  visible, x, y, activeStyles, toggleStylingOptions,
  ctxLinkedTargets, ctxTagId, ctxTagAttachments, activeLocked,
  menuRef, hoverCard, setCtxTagAttachments, setHoverCard, setCtxMenu,
  onBold, onItalic, onUnderline, onStrikethrough, onHeading,
  onCode, onQuote, onRedacted, onClearFormatting,
  onAddLinkOpen, onAttachFileToWord, onEditOpen, onClearLink,
  onInsertTemplate, selectObject,
}) => {
  if (!visible) return null

  /** Fetches and positions the hover preview card for a linked target item. */
  const handleTargetHover = async (e: React.MouseEvent, t: { id: string; name: string }) => {
    const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', t.id).catch(() => null) as any
    if (!preview) return
    let imgUrl = preview.thumbDataUrl || null
    if (!imgUrl) {
      const primary = preview.thumbPath as (string | undefined)
      const secondary = preview.imagePath as (string | undefined)
      if (primary) {
        const resA = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', primary).catch(() => null)
        if (resA?.ok) imgUrl = resA.dataUrl
      }
      if (!imgUrl && secondary) {
        const resB = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', secondary).catch(() => null)
        if (resB?.ok) imgUrl = resB.dataUrl
      }
    }
    let rect = null
    try {
      rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    } catch {
      return
    }
    const pad = 10, CARD_W = 300
    const baseX = rect.left + Math.min(16, Math.max(0, rect.width / 2))
    const baseY = rect.bottom + 10
    const targetX = baseX - (CARD_W / 2)
    const nx = Math.max(pad, Math.min(targetX, window.innerWidth - pad - CARD_W))
    const ny = Math.max(0, Math.min(baseY, window.innerHeight - 40))
    setHoverCard({ visible: true, x: nx, y: ny, name: preview.name || t.name, snippet: preview.snippet || '', imageUrl: imgUrl })
  }

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} ref={menuRef}>
      {toggleStylingOptions && (
        <>
          <div className="ctx-menu-formatting-section">
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('bold') ? 'active' : ''}`} title="Bold" onClick={onBold}>
              <i className="ri-bold"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('italic') ? 'active' : ''}`} title="Italic" onClick={onItalic}>
              <i className="ri-italic"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('underline') ? 'active' : ''}`} title="Underline" onClick={onUnderline}>
              <i className="ri-underline"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('strike') ? 'active' : ''}`} title="Strikethrough" onClick={onStrikethrough}>
              <i className="ri-strikethrough"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('h1') ? 'active' : ''}`} title="Heading" onClick={onHeading}>
              <i className="ri-heading"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('code') ? 'active' : ''}`} title="Code" onClick={onCode}>
              <i className="ri-braces-line"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('quote') ? 'active' : ''}`} title="Quote" onClick={onQuote}>
              <i className="ri-double-quotes-r"></i>
            </div>
            <div className={`ctx-menu-item formatting-item ${activeStyles?.has('redacted') ? 'active' : ''}`} title="Redacted" onClick={onRedacted}>
              <i className="ri-checkbox-indeterminate-fill"></i>
            </div>
            <div className="ctx-menu-item formatting-item" title="Clear Formatting" onClick={onClearFormatting}>
              <i className="ri-format-clear"></i>
            </div>
          </div>
          <div className="separator" />
        </>
      )}

      <div className="ctx-menu-section-title">Links</div>
      <div className="separator" />
      <div className="ctx-menu-item" onClick={onAddLinkOpen}>Link Object</div>
      <div className="ctx-menu-item" onClick={async () => { await onAttachFileToWord(); setCtxMenu(m => ({ ...m, visible: false })) }}>
        Attach File to Word
      </div>
      {ctxTagId && ctxTagAttachments.length > 0 ? (
        <div className="ctx-menu-item" onClick={async () => {
          await window.ipcRenderer.invoke('gamedocs:remove-tag-attachments', ctxTagId).catch(() => null)
          setCtxTagAttachments([])
          setCtxMenu(m => ({ ...m, visible: false }))
        }}>
          Remove Word Attachment{ctxTagAttachments.length > 1 ? 's' : ''}
        </div>
      ) : null}
      <div className="ctx-menu-item" onClick={() => { onInsertTemplate(); setCtxMenu(m => ({ ...m, visible: false })) }}>
        Insert Template
      </div>

      {ctxLinkedTargets.length > 0 && (
        <>
          <div className="ctx-menu-item" onClick={onEditOpen}>Edit</div>
          <div className="ctx-menu-item" onClick={onClearLink}>Clear</div>
        </>
      )}
      <div className="separator" />
      {ctxLinkedTargets.length === 0 ? (
        <div className="ctx-menu-item muted">No objects linked</div>
      ) : (
        <div className="ctx-menu-scroll">
          {ctxLinkedTargets.map(t => (
            <div
              key={t.id}
              className="ctx-menu-item"
              dangerouslySetInnerHTML={{ __html: t.path }}
              onMouseEnter={e => handleTargetHover(e, t)}
              onMouseLeave={() => { if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false })) }}
              onClick={() => {
                if (activeLocked) { setCtxMenu(m => ({ ...m, visible: false })); return }
                selectObject(t.id, t.name)
                setCtxMenu(m => ({ ...m, visible: false }))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default EditorContextMenu

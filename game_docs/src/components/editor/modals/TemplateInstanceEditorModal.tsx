/**
 * editor/modals/TemplateInstanceEditorModal.tsx
 *
 * Form modal for editing the field values of an existing template instance.
 * Renders fields from the instance's stored `template_fields` metadata:
 *  - `text` / `attachment` → single-line input with optional file browse button
 *  - `textarea` / `richtext` → multi-line textarea; rich-text fields get
 *    quick-insert buttons for bold, italic, h1, and quote tokens
 *  - `image` → single-line input + browse button; on save, file paths are
 *    converted to data URLs automatically
 *  - `div` → labelled group container; children rendered indented beneath it
 */

import React from 'react'
import { normalizeTemplateFields, parseTemplateMeta } from '../templateEngine'
import type { TemplateInstance } from '../types'

interface TemplateInstanceEditorModalProps {
  /** The editor state object; `open` controls visibility. */
  state: { open: boolean; instance: TemplateInstance | null; values: Record<string, string> }
  setState: React.Dispatch<React.SetStateAction<{ open: boolean; instance: TemplateInstance | null; values: Record<string, string> }>>
  /** The id of the currently active object, used to reload data after save. */
  activeId: string
  editorRef: React.RefObject<HTMLDivElement | null>
  loadObjectScopedData: (objectId: string) => Promise<void>
  /** Extracts canonical text from the editor DOM and updates description state. */
  syncDescFromEditor: () => void
}

/** Template instance value editor — renders all fields and saves changes to the DB. */
const TemplateInstanceEditorModal: React.FC<TemplateInstanceEditorModalProps> = ({
  state,
  setState,
  activeId,
  editorRef,
  loadObjectScopedData,
  syncDescFromEditor,
}) => {
  if (!state.open || !state.instance) return null

  const close = () => setState({ open: false, instance: null, values: {} })

  const fields = normalizeTemplateFields(
    parseTemplateMeta(state.instance.template_fields || '[]').fields as any[]
  )

  const byParent = new Map<string | null, typeof fields>()
  for (const f of fields) {
    const k = f.parentId ?? null
    const arr = byParent.get(k) || []
    arr.push(f)
    byParent.set(k, arr)
  }
  for (const [k, arr] of byParent.entries()) {
    arr.sort((a, b) => a.order - b.order)
    byParent.set(k, arr)
  }

  /** Recursively renders field inputs, indented by `depth` for nested groups. */
  const renderFields = (parentId: string | null, depth: number): React.ReactNode => {
    const nodes = byParent.get(parentId) || []
    return nodes.map(f => {
      if (f.type === 'div') {
        return (
          <div key={`edit_${f.id}`} className={`boxed ${f.className || ''}`.trim()} style={{ marginLeft: depth * 12 }}>
            <div className="box-title">{f.label || 'Group'}</div>
            {renderFields(f.id, depth + 1)}
          </div>
        )
      }
      return (
        <label key={`edit_${f.id}`} style={{ marginLeft: depth * 12 }}>
          <div>{f.label}</div>
          {f.type === 'textarea' || f.type === 'richtext' ? (
            <>
              <textarea
                placeholder={f.placeholder || ''}
                value={state.values[f.label] || ''}
                onChange={e => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: e.target.value } }))}
                className="new-child-description input-100"
              />
              {f.type === 'richtext' && (
                <div className="flex-gap-6 mt-6">
                  <button onClick={() => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: `${prev.values[f.label] || ''}[{bold|text}]` } }))}>Bold</button>
                  <button onClick={() => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: `${prev.values[f.label] || ''}[{italic|text}]` } }))}>Italic</button>
                  <button onClick={() => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: `${prev.values[f.label] || ''}[{h1|Heading}]` } }))}>H1</button>
                  <button onClick={() => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: `${prev.values[f.label] || ''}[{quote|Quote}]` } }))}>Quote</button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-row">
              <input
                placeholder={f.placeholder || ''}
                value={state.values[f.label] || ''}
                onChange={e => setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: e.target.value } }))}
                className="input-100"
              />
              {(f.type === 'image' || f.type === 'attachment') && (
                <button onClick={async () => {
                  const picked = await window.ipcRenderer.invoke('gamedocs:choose-attachment-file').catch(() => null)
                  if (picked?.path) setState(prev => ({ ...prev, values: { ...prev.values, [f.label]: picked.path } }))
                }}>Browse…</button>
              )}
            </div>
          )}
        </label>
      )
    })
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="dialog-card"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') close() }}
      >
        <h3 className="mt-0">Edit Template Instance: {state.instance.template_name}</h3>
        <div className="grid-gap-8">
          {renderFields(null, 0)}
        </div>
        <div className="actions">
          <button onClick={close}>Cancel</button>
          <button onClick={async () => {
            const inst = state.instance
            if (!inst) return
            const saveFields = normalizeTemplateFields(parseTemplateMeta(inst.template_fields || '[]').fields as any[])
            const nextValues: Record<string, string> = { ...state.values }
            for (const f of saveFields) {
              if (f.type !== 'image') continue
              const raw = String(nextValues[f.label] || '').trim()
              if (!raw || /^data:image\//i.test(raw)) continue
              const maybe = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', raw).catch(() => null) as { ok?: boolean; dataUrl?: string | null } | null
              if (maybe?.ok && maybe.dataUrl) nextValues[f.label] = maybe.dataUrl
            }
            await window.ipcRenderer.invoke('gamedocs:update-template-instance-values', inst.id, JSON.stringify(nextValues))
            if (activeId) await loadObjectScopedData(activeId)
            syncDescFromEditor()
            close()
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default TemplateInstanceEditorModal

/**
 * editor/modals/TypeManagerModal.tsx
 *
 * The Type Manager panel — a wide table that lists all global object types with
 * their icon, tags, per-campaign visibility toggle, usage count, and action
 * buttons (Edit, Switch, Delete).
 *
 * Confirmation sub-modals for delete and bulk-switch operations are rendered
 * inline here since they are tightly coupled to the table state and only appear
 * in this context.
 */

import React from 'react'
import { toast } from '../../Confirm'
import type { ObjectType } from '../types'

interface TypeManagerModalProps {
  /** Whether the main type manager table is visible. */
  visible: boolean
  objectTypes: ObjectType[]
  /** The active campaign id — used for visibility toggle IPC calls. */
  campaignId: string
  /** Whether the delete confirmation sub-modal is open. */
  deleteTypeTarget: ObjectType | null
  deleteTypeReplacementId: string
  deleteTypeItems: Array<{ id: string; name: string }>
  /** Whether the switch-type sub-modal is open. */
  switchTypeTarget: ObjectType | null
  switchTypeReplacementId: string
  setDeleteTypeTarget: (t: ObjectType | null) => void
  setDeleteTypeReplacementId: (id: string) => void
  setDeleteTypeItems: (items: Array<{ id: string; name: string }>) => void
  setSwitchTypeTarget: (t: ObjectType | null) => void
  setSwitchTypeReplacementId: (id: string) => void
  onClose: () => void
  onOpenNewTypeEditor: () => void
  onOpenEditTypeEditor: (t: ObjectType) => void
  onRefreshCatalog: () => Promise<void>
  /** Called after a switch-type operation completes so the editor can re-select
   *  the active object and refresh its display. */
  onAfterSwitch: () => Promise<void>
}

/** Type Manager table with inline delete and switch-type confirmation dialogs. */
const TypeManagerModal: React.FC<TypeManagerModalProps> = ({
  visible,
  objectTypes,
  campaignId,
  deleteTypeTarget, deleteTypeReplacementId, deleteTypeItems,
  switchTypeTarget, switchTypeReplacementId,
  setDeleteTypeTarget, setDeleteTypeReplacementId, setDeleteTypeItems,
  setSwitchTypeTarget, setSwitchTypeReplacementId,
  onClose, onOpenNewTypeEditor, onOpenEditTypeEditor,
  onRefreshCatalog, onAfterSwitch,
}) => {
  if (!visible) return null
  return (
    <>
      <div
        className="modal-overlay"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="dialog-card"
          style={{ width: 'min(1080px, 94vw)', maxHeight: '86vh', overflow: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="edit-modal-header">
            <h3 className="m-0">Type Manager</h3>
            <div className="flex-gap-8">
              <button onClick={onOpenNewTypeEditor}><i className="ri-add-line"></i> Add type</button>
              <button onClick={onClose}>Close</button>
            </div>
          </div>
          <table className="input-100" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>ID</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Icon</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Tags</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Visible</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Usage</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #333' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {objectTypes.map(typeRow => (
                <tr key={typeRow.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}><code>{typeRow.id}</code></td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>
                    {typeRow.name}
                    {typeRow.isHidden ? <span style={{ marginLeft: 8, opacity: 0.85 }} title="Hidden in this campaign"><i className="ri-eye-off-line"></i></span> : null}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>
                    <i className={typeRow.icon || 'ri-price-tag-3-line'}></i> <code>{typeRow.icon}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>
                    {(typeRow.tags || []).map(t => t.name).join(', ') || <span className="muted">none</span>}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>
                    <label className="items-center flex-gap-6">
                      <input
                        type="checkbox"
                        checked={!typeRow.isHidden}
                        disabled={!!typeRow.isProtected}
                        onChange={async e => {
                          await window.ipcRenderer.invoke('gamedocs:set-type-hidden', campaignId, typeRow.id, !e.target.checked).catch((err: any) => {
                            toast(err?.message || 'Failed to update visibility', 'error')
                          })
                          await onRefreshCatalog()
                        }}
                      />
                      <span>{typeRow.isHidden ? 'Hidden' : 'Visible'}</span>
                    </label>
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>{typeRow.usageCount}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #222' }}>
                    <div className="flex-gap-6">
                      <button onClick={() => onOpenEditTypeEditor(typeRow)}>Edit</button>
                      <button onClick={() => { setSwitchTypeTarget(typeRow); setSwitchTypeReplacementId('') }}>Switch</button>
                      {typeRow.isProtected ? null : (
                        <button onClick={async () => {
                          const rows = await window.ipcRenderer.invoke('gamedocs:list-objects-by-type', campaignId, typeRow.id, 120).catch(() => [])
                          setDeleteTypeItems(Array.isArray(rows) ? rows : [])
                          setDeleteTypeTarget(typeRow)
                          setDeleteTypeReplacementId('')
                        }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete type confirmation sub-modal */}
      {deleteTypeTarget && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1001 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDeleteTypeTarget(null) }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteTypeTarget(null) }}
        >
          <div className="dialog-card w-520" onClick={e => e.stopPropagation()}>
            <h3 className="mt-0">Delete type: {deleteTypeTarget.name}</h3>
            <div className="muted">Objects using this type in current campaign: {deleteTypeTarget.usageCount}</div>
            <label className="mt-8">
              <div>Reassign affected objects to</div>
              <select value={deleteTypeReplacementId} onChange={e => setDeleteTypeReplacementId(e.target.value)} className="input-100">
                <option value="">Select replacement type…</option>
                {objectTypes.filter(t => t.id !== deleteTypeTarget.id && !t.isHidden).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <div className="maxh-260 border-top mt-10">
              <ul className="list-reset">
                {deleteTypeItems.map(it => (
                  <li key={it.id} className="list-item-row">
                    <span>{it.name}</span><code>{it.id}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div className="actions">
              <button onClick={() => setDeleteTypeTarget(null)}>Cancel</button>
              <button onClick={async () => {
                if (!deleteTypeReplacementId) { toast('Pick a replacement type first', 'error'); return }
                await window.ipcRenderer.invoke('gamedocs:delete-type', deleteTypeTarget.id, deleteTypeReplacementId).catch((err: any) => {
                  toast(err?.message || 'Failed to delete type', 'error')
                })
                setDeleteTypeTarget(null)
                setDeleteTypeItems([])
                await onRefreshCatalog()
              }}>Delete and reassign</button>
            </div>
          </div>
        </div>
      )}

      {/* Switch-type confirmation sub-modal */}
      {switchTypeTarget && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1001 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setSwitchTypeTarget(null) }}
          onClick={e => { if (e.target === e.currentTarget) setSwitchTypeTarget(null) }}
        >
          <div className="dialog-card w-460" onClick={e => e.stopPropagation()}>
            <h3 className="mt-0">Switch type: {switchTypeTarget.name}</h3>
            <div className="muted">This updates all objects in current campaign with this type.</div>
            <label className="mt-8">
              <div>Switch to</div>
              <select value={switchTypeReplacementId} onChange={e => setSwitchTypeReplacementId(e.target.value)} className="input-100">
                <option value="">Select destination type…</option>
                {objectTypes.filter(t => t.id !== switchTypeTarget.id && !t.isHidden).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button onClick={() => setSwitchTypeTarget(null)}>Cancel</button>
              <button onClick={async () => {
                if (!switchTypeReplacementId) { toast('Pick a destination type', 'error'); return }
                const changed = await window.ipcRenderer.invoke('gamedocs:bulk-reassign-type', campaignId, switchTypeTarget.id, switchTypeReplacementId).catch(() => 0)
                setSwitchTypeTarget(null)
                toast(`Updated ${Number(changed || 0)} object(s).`, 'success')
                await onRefreshCatalog()
                await onAfterSwitch()
              }}>Apply switch</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default TypeManagerModal

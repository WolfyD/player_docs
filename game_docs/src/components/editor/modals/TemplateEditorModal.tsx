/**
 * editor/modals/TemplateEditorModal.tsx
 *
 * The template definition editor — a wide modal with two modes:
 *
 * Visual mode (default): a three-panel drag-and-drop builder.
 *  - Left palette: "Add field" buttons for each field type.
 *  - Centre canvas: draggable field nodes with inline up/down ordering.
 *  - Right props panel: edit the selected field's label, type, placeholder, etc.
 *  Below the builder a live preview card and a style-block editor are shown.
 *
 * Raw/source mode: two plain textareas for the source template and optional CSS.
 *
 * Both modes remain in sync: switching from raw to visual parses the source
 * text back into field objects; switching from visual to raw compiles the
 * canvas to source text.
 */

import React from 'react'
import { createStyleBlock, createStyleDecl } from '../templateEngine'
import { CSS_PROPERTY_OPTIONS } from '../constants'
import type { TemplateStyleBlock, TemplateVisualField } from '../types'

interface TemplateEditorModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Non-null when editing an existing template; null for a new one. */
  templateEditId: string | null
  templateNameInput: string
  templateSourceInput: string
  templateCssInput: string
  templateRawMode: boolean
  templateRawError: string | null
  templateVisualFields: TemplateVisualField[]
  templateLayoutColumns: number
  templateCardClassInput: string
  templateStyleBlocks: TemplateStyleBlock[]
  templateSelectedFieldId: string | null
  templateDragFieldId: string | null
  setTemplateName: (v: string) => void
  setTemplateSource: (v: string) => void
  setTemplateCss: (v: string) => void
  setTemplateCardClassInput: (v: string) => void
  setTemplateStyleBlocks: React.Dispatch<React.SetStateAction<TemplateStyleBlock[]>>
  setTemplateVisualFields: React.Dispatch<React.SetStateAction<TemplateVisualField[]>>
  setTemplateSelectedFieldId: (id: string | null) => void
  setTemplateDragFieldId: (id: string | null) => void
  onToggleMode: () => void
  onAddField: (parentId: string | null, type: TemplateVisualField['type']) => void
  onRemoveField: (id: string) => void
  onMoveField: (id: string, dir: -1 | 1) => void
  getTemplateChildren: (parentId: string | null) => TemplateVisualField[]
  onClose: () => void
  onSave: () => void
}

/** Full-featured template definition editor with visual builder and raw source mode. */
const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  visible,
  templateEditId, templateNameInput, templateSourceInput, templateCssInput,
  templateRawMode, templateRawError, templateVisualFields, templateLayoutColumns,
  templateCardClassInput, templateStyleBlocks, templateSelectedFieldId, templateDragFieldId,
  setTemplateName, setTemplateSource, setTemplateCss, setTemplateCardClassInput,
  setTemplateStyleBlocks, setTemplateVisualFields, setTemplateSelectedFieldId, setTemplateDragFieldId,
  onToggleMode, onAddField, onRemoveField, onMoveField, getTemplateChildren,
  onClose, onSave,
}) => {
  if (!visible) return null

  /** Recursively renders the drag-and-drop canvas for a given parent context. */
  const renderBuilderCanvas = (parentId: string | null, depth: number): React.ReactNode => {
    const nodes = getTemplateChildren(parentId)
    return nodes.map(f => (
      <div
        key={f.id}
        className={`template-builder-node ${templateSelectedFieldId === f.id ? 'active' : ''}`}
        style={{ marginLeft: depth * 14 }}
        draggable
        onDragStart={() => setTemplateDragFieldId(f.id)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => {
          if (!templateDragFieldId || templateDragFieldId === f.id) return
          setTemplateVisualFields(prev => {
            const dragged = prev.find(x => x.id === templateDragFieldId)
            const target = prev.find(x => x.id === f.id)
            if (!dragged || !target) return prev
            if ((dragged.parentId || null) !== (target.parentId || null)) return prev
            return prev.map(x => {
              if (x.id === dragged.id) return { ...x, order: target.order }
              if (x.id === target.id) return { ...x, order: dragged.order }
              return x
            })
          })
          setTemplateDragFieldId(null)
        }}
        onDragEnd={() => setTemplateDragFieldId(null)}
        onClick={() => setTemplateSelectedFieldId(f.id)}
      >
        <div className="template-builder-node-header">
          <span><strong>{f.label || '(unnamed)'}</strong> <span className="muted">[{f.type}]</span></span>
          <div className="flex-gap-6">
            <button onClick={e => { e.stopPropagation(); onMoveField(f.id, -1) }}>↑</button>
            <button onClick={e => { e.stopPropagation(); onMoveField(f.id, 1) }}>↓</button>
            <button onClick={e => { e.stopPropagation(); onRemoveField(f.id) }}>Remove</button>
          </div>
        </div>
        {f.type === 'div' && (
          <div className="actions mt-6">
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'text') }}>+ Text</button>
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'richtext') }}>+ Rich Text</button>
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'textarea') }}>+ Long Text</button>
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'image') }}>+ Image</button>
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'attachment') }}>+ Attachment</button>
            <button onClick={e => { e.stopPropagation(); onAddField(f.id, 'div') }}>+ Group</button>
          </div>
        )}
        {renderBuilderCanvas(f.id, depth + 1)}
      </div>
    ))
  }

  /** Recursively renders the live preview card for the current canvas state. */
  const renderPreview = (parentId: string | null): React.ReactNode => {
    const nodes = getTemplateChildren(parentId)
    return nodes.map(f => {
      if (f.type === 'div') {
        return (
          <div key={`preview_${f.id}`} className={`template-field-group ${f.className || ''}`.trim()}>
            <div className="template-field-group-title">{f.label || 'Group'}</div>
            {renderPreview(f.id)}
          </div>
        )
      }
      return (
        <div key={`preview_${f.id}`} className={`template-field-row ${f.className || ''}`.trim()}>
          <span className="template-field-label">{f.label || '(unnamed field)'}:</span>{' '}
          <span className="muted">{f.placeholder || `[${f.type}]`}{f.required ? ' *' : ''}</span>
        </div>
      )
    })
  }

  const selected = templateVisualFields.find(f => f.id === templateSelectedFieldId) || null

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dialog-card w-p80 overflow-y-scroll h-p95">
        <h3 className="mt-0">{templateEditId ? 'Edit Template' : 'New Template'}</h3>
        <div className="grid-gap-8">
          <label>
            <div>Name</div>
            <input autoFocus value={templateNameInput} onChange={e => setTemplateName(e.target.value)} className="input-100" />
          </label>

          {!templateRawMode ? (
            <>
              <div className="boxed">
                <div className="box-title">Visual Builder</div>
                <div className="template-builder-grid">
                  {/* Left palette */}
                  <div className="template-builder-palette">
                    <div className="muted">Drag is for ordering. Use blocks below to add new items.</div>
                    <input
                      className="input-100"
                      placeholder="Card class (optional)"
                      value={templateCardClassInput}
                      onChange={e => setTemplateCardClassInput(e.target.value)}
                    />
                    <div className="actions">
                      <button onClick={() => onAddField(null, 'text')}>+ Text</button>
                      <button onClick={() => onAddField(null, 'richtext')}>+ Rich Text</button>
                      <button onClick={() => onAddField(null, 'textarea')}>+ Long Text</button>
                      <button onClick={() => onAddField(null, 'image')}>+ Image</button>
                      <button onClick={() => onAddField(null, 'attachment')}>+ Attachment</button>
                      <button onClick={() => onAddField(null, 'div')}>+ Group</button>
                    </div>
                  </div>

                  {/* Centre canvas */}
                  <div className="template-builder-canvas">
                    {templateVisualFields.length === 0 ? (
                      <div className="muted">No fields yet. Add one from the left panel.</div>
                    ) : (
                      renderBuilderCanvas(null, 0)
                    )}
                  </div>

                  {/* Right props panel */}
                  <div className="template-builder-props">
                    {!selected ? (
                      <div className="muted">Select a field on the canvas to edit its properties.</div>
                    ) : (
                      <div className="grid-gap-8">
                        <div className="box-title">Field Properties</div>
                        <label>
                          <div>Type</div>
                          <select
                            value={selected.type}
                            onChange={e => setTemplateVisualFields(prev => prev.map(x => x.id === selected.id ? { ...x, type: e.target.value as any } : x))}
                            className="input-100"
                          >
                            <option value="text">Text</option>
                            <option value="richtext">Rich text</option>
                            <option value="textarea">Long text</option>
                            <option value="image">Image</option>
                            <option value="attachment">Attachment</option>
                            <option value="div">Div / Group</option>
                          </select>
                        </label>
                        <label>
                          <div>{selected.type === 'div' ? 'Group name' : 'Label'}</div>
                          <input
                            value={selected.label}
                            onChange={e => setTemplateVisualFields(prev => prev.map(x => x.id === selected.id ? { ...x, label: e.target.value } : x))}
                            className="input-100"
                          />
                        </label>
                        {selected.type !== 'div' && (
                          <label>
                            <div>Placeholder</div>
                            <input
                              value={selected.placeholder}
                              onChange={e => setTemplateVisualFields(prev => prev.map(x => x.id === selected.id ? { ...x, placeholder: e.target.value } : x))}
                              className="input-100"
                            />
                          </label>
                        )}
                        <label>
                          <div>Class name</div>
                          <input
                            value={selected.className}
                            onChange={e => setTemplateVisualFields(prev => prev.map(x => x.id === selected.id ? { ...x, className: e.target.value } : x))}
                            className="input-100"
                          />
                        </label>
                        {selected.type !== 'div' && (
                          <label className="items-center flex-gap-6">
                            <input
                              type="checkbox"
                              checked={selected.required}
                              onChange={e => setTemplateVisualFields(prev => prev.map(x => x.id === selected.id ? { ...x, required: e.target.checked } : x))}
                            />
                            Required
                          </label>
                        )}
                        <div className="actions">
                          <button onClick={() => onRemoveField(selected.id)}>Delete field</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div className="boxed">
                <div className="box-title">Live Preview</div>
                <div className={`template-instance-card ${templateCardClassInput || ''}`.trim()}>
                  <div className="template-instance-header">{templateNameInput || 'Template Preview'}</div>
                  {templateVisualFields.length === 0 ? (
                    <div className="muted">Add fields to preview the template.</div>
                  ) : (
                    renderPreview(null)
                  )}
                </div>
              </div>

              {/* Style block editor */}
              <div className="boxed">
                <div className="box-title">Styles</div>
                <div className="actions">
                  <button onClick={() => setTemplateStyleBlocks(prev => [...prev, createStyleBlock()])}>Add style block</button>
                </div>
                {templateStyleBlocks.length === 0 ? (
                  <div className="muted">No style blocks yet. Add one to define class styles.</div>
                ) : (
                  <div className="grid-gap-8 mt-10">
                    {templateStyleBlocks.map(block => (
                      <div key={block.id} className="boxed">
                        <div className="flex-row">
                          <select
                            value={block.className || ''}
                            onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, className: e.target.value } : b))}
                          >
                            <option value="">Select class</option>
                            {Array.from(new Set([
                              ...(templateCardClassInput ? [templateCardClassInput] : []),
                              ...templateVisualFields.map(f => (f.className || '').trim()).filter(Boolean),
                            ])).map(cls => <option key={cls} value={cls}>{cls}</option>)}
                            <option value="__custom__">Custom...</option>
                          </select>
                          {block.className === '__custom__' && (
                            <input
                              className="flex-1"
                              placeholder="custom_class"
                              value={block.customClassName}
                              onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, customClassName: e.target.value } : b))}
                            />
                          )}
                          <select
                            value={block.modifier}
                            onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, modifier: e.target.value as any } : b))}
                          >
                            <option value="">(no modifier)</option>
                            <option value=":hover">:hover</option>
                            <option value=":active">:active</option>
                            <option value=":focus">:focus</option>
                            <option value="::before">::before</option>
                            <option value="::after">::after</option>
                          </select>
                          <button onClick={() => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, rawMode: !b.rawMode } : b))}>
                            {block.rawMode ? 'Property mode' : 'Edit raw'}
                          </button>
                          <button onClick={() => setTemplateStyleBlocks(prev => prev.filter(b => b.id !== block.id))}>Remove block</button>
                        </div>
                        {block.rawMode ? (
                          <textarea
                            className="new-child-description input-100 mt-10"
                            value={block.rawCss}
                            onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, rawCss: e.target.value } : b))}
                          />
                        ) : (
                          <div className="grid-gap-8 mt-10">
                            <datalist id="css-property-options">
                              {CSS_PROPERTY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </datalist>
                            {block.declarations.map(d => (
                              <div key={d.id} className="flex-row">
                                <input
                                  className="flex-1"
                                  list="css-property-options"
                                  placeholder="property (e.g. margin-top or custom-prop)"
                                  value={d.property}
                                  onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, declarations: b.declarations.map(x => x.id === d.id ? { ...x, property: e.target.value } : x) } : b))}
                                />
                                <input
                                  className="flex-1"
                                  placeholder="value"
                                  value={d.value}
                                  onChange={e => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, declarations: b.declarations.map(x => x.id === d.id ? { ...x, value: e.target.value } : x) } : b))}
                                />
                                <button onClick={() => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, declarations: b.declarations.filter(x => x.id !== d.id) } : b))}>-</button>
                              </div>
                            ))}
                            <div className="muted">Use the property box as searchable/custom input. You can type any CSS property name.</div>
                            <div>
                              <button onClick={() => setTemplateStyleBlocks(prev => prev.map(b => b.id === block.id ? { ...b, declarations: [...b.declarations, createStyleDecl()] } : b))}>Add style</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <label>
              <div>Template Source (tokens like {'{%text:"Name"}'})</div>
              <textarea
                value={templateSourceInput}
                onChange={e => setTemplateSource(e.target.value)}
                className="new-child-description input-100"
              />
            </label>
          )}

          {templateRawMode && (
            <label>
              <div>Style CSS (optional)</div>
              <textarea
                value={templateCssInput}
                onChange={e => setTemplateCss(e.target.value)}
                className="new-child-description input-100"
              />
            </label>
          )}

          {templateRawMode && templateRawError && (
            <div className="text-tomato">{templateRawError}</div>
          )}

          <div className="muted">
            {templateRawMode
              ? 'Advanced source mode is enabled; edit source directly.'
              : `Generated source preview: ${templateSourceInput || '(empty)'}`}
          </div>
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={onToggleMode}>{templateRawMode ? 'Visual mode' : 'Advanced source mode'}</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default TemplateEditorModal

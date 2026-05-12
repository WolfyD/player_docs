/**
 * editor/useTemplateEditor.ts
 *
 * Custom hook that owns all state and operations for the template definition
 * editor and the template instance workflow.
 *
 * Responsibilities:
 *  - Template definition list (`templateDefs`) and instance list
 *    (`templateInstances`) for the active object.
 *  - Visual canvas state: fields, style blocks, selected/dragged field ids,
 *    layout columns, card CSS class.
 *  - Raw vs visual mode toggling with deterministic sync (visual → raw compiles
 *    the source; raw → visual parses tokens back into fields).
 *  - Template instance editor form state.
 *  - Template instance library (cross-object) state.
 *
 * Cross-cutting operations that also require `editorRef` or the active-object
 * navigation state (like `handleInsertTemplateInstance`) are intentionally left
 * in Editor.tsx; this hook exposes the state they need through setters and
 * returns `loadTemplates` / `loadObjectScopedData` so those operations can be
 * composed in the parent.
 *
 * Exports:
 *  - useTemplateEditor(campaignId)  → all template state, setters, and callbacks
 */

import { useCallback, useEffect, useState } from 'react'
import {
  buildCssFromStyleBlocks,
  buildTemplateSourceFromVisual,
  createVisualField,
  normalizeTemplateFields,
  parseCssToStyleBlocks,
  parseTemplateMeta,
  parseTemplateFields,
  parseVisualFieldsFromRawSource,
} from './templateEngine'
import type { Attachment, TemplateDef, TemplateInstance, TemplateInstanceLibraryRow, TemplateStyleBlock, TemplateVisualField } from './types'

export interface UseTemplateEditorReturn {
  templateDefs: TemplateDef[]
  setTemplateDefs: React.Dispatch<React.SetStateAction<TemplateDef[]>>
  templateInstances: TemplateInstance[]
  setTemplateInstances: React.Dispatch<React.SetStateAction<TemplateInstance[]>>
  attachments: Attachment[]
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  templatePickerOpen: boolean
  setTemplatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  templateInstanceLibraryOpen: boolean
  setTemplateInstanceLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>
  templateInstanceLibraryRows: TemplateInstanceLibraryRow[]
  templateEditorOpen: boolean
  setTemplateEditorOpen: React.Dispatch<React.SetStateAction<boolean>>
  templateEditId: string | null
  templateNameInput: string
  setTemplateNameInput: React.Dispatch<React.SetStateAction<string>>
  templateSourceInput: string
  setTemplateSourceInput: React.Dispatch<React.SetStateAction<string>>
  templateCssInput: string
  setTemplateCssInput: React.Dispatch<React.SetStateAction<string>>
  templateRawMode: boolean
  setTemplateRawMode: React.Dispatch<React.SetStateAction<boolean>>
  templateRawError: string | null
  setTemplateRawError: React.Dispatch<React.SetStateAction<string | null>>
  templateVisualFields: TemplateVisualField[]
  setTemplateVisualFields: React.Dispatch<React.SetStateAction<TemplateVisualField[]>>
  templateLayoutColumns: number
  setTemplateLayoutColumns: React.Dispatch<React.SetStateAction<number>>
  templateCardClassInput: string
  setTemplateCardClassInput: React.Dispatch<React.SetStateAction<string>>
  templateStyleBlocks: TemplateStyleBlock[]
  setTemplateStyleBlocks: React.Dispatch<React.SetStateAction<TemplateStyleBlock[]>>
  templateSelectedFieldId: string | null
  setTemplateSelectedFieldId: React.Dispatch<React.SetStateAction<string | null>>
  templateDragFieldId: string | null
  setTemplateDragFieldId: React.Dispatch<React.SetStateAction<string | null>>
  templateInstanceEditor: { open: boolean; instance: TemplateInstance | null; values: Record<string, string> }
  setTemplateInstanceEditor: React.Dispatch<React.SetStateAction<{ open: boolean; instance: TemplateInstance | null; values: Record<string, string> }>>
  /** Reloads template definitions from the database, seeding defaults first. */
  loadTemplates: () => Promise<void>
  /** Loads attachments and template instances for a specific object. */
  loadObjectScopedData: (objectId: string) => Promise<void>
  /** Loads the cross-campaign template instance library rows. */
  loadTemplateInstanceLibrary: () => Promise<void>
  /** Persists the currently open template definition to the database. */
  saveTemplateDefinition: () => Promise<void>
  /** Opens the template editor form, optionally pre-filled with an existing definition. */
  openTemplateEditor: (tpl?: TemplateDef | null) => void
  /** Opens the instance library modal and fetches its data. */
  openTemplateInstanceLibrary: () => Promise<void>
  /** Returns child fields for a given parent id, sorted by `order`. */
  getTemplateChildren: (parentId: string | null) => TemplateVisualField[]
  /** Appends a new field of `type` under `parentId` to the visual canvas. */
  addTemplateField: (parentId: string | null, type: TemplateVisualField['type']) => void
  /** Removes a field and all of its descendants from the visual canvas. */
  removeTemplateField: (fieldId: string) => void
  /** Swaps a field with its adjacent sibling in `dir` direction (-1 up / 1 down). */
  moveTemplateField: (fieldId: string, dir: -1 | 1) => void
  /** Toggles between raw-source and visual-canvas editing modes.
   *  Going raw → compiles the canvas to source.
   *  Going visual → parses tokens from source back into field objects. */
  toggleTemplateMode: () => void
  /** Opens the instance editor for a specific template instance by id. */
  openTemplateInstanceEditor: (instanceId: string) => void
}

// Needed for the return type annotation above
import type React from 'react'

/**
 * Manages the full template lifecycle for a campaign.
 *
 * @param campaignId  The active campaign's id; used for the instance library
 *                    query. May be `undefined` before the campaign is loaded.
 */
export function useTemplateEditor(campaignId: string | undefined): UseTemplateEditorReturn {
  const [templateDefs, setTemplateDefs] = useState<TemplateDef[]>([])
  const [templateInstances, setTemplateInstances] = useState<TemplateInstance[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateInstanceLibraryOpen, setTemplateInstanceLibraryOpen] = useState(false)
  const [templateInstanceLibraryRows, setTemplateInstanceLibraryRows] = useState<TemplateInstanceLibraryRow[]>([])
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [templateEditId, setTemplateEditId] = useState<string | null>(null)
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [templateSourceInput, setTemplateSourceInput] = useState('')
  const [templateCssInput, setTemplateCssInput] = useState('')
  const [templateRawMode, setTemplateRawMode] = useState(false)
  const [templateRawError, setTemplateRawError] = useState<string | null>(null)
  const [templateVisualFields, setTemplateVisualFields] = useState<TemplateVisualField[]>([])
  const [templateLayoutColumns, setTemplateLayoutColumns] = useState<number>(1)
  const [templateCardClassInput, setTemplateCardClassInput] = useState('')
  const [templateStyleBlocks, setTemplateStyleBlocks] = useState<TemplateStyleBlock[]>([])
  const [templateSelectedFieldId, setTemplateSelectedFieldId] = useState<string | null>(null)
  const [templateDragFieldId, setTemplateDragFieldId] = useState<string | null>(null)
  const [templateInstanceEditor, setTemplateInstanceEditor] = useState<{
    open: boolean; instance: TemplateInstance | null; values: Record<string, string>
  }>({ open: false, instance: null, values: {} })

  /** Seeds default templates if none exist, then loads the full list. */
  const loadTemplates = useCallback(async () => {
    await window.ipcRenderer.invoke('gamedocs:seed-default-templates').catch(() => null)
    const defs = await window.ipcRenderer.invoke('gamedocs:list-templates').catch(() => []) as TemplateDef[]
    setTemplateDefs(defs || [])
  }, [])

  /** Fetches the cross-campaign template instance library for the current
   *  campaign and stores the results. */
  const loadTemplateInstanceLibrary = useCallback(async () => {
    if (!campaignId) return
    const rows = await window.ipcRenderer.invoke('gamedocs:list-template-instances-all', campaignId).catch(() => []) as TemplateInstanceLibraryRow[]
    setTemplateInstanceLibraryRows(rows || [])
  }, [campaignId])

  /** Loads all attachments and template instances for the given object in
   *  parallel, replacing the existing local lists. */
  const loadObjectScopedData = useCallback(async (objectId: string) => {
    const [atts, tins] = await Promise.all([
      window.ipcRenderer.invoke('gamedocs:list-object-attachments', objectId).catch(() => []),
      window.ipcRenderer.invoke('gamedocs:list-template-instances', objectId).catch(() => []),
    ])
    setAttachments((atts || []) as Attachment[])
    setTemplateInstances((tins || []) as TemplateInstance[])
  }, [])

  /**
   * Builds the payload from the current editor form state and saves the
   * template definition.  Handles both visual and raw modes, serializing the
   * appropriate source and fields_json before sending to the main process.
   */
  const saveTemplateDefinition = useCallback(async () => {
    const name = (templateNameInput || '').trim()
    if (!name) return
    const source = templateRawMode
      ? (templateSourceInput || '')
      : buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    const fields = templateRawMode
      ? parseTemplateFields(source).map((f, idx) => ({ ...f, id: `tvf_${idx}`, className: '', parentId: null, order: idx }))
      : templateVisualFields
          .filter(f => (f.label || '').trim())
          .map(f => ({ id: f.id, type: f.type, label: f.label.trim(), placeholder: f.placeholder || '', required: !!f.required, className: f.className || '', parentId: f.parentId || null, order: f.order }))
    const cardClass = (templateCardClassInput || '').trim()
    const fieldsPayload = {
      version: 3,
      cardClass,
      fields: fields.map((f: any) => ({
        ...f,
        className: typeof f.className === 'string' ? f.className.trim() : ''
      })),
    }
    const effectiveCss = templateRawMode ? (templateCssInput || null) : (buildCssFromStyleBlocks(templateStyleBlocks) || null)
    const payload = {
      id: templateEditId || undefined,
      name,
      source,
      style_css: effectiveCss,
      fields_json: JSON.stringify(fieldsPayload),
    }
    const res = await window.ipcRenderer.invoke('gamedocs:save-template', payload).catch(() => null)
    if (res?.id) {
      await loadTemplates()
      setTemplateEditorOpen(false)
      setTemplateEditId(null)
      setTemplateNameInput('')
      setTemplateSourceInput('')
      setTemplateCssInput('')
      setTemplateVisualFields([])
      setTemplateLayoutColumns(1)
      setTemplateCardClassInput('')
      setTemplateStyleBlocks([])
      const { toast } = await import('../Confirm')
      toast('Template saved', 'success')
    }
  }, [
    buildCssFromStyleBlocks, buildTemplateSourceFromVisual, loadTemplates,
    parseTemplateFields, templateCardClassInput, templateCssInput, templateEditId,
    templateLayoutColumns, templateNameInput, templateRawMode, templateSourceInput,
    templateStyleBlocks, templateVisualFields,
  ])

  /**
   * Opens the template editor form.  When a `tpl` is provided the form is
   * pre-filled with the existing definition's data; when omitted a blank form
   * is shown for creating a new template.
   */
  const openTemplateEditor = useCallback((tpl?: TemplateDef | null) => {
    setTemplateEditId(tpl?.id || null)
    setTemplateNameInput(tpl?.name || '')
    setTemplateSourceInput(tpl?.source || '')
    setTemplateCssInput(tpl?.style_css || '')
    const meta = parseTemplateMeta(tpl?.fields_json || '[]')
    let parsedFields: Array<{ id?: string; type?: string; label?: string; placeholder?: string; required?: boolean; className?: string; parentId?: string | null; order?: number }> = meta.fields
    if (!Array.isArray(parsedFields) || parsedFields.length === 0) parsedFields = parseTemplateFields(tpl?.source || '')
    setTemplateVisualFields(normalizeTemplateFields(parsedFields.map((f, idx) => ({
      id: f.id || `tvf_${idx}`,
      type: ((f.type as any) || 'text'),
      label: String(f.label || ''),
      placeholder: String((f as any).placeholder || ''),
      required: !!(f as any).required,
      className: String((f as any).className || ''),
      parentId: (f as any).parentId ?? null,
      order: typeof (f as any).order === 'number' ? (f as any).order : idx,
    }))))
    setTemplateCardClassInput(meta.cardClass || '')
    setTemplateStyleBlocks(parseCssToStyleBlocks(tpl?.style_css || ''))
    setTemplateLayoutColumns(1)
    setTemplateRawMode(false)
    setTemplateRawError(null)
    setTemplateSelectedFieldId(null)
    setTemplateDragFieldId(null)
    setTemplateEditorOpen(true)
  }, [])

  /** Fetches the instance library data and opens the library modal. */
  const openTemplateInstanceLibrary = useCallback(async () => {
    await loadTemplateInstanceLibrary()
    setTemplateInstanceLibraryOpen(true)
  }, [loadTemplateInstanceLibrary])

  /** Returns sorted child fields of the given parent id from the visual canvas. */
  const getTemplateChildren = useCallback((parentId: string | null) => {
    return templateVisualFields
      .filter(f => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.order - b.order)
  }, [templateVisualFields])

  /** Adds a new field of the given type under `parentId` on the visual canvas. */
  const addTemplateField = useCallback((parentId: string | null, type: TemplateVisualField['type']) => {
    setTemplateVisualFields(prev => {
      const siblings = prev.filter(f => (f.parentId || null) === (parentId || null))
      const nextOrder = siblings.length ? Math.max(...siblings.map(s => s.order)) + 1 : 0
      const next = createVisualField({ type, parentId, order: nextOrder, label: type === 'div' ? 'Group' : `Field ${prev.length + 1}` })
      setTemplateSelectedFieldId(next.id)
      return [...prev, next]
    })
  }, [])

  /** Removes a field and its entire descendant subtree from the visual canvas.
   *  If the removed field is currently selected, clears the selection. */
  const removeTemplateField = useCallback((fieldId: string) => {
    setTemplateVisualFields(prev => {
      const removeIds = new Set<string>([fieldId])
      let changed = true
      while (changed) {
        changed = false
        for (const f of prev) {
          if (f.parentId && removeIds.has(f.parentId) && !removeIds.has(f.id)) {
            removeIds.add(f.id); changed = true
          }
        }
      }
      if (templateSelectedFieldId && removeIds.has(templateSelectedFieldId)) {
        setTemplateSelectedFieldId(null)
      }
      return prev.filter(f => !removeIds.has(f.id))
    })
  }, [templateSelectedFieldId])

  /** Swaps a field with the sibling at `dir` offset within the same parent.
   *  Does nothing if the field is already at the boundary. */
  const moveTemplateField = useCallback((fieldId: string, dir: -1 | 1) => {
    setTemplateVisualFields(prev => {
      const current = prev.find(f => f.id === fieldId)
      if (!current) return prev
      const siblings = prev.filter(f => (f.parentId || null) === (current.parentId || null)).sort((a, b) => a.order - b.order)
      const idx = siblings.findIndex(s => s.id === fieldId)
      const swapIdx = idx + dir
      if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return prev
      const a = siblings[idx]
      const b = siblings[swapIdx]
      return prev.map(f => {
        if (f.id === a.id) return { ...f, order: b.order }
        if (f.id === b.id) return { ...f, order: a.order }
        return f
      })
    })
  }, [])

  /**
   * Toggles between raw-source and visual-canvas editing modes.
   *
   * Raw → Visual: parses the raw source text back into TemplateVisualField
   *   objects and also parses the CSS input into style blocks.  Sets a user-
   *   visible error and aborts if no tokens are found.
   *
   * Visual → Raw: compiles the canvas to source text and the style blocks to
   *   CSS, then switches to the text editors.
   */
  const toggleTemplateMode = useCallback(() => {
    if (templateRawMode) {
      try {
        const nextVisual = parseVisualFieldsFromRawSource(templateSourceInput)
        setTemplateVisualFields(nextVisual)
        if (templateCssInput.trim()) {
          setTemplateStyleBlocks(parseCssToStyleBlocks(templateCssInput))
        }
        setTemplateRawError(null)
        setTemplateRawMode(false)
      } catch (error: any) {
        setTemplateRawError(error?.message || 'Failed to parse raw template source.')
      }
      return
    }
    const generatedSource = buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    setTemplateSourceInput(generatedSource)
    setTemplateCssInput(buildCssFromStyleBlocks(templateStyleBlocks))
    setTemplateRawError(null)
    setTemplateRawMode(true)
  }, [
    buildCssFromStyleBlocks, buildTemplateSourceFromVisual, parseCssToStyleBlocks,
    parseVisualFieldsFromRawSource, templateCssInput, templateLayoutColumns,
    templateNameInput, templateRawMode, templateSourceInput, templateStyleBlocks,
    templateVisualFields,
  ])

  /** Opens the instance editor modal for the specified instance id. */
  const openTemplateInstanceEditor = useCallback((instanceId: string) => {
    const inst = templateInstances.find(t => t.id === instanceId) || null
    if (!inst) return
    let values: Record<string, string> = {}
    try { values = JSON.parse(inst.values_json || '{}') } catch {}
    setTemplateInstanceEditor({ open: true, instance: inst, values })
  }, [templateInstances])

  /** Initial template load on mount. */
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  /** Injects all template CSS definitions as a single `<style>` tag on the page
   *  so template card classes are available globally in the editor surface. */
  useEffect(() => {
    const styleId = 'pd-template-user-styles'
    let st = document.getElementById(styleId) as HTMLStyleElement | null
    const css = (templateDefs || [])
      .map(t => (t.style_css || '').trim())
      .filter(Boolean)
      .join('\n\n')
    if (!st) {
      st = document.createElement('style')
      st.id = styleId
      document.head.appendChild(st)
    }
    st.textContent = css
  }, [templateDefs])

  /** Keeps the raw source input in sync with the visual canvas while the editor
   *  is open in visual mode. Does nothing in raw mode to avoid overwriting user
   *  edits. */
  useEffect(() => {
    if (!templateEditorOpen || templateRawMode) return
    const generated = buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    setTemplateSourceInput(generated)
  }, [templateEditorOpen, templateLayoutColumns, templateNameInput, templateRawMode, templateVisualFields])

  return {
    templateDefs, setTemplateDefs,
    templateInstances, setTemplateInstances,
    attachments, setAttachments,
    templatePickerOpen, setTemplatePickerOpen,
    templateInstanceLibraryOpen, setTemplateInstanceLibraryOpen,
    templateInstanceLibraryRows,
    templateEditorOpen, setTemplateEditorOpen,
    templateEditId,
    templateNameInput, setTemplateNameInput,
    templateSourceInput, setTemplateSourceInput,
    templateCssInput, setTemplateCssInput,
    templateRawMode, setTemplateRawMode,
    templateRawError, setTemplateRawError,
    templateVisualFields, setTemplateVisualFields,
    templateLayoutColumns, setTemplateLayoutColumns,
    templateCardClassInput, setTemplateCardClassInput,
    templateStyleBlocks, setTemplateStyleBlocks,
    templateSelectedFieldId, setTemplateSelectedFieldId,
    templateDragFieldId, setTemplateDragFieldId,
    templateInstanceEditor, setTemplateInstanceEditor,
    loadTemplates,
    loadObjectScopedData,
    loadTemplateInstanceLibrary,
    saveTemplateDefinition,
    openTemplateEditor,
    openTemplateInstanceLibrary,
    getTemplateChildren,
    addTemplateField,
    removeTemplateField,
    moveTemplateField,
    toggleTemplateMode,
    openTemplateInstanceEditor,
  }
}

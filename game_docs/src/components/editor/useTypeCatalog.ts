/**
 * editor/useTypeCatalog.ts
 *
 * Custom hook that owns all state and operations for the object-type system:
 * loading the type catalog from the database, CRUD operations for type records,
 * icon picker state, tag autocomplete, and the delete/switch-type confirmation
 * flow.
 *
 * The hook is parameterised by `campaignId` so it can refetch the catalog
 * whenever the user switches campaigns. Cross-cutting operations that require
 * access to the active object (such as the full close sequence that re-selects
 * the current object) are exposed via simple state accessors; the caller
 * (Editor.tsx) composes them with its own navigation logic.
 *
 * Exports:
 *  - useTypeCatalog(campaignId)  → all type state, setters, and callbacks
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ALL_REMIX_ICONS } from './constants'
import type { ObjectType, TypeTag } from './types'

export interface UseTypeCatalogReturn {
  objectTypes: ObjectType[]
  setObjectTypes: React.Dispatch<React.SetStateAction<ObjectType[]>>
  showTypeManager: boolean
  setShowTypeManager: React.Dispatch<React.SetStateAction<boolean>>
  typeEditorOpen: boolean
  setTypeEditorOpen: React.Dispatch<React.SetStateAction<boolean>>
  typeEditorIsNew: boolean
  typeEditorErr: string | null
  setTypeEditorErr: React.Dispatch<React.SetStateAction<string | null>>
  typeEditorId: string
  typeEditorName: string
  setTypeEditorName: React.Dispatch<React.SetStateAction<string>>
  typeEditorIcon: string
  setTypeEditorIcon: React.Dispatch<React.SetStateAction<string>>
  typeIconQuery: string
  setTypeIconQuery: React.Dispatch<React.SetStateAction<string>>
  typeEditorTags: string[]
  setTypeEditorTags: React.Dispatch<React.SetStateAction<string[]>>
  typeTagInput: string
  setTypeTagInput: React.Dispatch<React.SetStateAction<string>>
  typeTagSuggestions: Array<{ id: string; name: string }>
  deleteTypeTarget: ObjectType | null
  setDeleteTypeTarget: React.Dispatch<React.SetStateAction<ObjectType | null>>
  deleteTypeReplacementId: string
  setDeleteTypeReplacementId: React.Dispatch<React.SetStateAction<string>>
  deleteTypeItems: Array<{ id: string; name: string }>
  setDeleteTypeItems: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>
  switchTypeTarget: ObjectType | null
  setSwitchTypeTarget: React.Dispatch<React.SetStateAction<ObjectType | null>>
  switchTypeReplacementId: string
  setSwitchTypeReplacementId: React.Dispatch<React.SetStateAction<string>>
  /** Remix icon class names filtered by `typeIconQuery`, capped at 240 results. */
  filteredRemixIcons: string[]
  /** Reloads the type list from the database. */
  refreshTypeCatalog: () => Promise<void>
  /** Looks up a type by its id or name (case-insensitive). */
  getTypeByValue: (value: string | null | undefined) => ObjectType | undefined
  /** Returns visible types, optionally including the currently selected one even
   *  if it is hidden in this campaign. */
  getSelectableTypes: (currentValue?: string) => ObjectType[]
  /** Opens the type editor form to create a new type. */
  openNewTypeEditor: () => void
  /** Opens the type editor form pre-filled with an existing type's data. */
  openEditTypeEditor: (typeRow: ObjectType) => void
  /** Appends a tag name to the draft tag list for the type being edited,
   *  deduplicating case-insensitively. */
  addTypeTagDraft: (rawValue: string) => void
}

// Needed for the return type annotation above
import type React from 'react'

/**
 * Loads and manages the global object-type catalog for the given campaign.
 *
 * @param campaignId  The active campaign's id, used for visibility filtering via
 *                    `campaign_hidden_types`. Pass `undefined` when no campaign
 *                    is loaded yet — the hook will no-op until it is provided.
 */
export function useTypeCatalog(campaignId: string | undefined): UseTypeCatalogReturn {
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([])
  const [showTypeManager, setShowTypeManager] = useState(false)
  const [typeEditorOpen, setTypeEditorOpen] = useState(false)
  const [typeEditorIsNew, setTypeEditorIsNew] = useState(false)
  const [typeEditorErr, setTypeEditorErr] = useState<string | null>(null)
  const [typeEditorId, setTypeEditorId] = useState<string>('')
  const [typeEditorName, setTypeEditorName] = useState<string>('')
  const [typeEditorIcon, setTypeEditorIcon] = useState<string>('ri-price-tag-3-line')
  const [typeIconQuery, setTypeIconQuery] = useState<string>('')
  const [typeEditorTags, setTypeEditorTags] = useState<string[]>([])
  const [typeTagInput, setTypeTagInput] = useState<string>('')
  const [typeTagSuggestions, setTypeTagSuggestions] = useState<Array<{ id: string; name: string }>>([])
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<ObjectType | null>(null)
  const [deleteTypeReplacementId, setDeleteTypeReplacementId] = useState<string>('')
  const [deleteTypeItems, setDeleteTypeItems] = useState<Array<{ id: string; name: string }>>([])
  const [switchTypeTarget, setSwitchTypeTarget] = useState<ObjectType | null>(null)
  const [switchTypeReplacementId, setSwitchTypeReplacementId] = useState<string>('')

  /** Remix icon names filtered by the current search query, capped at 240 to
   *  keep the picker grid performant. */
  const filteredRemixIcons = useMemo(() => {
    const q = typeIconQuery.trim().toLowerCase()
    const base = q ? ALL_REMIX_ICONS.filter(icon => icon.toLowerCase().includes(q)) : ALL_REMIX_ICONS
    return base.slice(0, 240)
  }, [typeIconQuery])

  /** Fetches the full type list from the main process and updates local state. */
  const refreshTypeCatalog = useCallback(async () => {
    if (!campaignId) return
    try {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-types', campaignId).catch(() => [])
      setObjectTypes(Array.isArray(rows) ? rows : [])
    } catch {
      setObjectTypes([])
    }
  }, [campaignId])

  /** Looks up a type record by its id or by name (case-insensitive). Returns
   *  `undefined` when the value doesn't match any known type. */
  const getTypeByValue = useCallback((value: string | null | undefined): ObjectType | undefined => {
    const v = String(value || '').trim()
    if (!v) return undefined
    return objectTypes.find(t => t.id === v || t.name.toLowerCase() === v.toLowerCase())
  }, [objectTypes])

  /** Returns the list of types that should be shown in dropdowns for the given
   *  campaign.  If the currently selected type is hidden in this campaign it is
   *  still appended so existing values render correctly. */
  const getSelectableTypes = useCallback((currentValue?: string) => {
    const visible = objectTypes.filter(t => !t.isHidden)
    if (!currentValue) return visible
    const current = getTypeByValue(currentValue)
    if (current && !visible.some(v => v.id === current.id)) return [...visible, current]
    return visible
  }, [objectTypes, getTypeByValue])

  /** Resets all type editor form fields to blank defaults. */
  const resetTypeEditor = useCallback(() => {
    setTypeEditorErr(null)
    setTypeEditorId('')
    setTypeEditorName('')
    setTypeEditorIcon('ri-price-tag-3-line')
    setTypeIconQuery('')
    setTypeEditorTags([])
    setTypeTagInput('')
    setTypeTagSuggestions([])
  }, [])

  /** Clears the form and opens the editor in "create new type" mode. */
  const openNewTypeEditor = useCallback(() => {
    resetTypeEditor()
    setTypeEditorIsNew(true)
    setTypeEditorOpen(true)
  }, [resetTypeEditor])

  /** Pre-fills the form with an existing type's data and opens the editor in
   *  "edit existing type" mode. */
  const openEditTypeEditor = useCallback((typeRow: ObjectType) => {
    setTypeEditorErr(null)
    setTypeEditorIsNew(false)
    setTypeEditorId(typeRow.id)
    setTypeEditorName(typeRow.name)
    setTypeEditorIcon(typeRow.icon || 'ri-price-tag-3-line')
    setTypeIconQuery(typeRow.icon || '')
    setTypeEditorTags((typeRow.tags || []).map((t: TypeTag) => t.name))
    setTypeTagInput('')
    setTypeTagSuggestions([])
    setTypeEditorOpen(true)
  }, [])

  /** Adds a tag name to the draft tag list for the type being edited.
   *  Silently ignores blank values and case-insensitive duplicates. */
  const addTypeTagDraft = useCallback((rawValue: string) => {
    const tag = String(rawValue || '').trim()
    if (!tag) return
    setTypeEditorTags(prev => {
      if (prev.some(p => p.toLowerCase() === tag.toLowerCase())) return prev
      return [...prev, tag]
    })
    setTypeTagInput('')
  }, [])

  /** Initial load on mount (or when campaignId becomes available). */
  useEffect(() => {
    refreshTypeCatalog()
  }, [refreshTypeCatalog])

  /** Keeps tag autocomplete suggestions in sync as the user types in the tag
   *  input field while the type editor is open. */
  useEffect(() => {
    if (!typeEditorOpen) return
    const q = typeTagInput.trim()
    let cancelled = false
    ;(async () => {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-type-tags', q).catch(() => [])
      if (!cancelled) setTypeTagSuggestions(Array.isArray(rows) ? rows : [])
    })()
    return () => { cancelled = true }
  }, [typeEditorOpen, typeTagInput])

  /** Escape key handler to close type modals in the correct dismissal order. */
  useEffect(() => {
    if (!showTypeManager && !typeEditorOpen && !deleteTypeTarget && !switchTypeTarget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (typeEditorOpen) { setTypeEditorOpen(false); return }
      if (deleteTypeTarget) { setDeleteTypeTarget(null); return }
      if (switchTypeTarget) { setSwitchTypeTarget(null); return }
      if (showTypeManager) { setShowTypeManager(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTypeManager, typeEditorOpen, deleteTypeTarget, switchTypeTarget])

  return {
    objectTypes, setObjectTypes,
    showTypeManager, setShowTypeManager,
    typeEditorOpen, setTypeEditorOpen,
    typeEditorIsNew,
    typeEditorErr, setTypeEditorErr,
    typeEditorId,
    typeEditorName, setTypeEditorName,
    typeEditorIcon, setTypeEditorIcon,
    typeIconQuery, setTypeIconQuery,
    typeEditorTags, setTypeEditorTags,
    typeTagInput, setTypeTagInput,
    typeTagSuggestions,
    deleteTypeTarget, setDeleteTypeTarget,
    deleteTypeReplacementId, setDeleteTypeReplacementId,
    deleteTypeItems, setDeleteTypeItems,
    switchTypeTarget, setSwitchTypeTarget,
    switchTypeReplacementId, setSwitchTypeReplacementId,
    filteredRemixIcons,
    refreshTypeCatalog,
    getTypeByValue,
    getSelectableTypes,
    openNewTypeEditor,
    openEditTypeEditor,
    addTypeTagDraft,
  }
}

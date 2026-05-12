/**
 * editor/templateEngine.ts
 *
 * Pure functions for creating, parsing, and building template definitions and
 * their associated style blocks. None of these functions have React or IPC
 * dependencies — they are safe to call outside a component context.
 *
 * Exports:
 *  - parseTemplateFields          — parse `{%type:"Label"}` tokens from source
 *  - createVisualField            — construct a TemplateVisualField with defaults
 *  - parseTemplateMeta            — decode `fields_json` from a TemplateDef
 *  - normalizeTemplateFields      — coerce raw field objects to TemplateVisualField[]
 *  - createStyleDecl              — construct a TemplateStyleDecl with defaults
 *  - createStyleBlock             — construct a TemplateStyleBlock with defaults
 *  - buildCssFromStyleBlocks      — serialize style blocks to a CSS string
 *  - parseCssToStyleBlocks        — parse a CSS string into TemplateStyleBlock[]
 *  - buildTemplateSourceFromVisual — produce template source from the visual canvas
 *  - parseVisualFieldsFromRawSource — extract visual fields from raw source text
 */

import type { TemplateVisualField, TemplateStyleDecl, TemplateStyleBlock } from './types'

/** Parses all `{%type:"Label"}` tokens from a template source string.
 *  Returns an array of `{ type, label }` pairs in document order. */
export function parseTemplateFields(source: string): Array<{ type: string; label: string }> {
  const out: Array<{ type: string; label: string }> = []
  const re = /\{\%([a-zA-Z0-9_]+):"([^"]+)"\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source || ''))) {
    out.push({ type: String(m[1] || '').toLowerCase(), label: String(m[2] || '').trim() })
  }
  return out
}

/** Creates a new TemplateVisualField, mapping raw type strings to the allowed
 *  union and filling any missing properties with safe defaults. */
export function createVisualField(
  seed?: Partial<Omit<TemplateVisualField, 'type'>> & { type?: string }
): TemplateVisualField {
  const rawType = String(seed?.type || 'text').toLowerCase()
  const mappedType: TemplateVisualField['type'] =
    rawType === 'div' ? 'div' :
    rawType === 'richtext' ? 'richtext' :
    rawType === 'textarea' ? 'textarea' :
    rawType === 'image' ? 'image' :
    rawType === 'attachment' ? 'attachment' :
    'text'
  return {
    id: seed?.id || `tvf_${Math.random().toString(16).slice(2, 10)}`,
    type: mappedType,
    label: seed?.label || '',
    placeholder: seed?.placeholder || '',
    required: !!seed?.required,
    className: seed?.className || '',
    parentId: seed?.parentId === undefined ? null : (seed?.parentId || null),
    order: typeof seed?.order === 'number' ? seed.order : 0,
  }
}

/** Decodes the `fields_json` column of a TemplateDef row.
 *  Supports both bare arrays (legacy) and `{ fields, cardClass }` objects. */
export function parseTemplateMeta(
  fieldsJson: string
): { fields: Array<{ id?: string; type: string; label: string; placeholder?: string; required?: boolean; className?: string; parentId?: string | null; order?: number }>; cardClass: string } {
  try {
    const parsed = JSON.parse(fieldsJson || '[]')
    if (Array.isArray(parsed)) {
      return { fields: parsed, cardClass: '' }
    }
    if (parsed && Array.isArray(parsed.fields)) {
      return { fields: parsed.fields, cardClass: String(parsed.cardClass || '') }
    }
  } catch {}
  return { fields: [], cardClass: '' }
}

/** Coerces an array of loosely-typed field objects into proper TemplateVisualField
 *  instances. Generates stable IDs for entries that lack one and validates that
 *  parentId references actually exist in the set. */
export function normalizeTemplateFields(
  fields: Array<{ id?: string; type: string; label: string; placeholder?: string; required?: boolean; className?: string; parentId?: string | null; order?: number }>
): TemplateVisualField[] {
  const normalized = fields.map((f, idx) => createVisualField({
    id: f.id || `tvf_${Math.random().toString(16).slice(2, 10)}`,
    type: f.type || 'text',
    label: f.label || '',
    placeholder: f.placeholder || '',
    required: !!f.required,
    className: f.className || '',
    parentId: f.parentId ?? null,
    order: typeof f.order === 'number' ? f.order : idx,
  }))
  const ids = new Set(normalized.map(f => f.id))
  return normalized.map((f, idx) => ({
    ...f,
    parentId: f.parentId && ids.has(f.parentId) ? f.parentId : null,
    order: typeof f.order === 'number' ? f.order : idx,
  }))
}

/** Creates a TemplateStyleDecl with defaults, optionally seeded from a partial. */
export function createStyleDecl(seed?: Partial<TemplateStyleDecl>): TemplateStyleDecl {
  return {
    id: seed?.id || `tsd_${Math.random().toString(16).slice(2, 10)}`,
    property: seed?.property || 'color',
    value: seed?.value || '',
  }
}

/** Creates a TemplateStyleBlock with defaults. Each new block starts with one
 *  empty declaration so the UI can immediately show a property/value row. */
export function createStyleBlock(seed?: Partial<TemplateStyleBlock>): TemplateStyleBlock {
  return {
    id: seed?.id || `tsb_${Math.random().toString(16).slice(2, 10)}`,
    className: seed?.className || '',
    customClassName: seed?.customClassName || '',
    modifier: (seed?.modifier as any) || '',
    declarations: seed?.declarations || [createStyleDecl()],
    rawMode: !!seed?.rawMode,
    rawCss: seed?.rawCss || '',
  }
}

/** Serializes an array of TemplateStyleBlock objects into a CSS string.
 *  Blocks in raw mode emit their `rawCss` verbatim; structured blocks render
 *  `.className:modifier { property: value; }` rules. */
export function buildCssFromStyleBlocks(blocks: TemplateStyleBlock[]): string {
  const cssParts: string[] = []
  for (const b of blocks) {
    if (b.rawMode) {
      const raw = (b.rawCss || '').trim()
      if (raw) cssParts.push(raw)
      continue
    }
    const cls = (b.className === '__custom__' ? b.customClassName : b.className).trim()
    if (!cls) continue
    const decls = b.declarations
      .filter(d => d.property.trim() && d.value.trim())
      .map(d => `  ${d.property.trim()}: ${d.value.trim()};`)
      .join('\n')
    if (!decls) continue
    cssParts.push(`.${cls}${b.modifier} {\n${decls}\n}`)
  }
  return cssParts.join('\n\n')
}

/** Parses a CSS string into TemplateStyleBlock objects. Uses a regex that
 *  recognises `.className[:modifier] { ... }` patterns. Unrecognised or
 *  unparseable CSS is emitted as a single raw-mode block so nothing is lost. */
export function parseCssToStyleBlocks(css: string): TemplateStyleBlock[] {
  const src = String(css || '').trim()
  if (!src) return []
  const blocks: TemplateStyleBlock[] = []
  const re = /\.([a-zA-Z0-9_-]+)(::before|::after|:hover|:active|:focus)?\s*\{([\s\S]*?)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const cls = String(m[1] || '').trim()
    const modifier = (String(m[2] || '') as TemplateStyleBlock['modifier']) || ''
    const body = String(m[3] || '')
    const declarations = body
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':')
        if (idx === -1) return null
        const property = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (!property) return null
        return createStyleDecl({ property, value })
      })
      .filter(Boolean) as TemplateStyleDecl[]
    blocks.push(createStyleBlock({
      className: cls,
      modifier,
      declarations: declarations.length ? declarations : [createStyleDecl()],
      rawMode: false,
    }))
  }
  if (!blocks.length && src) {
    blocks.push(createStyleBlock({ className: '__custom__', rawMode: true, rawCss: src }))
  }
  return blocks
}

/** Converts the visual canvas (an array of TemplateVisualField objects) back into
 *  the canonical template source string expected by the template renderer.
 *
 *  Layout rules:
 *  - `div` fields are rendered as `<div class="...">` wrappers with their
 *    children indented underneath.
 *  - With `columns > 1`, non-div sibling fields are packed onto the same line
 *    separated by ` | ` (the renderer splits these into table cells).
 *  - The template name is emitted as a `## heading` on the first line when set. */
export function buildTemplateSourceFromVisual(
  name: string,
  fields: TemplateVisualField[],
  columns: number
): string {
  const safeCols = Math.max(1, Math.min(3, columns || 1))
  const tokenFor = (f: TemplateVisualField) =>
    `{%${f.type}:"${String(f.label || '').replace(/"/g, '\\"')}"}`
  const byParent = new Map<string | null, TemplateVisualField[]>()
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

  const renderRows = (parentId: string | null, depth: number): string[] => {
    const out: string[] = []
    const nodes = (byParent.get(parentId) || []).filter(f => (f.label || '').trim())
    for (let i = 0; i < nodes.length;) {
      const n = nodes[i]
      if (n.type === 'div') {
        const cls = (n.className || n.label || 'group').trim()
        out.push(`${'  '.repeat(depth)}<div class="${cls}">`)
        out.push(`${'  '.repeat(depth + 1)}# ${n.label}`)
        out.push(...renderRows(n.id, depth + 1))
        out.push(`${'  '.repeat(depth)}</div>`)
        i += 1
        continue
      }
      if (safeCols === 1) {
        out.push(`${'  '.repeat(depth)}${n.label}: ${tokenFor(n)}`)
        i += 1
        continue
      }
      const row: TemplateVisualField[] = []
      while (i < nodes.length && row.length < safeCols && nodes[i].type !== 'div') {
        row.push(nodes[i]); i++
      }
      if (row.length) out.push(`${'  '.repeat(depth)}${row.map(f => `${f.label}: ${tokenFor(f)}`).join(' | ')}`)
    }
    return out
  }

  const lines: string[] = []
  const title = (name || '').trim()
  if (title) lines.push(`## ${title}`)
  lines.push(...renderRows(null, 0))
  return lines.join('\n')
}

/** Extracts TemplateVisualField objects from raw template source text by parsing
 *  `{%type:"Label"}` tokens. Throws an error if no tokens are found in non-empty
 *  source, so callers can surface a user-visible validation message. */
export function parseVisualFieldsFromRawSource(source: string): TemplateVisualField[] {
  const parsed = parseTemplateFields(source)
  if (parsed.length === 0 && String(source || '').trim()) {
    throw new Error('No valid template tokens were found in source.')
  }
  return normalizeTemplateFields(parsed.map((f, idx) => ({
    id: `tvf_raw_${idx}`,
    type: f.type,
    label: f.label,
    placeholder: '',
    required: false,
    className: '',
    parentId: null,
    order: idx,
  })))
}

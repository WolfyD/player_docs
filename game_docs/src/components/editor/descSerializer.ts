/**
 * editor/descSerializer.ts
 *
 * Converts between the canonical stored description format (plain text with
 * inline `[[label|tagId]]` link tokens and `{{tpl:instanceId}}` template
 * markers) and the HTML used by the contentEditable editor surface.
 *
 * All functions in this module are pure or use only the global `window`
 * object — they have no React state dependencies and may be called from
 * outside a component.
 *
 * Exports:
 *  - descToHtml            — stored text → editable HTML
 *  - htmlToDesc            — editor DOM → stored text
 *  - normalizeTemplateSpacing — ensure `{{tpl:…}}` markers are on their own lines
 *  - removeMissingTags     — async; strips link tokens whose tag no longer exists
 */

import type { TemplateInstance, TemplateVisualField } from './types'
import { normalizeTemplateFields, parseTemplateMeta } from './templateEngine'

/** Options passed to `descToHtml` to supply the React state that the renderer
 *  needs without creating a closure over the component's scope. */
export type DescToHtmlOptions = {
  /** Whether inline styling tokens (`[{bold|…}]` etc.) should render with
   *  visible CSS classes or be suppressed (`styleTagDisabled`). */
  stylingEnabled: boolean
  /** All template instances currently loaded for the active object, used to
   *  expand `{{tpl:id}}` markers into rendered cards. */
  templateInstances: TemplateInstance[]
  /** When true, each template field row includes its label as a prefix span. */
  showTemplateFieldLabels: boolean
}

/**
 * Converts the stored canonical text format to the HTML used by the
 * contentEditable surface.
 *
 * Processing pipeline:
 *  1. Scanner: walks the source string character-by-character, protecting
 *     `[[label|tagId]]` and `{{tpl:id}}` tokens with placeholder strings so
 *     the style renderer in step 2 cannot accidentally mangle them.
 *  2. Style renderer: converts `[{styleName|content}]` tokens to
 *     `<span class="styleTag style-…">` elements. Nesting is supported.
 *  3. Restore phase: swaps placeholders back for tag `<span data-tag>` elements
 *     and fully rendered template instance cards.
 *  4. Newline normalisation: converts `\n` to `<br>`.
 */
export function descToHtml(text: string, opts: DescToHtmlOptions): string {
  const { stylingEnabled, templateInstances, showTemplateFieldLabels } = opts

  const templateMap = new Map<string, TemplateInstance>()
  for (const inst of templateInstances) {
    templateMap.set(inst.id, inst)
  }

  const esc = (v: string) =>
    String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  /** Recursively converts `[{styleName|content}]` tokens to HTML span elements.
   *  Unknown style names pass their content through without a wrapper. */
  function renderStylesToHtml(input: string): string {
    const OPEN = '[{'
    const CLOSE = '}]'
    let i = 0
    const out: string[] = []

    function parseSegment(): string {
      const seg: string[] = []
      while (i < input.length) {
        if (input[i] === '\\' && i + 1 < input.length) {
          seg.push(input[i + 1])
          i += 2
          continue
        }
        if (input.startsWith(OPEN, i)) {
          i += OPEN.length
          let name = ''
          while (i < input.length && !(input[i] === '|')) {
            if (input[i] === '\\' && i + 1 < input.length) { name += input[i + 1]; i += 2; continue }
            name += input[i++]
          }
          if (i >= input.length || input[i] !== '|') {
            seg.push(OPEN + name)
            continue
          }
          i++
          let depth = 1
          const innerParts: string[] = []
          while (i < input.length) {
            if (input[i] === '\\' && i + 1 < input.length) {
              innerParts.push(input[i + 1]); i += 2; continue
            }
            if (input.startsWith(OPEN, i)) { depth++; innerParts.push(OPEN); i += OPEN.length; continue }
            if (input.startsWith(CLOSE, i)) {
              depth--
              if (depth === 0) { i += CLOSE.length; break }
              innerParts.push(CLOSE); i += CLOSE.length; continue
            }
            innerParts.push(input[i++])
          }
          const innerRaw = innerParts.join('')
          const innerHtml = renderStylesToHtml(innerRaw)
          const styleName = name.trim().toLowerCase()
          const known = new Set(['bold','italic','underline','strike','code','redacted','h1','quote'])
          if (known.has(styleName)) {
            const baseClass = stylingEnabled ? 'styleTag' : 'styleTagDisabled'
            seg.push(`<span class="${baseClass} style-${styleName}">${innerHtml}</span>`)
          } else {
            seg.push(innerHtml)
          }
          continue
        }
        seg.push(input[i++])
      }
      return seg.join('')
    }

    out.push(parseSegment())
    return out.join('')
  }

  const placeholders: Array<{ key: string; label: string; tag: string }> = []
  const templatePlaceholders: Array<{ key: string; id: string }> = []
  let phIndex = 0
  const src = String(text)
  let iScan = 0
  const protectedParts: string[] = []

  while (iScan < src.length) {
    if (src[iScan] === '\\' && iScan + 1 < src.length) { protectedParts.push(src[iScan + 1]); iScan += 2; continue }
    if (src.startsWith('{{tpl:', iScan)) {
      const close = src.indexOf('}}', iScan + 6)
      if (close !== -1) {
        const id = src.substring(iScan + 6, close).trim()
        const key = `\u0001TPL${phIndex++}\u0001`
        templatePlaceholders.push({ key, id })
        protectedParts.push(key)
        iScan = close + 2
        continue
      }
    }
    if (src.startsWith('[[', iScan)) {
      const start = iScan
      iScan += 2
      let styleDepth = 0
      let labelBuf: string[] = []
      let ok = false
      while (iScan < src.length) {
        if (src[iScan] === '\\' && iScan + 1 < src.length) { labelBuf.push(src[iScan + 1]); iScan += 2; continue }
        if (src.startsWith('[{', iScan)) { styleDepth++; labelBuf.push('[{'); iScan += 2; continue }
        if (src.startsWith('}]', iScan)) { if (styleDepth > 0) styleDepth--; labelBuf.push('}]'); iScan += 2; continue }
        if (src[iScan] === '|' && styleDepth === 0) { iScan++; ok = true; break }
        labelBuf.push(src[iScan++])
      }
      if (!ok) { protectedParts.push(src.substring(start, iScan)); continue }
      const tagStart = iScan
      const closeIdx = src.indexOf(']]', iScan)
      if (closeIdx === -1) {
        protectedParts.push(src.substring(start))
        iScan = src.length
        continue
      }
      const tagId = src.substring(tagStart, closeIdx)
      iScan = closeIdx + 2
      const key = `\u0001TAG${phIndex++}\u0001`
      placeholders.push({ key, label: labelBuf.join(''), tag: tagId })
      protectedParts.push(key)
      continue
    }
    protectedParts.push(src[iScan++])
  }
  const protectedText = protectedParts.join('')

  const withStyles = renderStylesToHtml(protectedText)

  let restored = withStyles
  for (const ph of placeholders) {
    const safeLabelHtml = renderStylesToHtml(ph.label)
    const tagSpan = `<span data-tag="${ph.tag}" style="background: var(--pd-tag-bg, rgba(100,149,237,0.2)); border-bottom: 1px dotted var(--pd-tag-border, #6495ED); cursor: pointer;">${safeLabelHtml}</span>`
    restored = restored.split(ph.key).join(tagSpan)
  }
  for (const ph of templatePlaceholders) {
    const inst = templateMap.get(ph.id)
    if (!inst) {
      restored = restored.split(ph.key).join(
        `<div class="template-instance-missing" data-template-instance-id="${esc(ph.id)}">Template instance loading…</div>`
      )
      continue
    }
    const meta = parseTemplateMeta(inst.template_fields || '[]')
    const fields = normalizeTemplateFields(meta.fields as any[])
    const values = (() => {
      try { return JSON.parse(inst.values_json || '{}') as Record<string, string> }
      catch { return {} as Record<string, string> }
    })()
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
    const renderRows = (parentId: string | null): string => {
      const nodes = byParent.get(parentId) || []
      return nodes.map((f) => {
        const rowCls = String(f.className || '').trim()
        const clsAttr = rowCls ? ` ${esc(rowCls)}` : ''
        if (f.type === 'div') {
          const inner = renderRows(f.id)
          return `<div class="template-field-group${clsAttr}">${inner}</div>`
        }
        const val = values[f.label] || ''
        const labelHtml = showTemplateFieldLabels
          ? `<span class="template-field-label">${esc(f.label)}:</span> `
          : ''
        if (f.type === 'image') {
          const looksData = /^data:image\//i.test(val)
          const looksPath = /^[A-Za-z]:[\\/]|^\\\\|^\//.test(val)
          const imgSrc = looksData
            ? val
            : looksPath
              ? `file:///${val.replace(/\\/g, '/').replace(/^\/+/, '')}`
              : ''
          if (imgSrc) {
            return `<div class="template-field-row template-field-user${clsAttr}">${labelHtml}<img class="template-field-image" src="${esc(imgSrc)}" alt="${esc(f.label)}" /></div>`
          }
        }
        if (f.type === 'richtext') {
          const richHtml = val.trim()
            ? renderStylesToHtml(val).replace(/\n/g, '<br>')
            : `<span class="template-field-placeholder">${esc(String(f.placeholder || ''))}</span>`
          return `<div class="template-field-row template-field-user${clsAttr}">${labelHtml}<div class="template-field-richtext">${richHtml}</div></div>`
        }
        const shown = val.trim()
          ? esc(val)
          : `<span class="template-field-placeholder">${esc(String(f.placeholder || ''))}</span>`
        return `<div class="template-field-row template-field-user${clsAttr}">${labelHtml}<span class="template-field-value">${shown}</span></div>`
      }).join('')
    }
    const rows = renderRows(null)
    const cardCls = String(meta.cardClass || '').trim()
    const cardClsAttr = cardCls ? ` ${esc(cardCls)}` : ''
    const colorValue = String(values.Color || values.color || '').trim()
    const colorStyle = colorValue ? ` style="--callout-accent:${esc(colorValue)}"` : ''
    const card = `<div class="template-instance-card${cardClsAttr}"${colorStyle} data-template-instance-id="${esc(inst.id)}" contenteditable="false"><button class="template-instance-remove-btn" data-template-remove="${esc(inst.id)}" type="button" title="Remove instance">X</button>${rows || '<div class="template-field-row muted">No fields</div>'}<button class="template-instance-edit-btn" data-template-edit="${esc(inst.id)}" type="button">Edit</button></div>`
    restored = restored.split(ph.key).join(card)
  }

  return restored.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>')
}

/**
 * Walks the editor DOM and serializes it back to the canonical stored format.
 *
 * Conversion rules:
 *  - `<br>` → `\n`
 *  - `<span data-tag="…">` → `[[label|tagId]]`
 *  - `<span class="styleTag style-X">` → `[{X|content}]`
 *  - `[data-template-instance-id]` → `{{tpl:id}}`
 *  - `<div>` with a previous sibling adds a leading `\n`
 *  - Text nodes are emitted verbatim.
 *
 * Adjacent style spans of the same type are merged before serialization to
 * prevent duplicate token wrapping when the user edits near a boundary.
 */
export function htmlToDesc(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement

  /** Recursively merges directly adjacent style spans that share the same style
   *  token, preventing double-wrapping artefacts during serialization. */
  const mergeAdjacentStyleSpans = (element: HTMLElement): void => {
    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        mergeAdjacentStyleSpans(child as HTMLElement)
      }
    })
    let current: Node | null = element.firstChild
    while (current) {
      const next = current.nextSibling
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement
        if (el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) {
          const style = Array.from(el.classList).find(cls => cls.startsWith('style-'))
          if (style) {
            const token = style.replace('style-', '')
            const allowed = new Set(['bold','italic','underline','strike','code','redacted','h1','quote'])
            if (allowed.has(token)) {
              let nextSibling: Node | null = el.nextSibling
              while (nextSibling) {
                const nextNext = nextSibling.nextSibling
                if (nextSibling.nodeType === Node.ELEMENT_NODE) {
                  const nextEl = nextSibling as HTMLElement
                  if (nextEl.matches('span.styleTag') || nextEl.matches('span.styleTagDisabled')) {
                    const nextStyle = Array.from(nextEl.classList).find(cls => cls.startsWith('style-'))
                    if (nextStyle && nextStyle.replace('style-', '') === token) {
                      while (nextEl.firstChild) { el.appendChild(nextEl.firstChild) }
                      nextEl.remove()
                      nextSibling = el.nextSibling
                      continue
                    }
                  }
                  break
                } else if (nextSibling.nodeType === Node.TEXT_NODE) {
                  break
                } else {
                  break
                }
              }
            }
          }
        }
      }
      current = next
    }
  }

  mergeAdjacentStyleSpans(clone)

  /** Recursively serializes a single DOM node to canonical token text.
   *  `activeStyles` tracks which style tokens are already open in ancestor nodes
   *  to prevent double-wrapping when the user nests identical style spans. */
  const serializeNode = (node: Node, activeStyles: Set<string> = new Set()): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    if (el.tagName === 'BR') return '\n'
    if (el.matches('[data-template-instance-id]')) {
      const id = el.getAttribute('data-template-instance-id') || ''
      return `{{tpl:${id}}}`
    }
    if (el.tagName === 'DIV') {
      let s = ''
      if (el.previousSibling) s += '\n'
      el.childNodes.forEach((c) => { s += serializeNode(c, activeStyles) })
      return s
    }
    if (el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) {
      const style = Array.from(el.classList).find(cls => cls.startsWith('style-'))
      if (style) {
        const token = style.replace('style-', '')
        const allowed = new Set(['bold','italic','underline','strike','code','redacted','h1','quote'])
        if (allowed.has(token)) {
          if (activeStyles.has(token)) {
            return Array.from(el.childNodes).map((c) => serializeNode(c, activeStyles)).join('')
          } else {
            const newActiveStyles = new Set(activeStyles)
            newActiveStyles.add(token)
            const inner = Array.from(el.childNodes).map((c) => serializeNode(c, newActiveStyles)).join('')
            if (!inner || inner.trim().length === 0) return inner
            return `[{${token}|${inner}}]`
          }
        }
      }
      return Array.from(el.childNodes).map((c) => serializeNode(c, activeStyles)).join('')
    }
    if (el.matches('span[data-tag]')) {
      const label = Array.from(el.childNodes).map((c) => serializeNode(c, activeStyles)).join('')
      const tag = el.getAttribute('data-tag') || ''
      return `[[${label}|${tag}]]`
    }
    let s = ''
    el.childNodes.forEach((c) => { s += serializeNode(c, activeStyles) })
    return s
  }

  const raw = Array.from(clone.childNodes).map((node) => serializeNode(node, new Set())).join('')
  let result = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  result = result.replace(/\[\{[^|]+\|\}\]/g, '')
  result = result.replace(/\n{3,}/g, '\n\n')
  return result
}

/** Ensures that every `{{tpl:id}}` marker is surrounded by newline characters.
 *  This prevents template cards from being glued to adjacent text when the
 *  description is round-tripped through the editor. */
export function normalizeTemplateSpacing(input: string): string {
  const src = String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return src.replace(/\{\{tpl:[^}]+\}\}/g, (m: string, offset: number, full: string) => {
    const start = offset
    const end = offset + m.length
    const hasBefore = start > 0 && full[start - 1] === '\n'
    const hasAfter = end < full.length && full[end] === '\n'
    let out = m
    if (!hasBefore) out = '\n' + out
    if (!hasAfter) out = out + '\n'
    return out
  })
}

/**
 * Asynchronously strips `[[label|tagId]]` tokens whose `tagId` no longer
 * resolves to any link target or attachment in the database.
 *
 * Uses `window.ipcRenderer` (available in the Electron renderer process) to
 * query `gamedocs:list-link-targets` and `gamedocs:list-tag-attachments`.
 * Both checks must return empty before a tag is considered missing — this
 * prevents stripping attachment-only links.
 */
export async function removeMissingTags(text: string): Promise<string> {
  const tokenRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  let result = text
  const seen = new Set<string>()
  const missing = new Set<string>()
  while ((m = tokenRe.exec(text))) {
    const tagId = m[2]
    if (seen.has(tagId) || missing.has(tagId)) continue
    try {
      const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId)
      if (Array.isArray(targets) && targets.length > 0) {
        seen.add(tagId)
      } else {
        const atts = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => [])
        if (!Array.isArray(atts) || atts.length === 0) missing.add(tagId)
        else seen.add(tagId)
      }
    } catch {
      missing.add(tagId)
    }
  }
  if (missing.size === 0) return text
  result = result.replace(
    /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
    (_m, label, tid) => missing.has(String(tid)) ? String(label) : _m
  )
  return result
}

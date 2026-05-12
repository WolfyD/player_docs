export type ParsedTokens = {
  tags: Array<{ label: string; tagId: string }>
  templates: string[]
}

export function normalizeNewlines(input: string): string {
  return String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function parseTokens(desc: string): ParsedTokens {
  const src = String(desc || '')
  const tags: Array<{ label: string; tagId: string }> = []
  const templates: string[] = []
  const tagRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g
  const tplRe = /\{\{tpl:([^}]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(src))) tags.push({ label: String(m[1]), tagId: String(m[2]) })
  while ((m = tplRe.exec(src))) templates.push(String(m[1]))
  return { tags, templates }
}

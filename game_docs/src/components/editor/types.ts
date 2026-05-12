/**
 * editor/types.ts
 *
 * Shared TypeScript interfaces used across the Editor and all its sub-modules
 * (hooks, modals, serializers, template engine). All types are exported so they
 * can be imported from a single canonical location.
 */

/** A campaign (world/project) row returned by `gamedocs:get-campaign`. */
export type Campaign = { id: string; name: string }

/** A tag that can be attached to an ObjectType to control feature behaviour
 *  (e.g. the "location" tag makes a type map-eligible). */
export type TypeTag = { id: string; name: string }

/** A user-managed or built-in entity type (e.g. Place, Person, Lore, Other). */
export type ObjectType = {
  id: string
  name: string
  /** Remix-icon CSS class, e.g. "ri-user-line". */
  icon: string
  /** True for types seeded on first run; they cannot be fully removed. */
  isBuiltin: boolean
  /** True for the "Other" catch-all type which cannot be deleted. */
  isProtected: boolean
  /** True when hidden in the current campaign (via campaign_hidden_types table). */
  isHidden: boolean
  /** Number of objects currently using this type. */
  usageCount: number
  tags: TypeTag[]
}

/** A file attachment record associated with an object or link-tag. */
export type Attachment = {
  id: string
  game_id: string
  object_id?: string | null
  tag_id?: string | null
  file_path: string
  name: string | null
  mime: string | null
  ext: string | null
  /** 1 if this is the primary/main attachment for its owner. */
  is_main: number
}

/** A template definition stored in the templates table. */
export type TemplateDef = {
  id: string
  name: string
  /** Raw source with `{%type:"Label"}` tokens. */
  source: string
  style_css?: string | null
  /** JSON-encoded field array or `{ fields, cardClass }` object. */
  fields_json: string
  is_builtin?: number
}

/** A single visual field within the template builder drag-and-drop canvas. */
export type TemplateVisualField = {
  id: string
  type: 'text' | 'textarea' | 'image' | 'attachment' | 'richtext' | 'div'
  label: string
  placeholder: string
  required: boolean
  /** Optional CSS class applied to the rendered field row. */
  className: string
  /** Parent field id when this field is nested inside a `div` container. */
  parentId: string | null
  order: number
}

/** A single CSS property/value declaration inside a style block. */
export type TemplateStyleDecl = {
  id: string
  property: string
  value: string
}

/** A CSS rule block targeting a class with an optional pseudo-class modifier. */
export type TemplateStyleBlock = {
  id: string
  /** A known CSS class name or `"__custom__"` when using raw mode. */
  className: string
  /** The raw class name when `className === "__custom__"`. */
  customClassName: string
  modifier: '' | ':hover' | ':active' | ':focus' | '::before' | '::after'
  declarations: TemplateStyleDecl[]
  /** When true, the block is edited as raw CSS text (`rawCss`) instead of
   *  individual declarations. */
  rawMode: boolean
  rawCss: string
}

/** A placed instance of a template definition attached to an object. */
export type TemplateInstance = {
  id: string
  object_id: string
  template_id: string
  /** JSON-encoded `Record<fieldLabel, value>`. */
  values_json: string
  template_name: string
  /** Raw source of the template at the time the instance was created. */
  template_source: string
  template_style?: string | null
  /** JSON field metadata copied from the definition for offline rendering. */
  template_fields: string
}

/** A row returned by the template instance library query (cross-object view). */
export type TemplateInstanceLibraryRow = {
  id: string
  object_id: string
  object_name: string
  template_id: string
  template_name: string
  values_json: string
  updated_at: string
}

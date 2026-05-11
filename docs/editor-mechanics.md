# Editor Mechanics Reference

## LLM Quick Context
- **Read this when:** you need exact editor behavior, state flow, and interaction rules.
- **Primary source files:** `game_docs/src/components/Editor.tsx`, `game_docs/src/components/editor.css`, `game_docs/src/components/Confirm.tsx`, `game_docs/src/components/ShortcutInput.tsx`.
- **Core reality:** `Editor.tsx` is a large feature hub and acts as both view layer and interaction orchestrator.

## What the Editor Currently Does
- Loads campaign/root/current children and keeps a hierarchical navigator.
- Edits object descriptions in a `contentEditable` area.
- Supports inline links (`[[label|tag_id]]`) with hover previews and multi-target disambiguation.
- Provides command palette + quick search + command execution.
- Manages images per object (add/list/default/rename/delete/open).
- Manages generic file attachments per object (add/open/set-main/delete).
- Supports word-level file attachments for unlinked words.
- Renders and edits template instance blocks embedded in description text.
- Supports object operations (create/move/rename/delete/type/lock).
- Exports/share operations and map launch from editor commands.

## Internal State Model (High Level)

### Data state
- Campaign/root/active object IDs and metadata.
- Child list and parent reference for navigation.
- `desc` as persisted text representation of the current object.
- Link-related state: owner tags, incoming links, link menus, hover preview payload.
- Image list + add-image modal state.
- Object attachment list state.
- Template definitions and template instance state.

### UI/control state
- Palette visibility/input/result selections.
- Settings modal and local settings drafts (palette/fonts/shortcuts/debounce/styling).
- Context menu state and saved text selection ranges.
- Dialog/modal visibility (new child, linker, move, bulk move, help, image dialogs).

### Refs and timing helpers
- Editor DOM ref and range refs for selection-sensitive operations.
- Debounce timers for:
  - quick search query,
  - autosave writeback,
  - hover-preview fetch.

## Description Representation and Serialization

## Stored description form
- Primary persisted value is text in `objects.description`.
- Rich constructs are encoded inline:
  - links: `[[Label|tag_id]]`
  - style wrappers like `[{bold|...}]`, `[{italic|...}]` (when styling is enabled)
  - template instances: `{{tpl:instance_id}}`

## Render path (`descToHtml`)
- Converts stored markup to DOM HTML:
  - link tokens become spans with tag metadata,
  - line breaks become `<br>`,
  - style wrappers become classed spans.

## Parse path (`htmlToDesc`)
- Walks the editable DOM and converts it back to normalized serialized text.
- Used after input/mutations so React state remains canonical.

## Link Lifecycle in the Editor

### Creating links
1. User selects text and opens linker.
2. Linker fuzzy-searches objects (`list-objects-for-fuzzy`).
3. If needed, disambiguates same-name objects (`get-objects-by-name-with-paths`).
4. Creates or reuses tag (`create-link-tag` / `get-or-create-tag-for-target`).
5. Associates target (`add-link-target`).
6. Inserts linked span and reserializes editor content.
7. If the source word had a direct (unlinked) word attachment, user is prompted to move/remove before linking.

### Following links
- Click on tagged span -> fetch `list-link-targets`.
- Behavior:
  - 0 targets: no navigation (stale link behavior handled by cleanup path).
  - 1 target: direct navigation.
  - many targets: selection menu.
- Shift-click supports fast target behavior in current implementation.

### Broken link cleanup
- Editor strips missing tags, but preserves unlinked tag references when they still carry word-level attachments.

## Search and Command Palette Mechanics

### Quick search mode
- Palette input without `>` triggers debounced search (`gamedocs:quick-search`).
- Returns object and tag matches for fast navigation.

### Command mode
- Palette input prefixed by `>` filters command list.
- Commands include object operations, lock/unlock, settings actions, export actions, map launch, and utility actions.

### Linker search mode
- Separate linker UI uses Fuse.js over object corpus fetched from main process.

## Keyboard Shortcuts
- Editor implements custom combo matching via `matchShortcut`.
- Shortcuts are loaded from `ui.shortcuts` settings and can be customized.
- Common default actions include:
  - command palette,
  - settings/help,
  - create child,
  - add image,
  - go to parent,
  - link last word,
  - toggle lock.

## Autosave and Persistence Behavior
- Description persistence is debounced.
- After `desc` changes, editor waits roughly 500ms then calls `gamedocs:update-object-description`.
- There is no explicit always-visible "dirty" badge for description body edits in the current UX.

## Object and Image Workflows

### Object operations
- Create child category/object under active or root context.
- Move single object and bulk move flows.
- Rename object and change type.
- Soft-delete with cascade helper on main side.
- Lock/unlock object editing.

### Image operations
- Add image by file or URL.
- Generate/store thumbs via main process.
- Set default image and rename/delete image metadata.
- Open image externally or in dedicated viewer path.

### File attachment operations
- Add file attachments from disk to an object.
- Drag-and-drop files onto editor content to attach them directly to the active object.
- Dragged image files are routed into image storage; non-image files become generic file attachments.
- Set one attachment as the main file for object-level preview context.
- Open files with OS default app; PDFs can open in-app.
- Add file to selected unlinked word; once linked, attachment must be moved to object or removed.
- Word attachment add flow can recover stale missing tag rows using current object/game context.
- Unlinked word attachments appear on hover for tagged words and can be removed from the context menu.
- Clicking unlinked tagged words opens their direct attachments (single open/preview, multi-item picker menu).
- Image attachments always open in the in-app lightbox regardless of whether they originate from image rows or generic attachments.
- PDFs can be configured to open inline (modal) or in a pop-out window via settings.

### Template operations
- Create/edit template definitions in Settings using token DSL fields.
- Visual builder supports nested `div`/group fields with child field lists.
- Visual builder includes a `richtext` field type for markdown-like style-token content.
- CSS editor supports round-trip conversion between block/property mode and raw CSS mode.
- Insert template instance markers into description.
- Open template instance editor (double-click/edit button) and persist field values.
- Image fields render as inline previews and are persisted as data URLs when possible.
- Runtime template field labels are optional via a Settings toggle; `div` labels are never shown in rendered instances.
- Placeholder values render in template instances until a concrete value is entered.

## Settings and Theming in Editor
- Editor reads and writes settings via IPC:
  - color palette and theme tokens,
  - font family/size/weight/color and custom font file,
  - shortcut mappings,
  - hover debounce,
  - sidebar width,
  - styling enabled toggle.

## Current Implementation Characteristics
- **Strength:** feature-rich single screen with direct access to most workflows.
- **Strength:** consistent IPC-backed persistence and operational actions.
- **Tradeoff:** very large component increases coupling and cognitive load.
- **Tradeoff:** some shortcut branches and legacy/commented code paths indicate partial/in-progress features.

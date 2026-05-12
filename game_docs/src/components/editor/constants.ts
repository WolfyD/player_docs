/**
 * editor/constants.ts
 *
 * Static data constants shared across Editor components. These values are
 * computed once at module load time and are safe to import from anywhere in
 * the renderer process.
 *
 * Exports:
 *  - CSS_PROPERTY_OPTIONS  — ordered list of CSS property names for style pickers
 *  - ALL_REMIX_ICONS       — sorted list of every Remix Icon CSS class name
 *  - listOfCommands        — command palette command definitions
 */

import remixIconCssText from 'remixicon/fonts/remixicon.scss?raw'

/** Comprehensive ordered list of CSS property names for the style-block property picker.
 *  Sorted roughly alphabetically with shorthand properties first per group. */
export const CSS_PROPERTY_OPTIONS = [
  'align-items','align-content','align-self','appearance','aspect-ratio','background','background-attachment','background-clip','background-color','background-image','background-position','background-repeat','background-size','border','border-color','border-radius','border-style','border-width','bottom','box-shadow','box-sizing','color','column-gap','cursor','display','filter','flex','flex-basis','flex-direction','flex-flow','flex-grow','flex-shrink','flex-wrap','float','font','font-family','font-size','font-style','font-weight','gap','grid','grid-auto-columns','grid-auto-flow','grid-auto-rows','grid-column','grid-column-end','grid-column-start','grid-row','grid-row-end','grid-row-start','grid-template','grid-template-areas','grid-template-columns','grid-template-rows','height','inset','justify-content','justify-items','justify-self','left','letter-spacing','line-height','margin','margin-bottom','margin-left','margin-right','margin-top','max-height','max-width','min-height','min-width','object-fit','opacity','order','outline','overflow','overflow-x','overflow-y','padding','padding-bottom','padding-left','padding-right','padding-top','place-content','place-items','place-self','position','right','row-gap','text-align','text-decoration','text-overflow','text-transform','top','transform','transform-origin','transition','user-select','vertical-align','visibility','white-space','width','word-break','word-spacing','z-index'
]

/** Every Remix Icon CSS class derived from the raw SCSS source at build time.
 *  Capped at 240 entries when filtered for the icon picker. Sorted alphabetically. */
export const ALL_REMIX_ICONS = Array.from(
  new Set(
    (remixIconCssText.match(/\.ri-[a-z0-9-]+(?=:before)/g) || []).map(v => v.slice(1))
  )
).sort((a, b) => a.localeCompare(b))

/** Command palette command definitions.
 *  Each entry has `id`, `name`, `description`, and optionally `parameters`
 *  (for commands that require a user-selected value) and `setting: true`
 *  (for commands that should only appear in the settings context). */
export const listOfCommands = [
  { id: 'settings', name: 'Settings', description: 'Open settings modal' },
  { id: 'editObject', name: 'Edit object', description: 'Edit the current object' },
  { id: 'command', name: 'Command palette', description: 'Open command palette' },
  { id: 'newChild', name: 'New child', description: 'Create a new child object' },
  { id: 'addImage', name: 'Add image', description: 'Add a new image to the object' },
  { id: 'miscStuff', name: 'Open Misc stuff', description: 'Open misc stuff modal' },
  { id: 'exportShare', name: 'Export to Share', description: 'Export the current object to Share' },
  { id: 'exportPdf', name: 'Export to PDF', description: 'Export the current object to PDF' },
  { id: 'testImageCleanup', name: 'Test Image Cleanup', description: 'Manually test missing image cleanup' },
  { id: 'exportHtml', name: 'Export to HTML', description: 'Export the current object to HTML' },
  { id: 'generateMap', name: 'Generate map', description: 'Generate a map of all the places' },
  { id: 'chooseFontFile', name: 'Choose font file', description: 'Choose a font file for the custom font', setting: true },
  { id: 'createBackup', name: 'Create backup', description: 'Create a backup of the current object' },
  { id: 'listAllItems', name: 'List all items', description: 'List all the items in the current object' },
  { id: 'insertTemplate', name: 'Insert template', description: 'Insert a template block at current selection' },
  { id: 'manageTemplates', name: 'Manage templates', description: 'Open template definition manager', setting: true },
  { id: 'lockObject', name: 'Lock object', description: 'Make the current object read-only' },
  { id: 'unlockObject', name: 'Unlock object', description: 'Allow editing the current object' },
  { id: 'selectColorPalette', name: 'Select color palette', parameters: { palette: 'string', setting: true, choices: ['dracula', 'solarized-dark', 'solarized-light', 'github-dark', 'github-light', 'night-owl', 'monokai', 'parchment', 'primary-blue', 'primary-green', 'custom']}, description: 'Select a color palette for the editor' },
  { id: 'setFontFamily', name: 'Set font family', parameters: { family: 'string', setting: true, choices: ['Consolas', 'Times New Roman', 'Arial', 'Verdana', 'Courier New', 'Georgia', 'Garamond', 'Palatino', 'Lucida Console', 'Segoe UI', 'Inter', 'Roboto', 'Source Sans Pro', 'CustomFont']}, description: 'Set the font family for the editor' },
  { id: 'setFontSize', name: 'Set font size', parameters: { size: 'number', setting: true, choices: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]}, description: 'Set the font size for the editor' },
  { id: 'setFontWeight', name: 'Set font weight', parameters: { weight: 'number', setting: true, choices: [100, 200, 300, 400, 500, 600, 700, 800, 900]}, description: 'Set the font weight for the editor' },
  { id: 'setFontColor', name: 'Set font color', parameters: { color: 'string', setting: true}, description: 'Set the font color for the editor' },
]

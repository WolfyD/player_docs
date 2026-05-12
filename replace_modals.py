"""Replace inline modal JSX blocks with component tags in Editor.tsx."""
import re

with open(r'c:\Other\Repos\GitHub\player_docs\game_docs\src\components\Editor.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_block(content, start_str, end_str, replacement):
    s = content.find(start_str)
    e = content.find(end_str, s)
    if s == -1:
        raise ValueError(f'start not found: {start_str[:60]}')
    if e == -1:
        raise ValueError(f'end not found: {end_str[:60]}')
    return content[:s] + replacement + content[e:]

# 1. showMisc
content = replace_block(
    content,
    '\n          {showMisc && (',
    '\n\n          {/* Add Picture modal */',
    """
          <MiscModal
            visible={showMisc}
            hasPlaces={hasPlaces}
            activeLocked={activeLocked}
            campaignId={campaign?.id || ''}
            onClose={() => setShowMisc(false)}
            onExportToShare={handleExportToShare}
            onExportToPdf={handleExportToPdf}
            onExportToHtml={handleExportToHtml}
            onListAllItems={handleListAllItems}
          />
"""
)
print('1. MiscModal done')

# 2. imageModal
content = replace_block(
    content,
    '\n          {imageModal.visible && (',
    '\n          {pdfModal.visible && (',
    """
          <ImageModal
            visible={imageModal.visible}
            dataUrl={imageModal.dataUrl}
            onClose={() => setImageModal({ visible: false, dataUrl: null })}
          />
          """
)
print('2. ImageModal done')

# 3. pdfModal
content = replace_block(
    content,
    '\n          {pdfModal.visible && (',
    '\n          {showHelp && (',
    """
          <PdfModal
            visible={pdfModal.visible}
            dataUrl={pdfModal.dataUrl}
            filePath={pdfModal.filePath}
            name={pdfModal.name}
            onClose={() => setPdfModal({ visible: false, dataUrl: null, filePath: null, name: '' })}
          />
          """
)
print('3. PdfModal done')

with open(r'c:\Other\Repos\GitHub\player_docs\game_docs\src\components\Editor.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved after batch 1. Length:', len(content))

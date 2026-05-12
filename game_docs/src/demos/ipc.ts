
const bridgedIpc = (window as any).ipcRenderer || (window.opener as any)?.ipcRenderer

// Some popup windows opened from renderer routes may not receive the preload bridge.
// Reuse opener bridge when available so IPC calls keep working in POC windows.
if (!(window as any).ipcRenderer && bridgedIpc) {
  ;(window as any).ipcRenderer = bridgedIpc
}

if (bridgedIpc?.on) {
  bridgedIpc.on('main-process-message', (_event: unknown, ...args: unknown[]) => {
    console.log('[Receive Main-process message]:', ...args)
  })
}

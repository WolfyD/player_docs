export type CreateCampaignResult = {
  gameDir: string
  dbFile: string
}


declare global {
  interface Window {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (...args: any[]) => any
      off: (...args: any[]) => any
      send: (...args: any[]) => any
    }
  }
}

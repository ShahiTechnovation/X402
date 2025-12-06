export interface ElectronAPI {
  wireguard: {
    start: (config: string) => Promise<{ success: boolean }>
    stop: () => Promise<{ success: boolean }>
    status: () => Promise<{ isRunning: boolean }>
  }
  app: {
    getVersion: () => Promise<string>
    quit: () => Promise<void>
  }
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    removeListener: (
      channel: string,
      listener: (event: any, ...args: any[]) => void
    ) => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  wireguard: {
    start: (config: string) => ipcRenderer.invoke('wireguard:start', config),
    stop: () => ipcRenderer.invoke('wireguard:stop'),
    status: () => ipcRenderer.invoke('wireguard:status'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, listener)
    },
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    },
  },
})

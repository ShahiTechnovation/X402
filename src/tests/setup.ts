import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

afterEach(() => {
  cleanup()
})

// Mock electron if in test environment
if (typeof window === 'undefined') {
  vi.mock('electron', () => ({
    ipcRenderer: {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  }))
}

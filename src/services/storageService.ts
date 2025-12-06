import { VPNSession } from '../types/vpn'

const SESSION_KEY = 'vpn_current_session'
const SESSIONS_KEY = 'vpn_session_history'

export async function saveSessionToDisk(session: VPNSession): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    }
  } catch (error) {
    console.error('Failed to save session:', error)
    throw error
  }
}

export async function loadSessionFromDisk(): Promise<VPNSession | null> {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SESSION_KEY)
      if (stored) {
        const session = JSON.parse(stored)
        return {
          ...session,
          startTime: new Date(session.startTime),
        }
      }
    }
    return null
  } catch (error) {
    console.error('Failed to load session:', error)
    throw error
  }
}

export async function clearSessionFromDisk(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch (error) {
    console.error('Failed to clear session:', error)
    throw error
  }
}

export async function addSessionToHistory(session: VPNSession): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      const history = localStorage.getItem(SESSIONS_KEY)
      const sessions = history ? JSON.parse(history) : []
      sessions.push(session)
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    }
  } catch (error) {
    console.error('Failed to add session to history:', error)
    throw error
  }
}

export async function getSessionHistory(): Promise<VPNSession[]> {
  try {
    if (typeof window !== 'undefined') {
      const history = localStorage.getItem(SESSIONS_KEY)
      return history ? JSON.parse(history) : []
    }
    return []
  } catch (error) {
    console.error('Failed to get session history:', error)
    throw error
  }
}

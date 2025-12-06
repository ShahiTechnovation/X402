import React, { ReactNode } from 'react'
import { logger } from '../services/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Component Error:', { error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-white mb-2">Oops! Something went wrong</h1>
              <p className="text-slate-400 mb-4">{this.state.error?.message}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

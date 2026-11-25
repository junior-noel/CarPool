import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Home() {
  const [serverMessage, setServerMessage] = useState('Connecting to server...')
  const [connectionError, setConnectionError] = useState(false)

  useEffect(() => {
    api.get<string>('/')
      .then(({ data }) => setServerMessage(data))
      .catch(() => {
        setConnectionError(true)
        setServerMessage('Could not connect to the server.')
      })
  }, [])

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6">
      <h1 className="text-3xl font-bold text-foreground">CarPool</h1>
      <p className="mt-2 text-muted">Share rides, split costs.</p>
      <p className={`mt-4 ${connectionError ? 'text-red-600' : 'text-muted'}`} role="status">
        Server: {serverMessage}
      </p>
    </div>
  )
}
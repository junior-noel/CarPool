import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/auth/Login'

export default function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-4 border-b border-border bg-surface px-8 py-4">
        <Link to="/" className="font-semibold text-primary">Home</Link>
        <Link to="/login" className="text-muted hover:text-foreground">Login</Link>
      </nav>
      <main className="min-h-screen bg-background p-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
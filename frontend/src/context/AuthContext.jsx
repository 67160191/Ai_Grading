import { createContext, useContext, useState } from 'react'
import safeStorage from '../utils/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(safeStorage.getItem('user')) } catch { return null }
  })

  const saveAuth = (token, userData) => {
    safeStorage.setItem('token', token)
    safeStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    safeStorage.removeItem('token')
    safeStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, saveAuth, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

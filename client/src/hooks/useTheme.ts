import { useEffect, useState } from 'react'

// Available theme preferences
type Theme = 'light' | 'dark' | 'system'

// Checks the user's saved preference or device preference
function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem('theme')

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return 'system'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    // Detect the operating system's theme preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    // Apply the appropriate theme to the HTML element
    const applyTheme = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && mediaQuery.matches)

      document.documentElement.classList.toggle('dark', isDark)
    }

    applyTheme()

    // Follow device theme changes when system preference is selected
    if (theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme)

      return () => {
        mediaQuery.removeEventListener('change', applyTheme)
      }
    }
  }, [theme])

  // Update and persist the user's preference
  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme)

    if (newTheme === 'system') {
      localStorage.removeItem('theme')
    } else {
      localStorage.setItem('theme', newTheme)
    }
  }

  return { theme, changeTheme }
}
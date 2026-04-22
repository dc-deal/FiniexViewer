import { ref } from 'vue'

type Theme = 'dark' | 'light'

const _theme = ref<Theme>((localStorage.getItem('theme') as Theme) ?? 'dark')

export function useTheme() {
  function setTheme(t: Theme): void {
    _theme.value = t
    document.documentElement.dataset.theme = t
    localStorage.setItem('theme', t)
  }

  function toggle(): void {
    setTheme(_theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: _theme, toggle, setTheme }
}

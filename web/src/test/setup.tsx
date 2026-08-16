import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// CodeMirror no funciona en jsdom (getClientRects, etc.). Se mockea a un
// <textarea aria-label> simple para los tests de los paneles que lo usan.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange, placeholder, 'aria-label': ariaLabel }: {
    value: string
    onChange?: (v: string) => void
    placeholder?: string
    'aria-label'?: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      defaultValue={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}))

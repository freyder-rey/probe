import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { useRef } from 'react'
import { jsonEditorExtensions, readOnlyExtensions } from '../editor/extensions'

interface Props {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  ariaLabel?: string
}

export function JsonEditor({ value, onChange, readOnly = false, placeholder, ariaLabel }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null)

  return (
    <CodeMirror
      ref={ref}
      value={value}
      height="auto"
      minHeight={readOnly ? undefined : '120px'}
      extensions={readOnly ? readOnlyExtensions : jsonEditorExtensions}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
      }}
      aria-label={ariaLabel}
      aria-readonly={readOnly}
      placeholder={placeholder}
      onChange={(v) => { if (!readOnly) onChange?.(v) }}
    />
  )
}

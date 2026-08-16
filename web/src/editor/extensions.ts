import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

// Resalta {{variables}} (interpoladas por el runner) dentro del JSON.
const variableMatcher = new MatchDecorator({
  regexp: /\{\{[^}]*\}\}/g,
  decoration: () =>
    Decoration.mark({
      attributes: { 'data-variable': 'true' },
    }),
})

const variablePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = variableMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = variableMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

const appTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '13px',
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-dim)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  'span[data-variable="true"]': {
    color: 'var(--teal)',
    fontWeight: '600',
  },
})

const jsonStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--purple)' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--orange)' },
  { tag: t.bool, color: 'var(--purple)' },
  { tag: t.null, color: 'var(--purple)' },
  { tag: t.propertyName, color: 'var(--accent)' },
  { tag: t.punctuation, color: 'var(--text-dim)' },
])

export const jsonEditorExtensions: Extension[] = [
  json(),
  syntaxHighlighting(jsonStyle),
  variablePlugin,
  appTheme,
  EditorView.lineWrapping,
]

export const readOnlyExtensions: Extension[] = [
  json(),
  syntaxHighlighting(jsonStyle),
  appTheme,
  EditorView.lineWrapping,
  EditorView.editable.of(false),
]

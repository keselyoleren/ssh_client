// Code editor for the file manager: CodeMirror 6 with syntax highlighting picked from the
// file name. Language support is loaded on demand (one small chunk per language), and the
// colours come from the current terminal theme so the editor matches the terminals.

import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  HighlightStyle,
  syntaxHighlighting,
  indentUnit,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  LanguageDescription,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags as t } from '@lezer/highlight'
import { isDarkTheme } from './themes'

// File names language-data doesn't know (or gets wrong): config files and shell dotfiles.
const BY_NAME = [
  [/^nginx.*\.conf$/i, 'Nginx'],
  [/^\.(bash|zsh)(rc|_profile|_login|_logout|env)$|^\.(profile|envrc)$|\.(zsh|bash|ksh)$/i, 'Shell'],
  [/^\.env(\..+)?$|\.(env|conf|cfg|cnf|service|socket|timer|desktop|editorconfig)$/i, 'Properties files'],
  [/^\.(gitconfig|npmrc|yarnrc|pypirc|curlrc|wgetrc)$|^(my|php)\.ini$/i, 'Properties files'],
  [/^(Dockerfile|Containerfile)(\..+)?$|\.dockerfile$/i, 'Dockerfile'],
  [/\.svelte$/i, 'HTML'],
]

/** The language for a file name, or null for plain text. */
export function languageFor(name) {
  for (const [re, lang] of BY_NAME) if (re.test(name)) return languages.find((l) => l.name === lang) || null
  return LanguageDescription.matchFilename(languages, name)
}

/** Indentation the file already uses: a tab, or 2 / 4 spaces. */
function detectIndent(text) {
  let tabs = 0,
    two = 0,
    four = 0
  for (const line of text.split('\n', 2000)) {
    if (line.startsWith('\t')) tabs++
    else {
      const n = /^ +/.exec(line)?.[0].length || 0
      if (n && n % 4 === 0) four++
      else if (n && n % 2 === 0) two++
    }
  }
  if (tabs > two + four) return '\t'
  return two > four / 3 ? '  ' : '    '
}

function highlight(c) {
  return HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: c.magenta },
    { tag: [t.modifier, t.self], color: c.magenta, fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.character, t.docString], color: c.green },
    { tag: [t.regexp, t.escape], color: c.cyan },
    { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: c.yellow },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.brightBlack, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: c.blue },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: c.cyan },
    { tag: [t.propertyName, t.attributeName, t.labelName], color: c.red },
    { tag: [t.tagName, t.angleBracket], color: c.red },
    { tag: [t.definition(t.variableName), t.constant(t.variableName)], color: c.yellow },
    { tag: [t.operator, t.derefOperator], color: c.cyan },
    { tag: [t.meta, t.processingInstruction, t.annotation], color: c.brightBlack },
    { tag: t.heading, color: c.blue, fontWeight: 'bold' },
    { tag: [t.strong], fontWeight: 'bold' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.link, t.url], color: c.cyan, textDecoration: 'underline' },
    { tag: t.invalid, color: c.red, textDecoration: 'underline wavy' },
    { tag: [t.inserted], color: c.green },
    { tag: [t.deleted], color: c.red },
    { tag: [t.changed], color: c.yellow },
  ])
}

function chrome(c, dark) {
  return EditorView.theme(
    {
      '&': { height: '100%', color: c.foreground, backgroundColor: c.background, fontSize: '12.5px' },
      '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.55' },
      '.cm-content': { caretColor: c.cursor, padding: '10px 0' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.cursor },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: c.selectionBackground },
      '.cm-gutters': { backgroundColor: c.background, color: c.brightBlack, border: 'none' },
      '.cm-activeLine': { backgroundColor: `color-mix(in srgb, ${c.foreground} 5%, transparent)` },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.foreground },
      '.cm-matchingBracket': { backgroundColor: `color-mix(in srgb, ${c.cyan} 25%, transparent)`, outline: 'none' },
      '.cm-selectionMatch': { backgroundColor: `color-mix(in srgb, ${c.yellow} 18%, transparent)` },
      '.cm-searchMatch': { backgroundColor: `color-mix(in srgb, ${c.yellow} 30%, transparent)` },
      '.cm-searchMatch-selected': { backgroundColor: `color-mix(in srgb, ${c.yellow} 55%, transparent)` },
      '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: c.brightBlack },
      '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--text)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
      '.cm-panel input, .cm-panel button': { font: 'inherit', fontSize: '12px' },
    },
    { dark },
  )
}

/**
 * Mount an editor in `parent`.
 * opts: { doc, name, colors (terminal theme), onSave(), onEscape(), onDirty(bool), onStatus({ line, col }) }
 * Returns { view, info: { language, indent, eol }, text(), markSaved(), setColors(colors) }.
 */
export function createEditor(parent, opts) {
  const theme = new Compartment()
  const language = new Compartment()
  // Keep Windows line endings as they are, so saving doesn't rewrite every line.
  const eol = opts.doc.includes('\r\n') ? '\r\n' : '\n'
  const indent = detectIndent(opts.doc)
  const desc = languageFor(opts.name)
  const info = { language: desc?.name || 'Plain text', indent, eol }
  let saved = null // document as last loaded / saved

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        EditorState.lineSeparator.of(eol),
        indentUnit.of(indent),
        EditorState.tabSize.of(indent === '\t' ? 4 : indent.length),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (opts.onSave?.(), true) },
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
          { key: 'Escape', run: () => (opts.onEscape?.(), true) },
        ]),
        theme.of(themeFor(opts.colors)),
        language.of([]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onDirty?.(!u.state.doc.eq(saved))
          if (u.docChanged || u.selectionSet) {
            const head = u.state.selection.main.head
            const line = u.state.doc.lineAt(head)
            opts.onStatus?.({ line: line.number, col: head - line.from + 1 })
          }
        }),
      ],
    }),
  })
  saved = view.state.doc
  // The language parser is a separate chunk: show the text right away, colour it when loaded.
  if (desc)
    desc.load().then(
      (support) => view.dispatch({ effects: language.reconfigure(support) }),
      () => {},
    )

  return {
    view,
    info,
    text: () => view.state.sliceDoc(), // joins lines with the original line ending
    markSaved: (doc) => {
      saved = doc
      opts.onDirty?.(!view.state.doc.eq(saved))
    },
    doc: () => view.state.doc,
    setColors: (c) => view.dispatch({ effects: theme.reconfigure(themeFor(c)) }),
  }
}

function themeFor(c) {
  return [chrome(c, isDarkTheme(c)), syntaxHighlighting(highlight(c))]
}

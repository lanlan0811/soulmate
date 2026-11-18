#!/usr/bin/env node
/**
 * check-tokens.mjs
 * 校验 .uvue / .ts 里没有裸色值、没有魔法数值、var(--sm-*) 都有定义。
 *
 * 规则：
 *  1. 禁止 #hex、rgb()/rgba() 字面量（theme/tokens.ts、styles/tokens.css 白名单）
 *  2. padding / margin / gap / font-size / border-radius / width / height 等的 Npx
 *     必须在 design/token-values.json 的数值集合内
 *  3. 所有 var(--sm-*) 必须在 styles/tokens.css 里定义
 *  4. 禁止后代 / 子代 / 兄弟选择器（蒸汽模式不支持）
 *
 * 用法：node scripts/check-tokens.mjs [--fix-report]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const values = JSON.parse(readFileSync(resolve(ROOT, 'design/token-values.json'), 'utf8'))

const allowedColors = new Set(values.colors.map((c) => c.toUpperCase()))
const allowedNumbers = new Set(values.numbers)
const definedVars = new Set(values.varNames)

const SKIP_DIRS = new Set(['node_modules', 'unpackage', 'dist', '.git', '.claude', '.zcode', 'static', 'design'])
const SKIP_FILES = new Set(['theme/tokens.ts', 'styles/tokens.css'])

const NUMERIC_PROPS = [
  'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'font-size', 'line-height', 'letter-spacing', 'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'border-width', 'border-top-width', 'border-bottom-width',
  'flex-basis', 'padding', 'margin'
]

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(ROOT, full).replace(/\\/g, '/')
    if (SKIP_DIRS.has(entry)) continue
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(uvue|uts|ts|vue)$/.test(entry) && !SKIP_FILES.has(rel)) files.push(full)
  }
}
walk(resolve(ROOT, 'components'))
walk(resolve(ROOT, 'pages'))
walk(resolve(ROOT, 'store'))
walk(resolve(ROOT, 'utils'))
files.push(resolve(ROOT, 'App.uvue'))

const problems = []
const report = (file, line, message, text) => {
  problems.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line, message, text: text.trim().slice(0, 140) })
}

const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g

for (const file of files) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = source.split(/\r?\n/)

  // 1. 裸色值（整文件，含模板绑定）
  lines.forEach((text, i) => {
    if (text.trim().startsWith('//') || text.trim().startsWith('*')) return
    const hits = text.match(COLOR_LITERAL)
    if (hits) {
      for (const hit of hits) {
        if (hit.startsWith('#')) {
          const normalized = hit.toUpperCase()
          if (!allowedColors.has(normalized)) report(file, i + 1, `裸色值 ${hit}`, text)
        } else {
          report(file, i + 1, '裸 rgb/rgba 色值', text)
        }
      }
    }
  })

  // 2. 魔法数值（仅 style 块内）
  let block
  STYLE_BLOCK.lastIndex = 0
  while ((block = STYLE_BLOCK.exec(source)) !== null) {
    const before = source.slice(0, block.index + block[0].indexOf(block[1]))
    const startLine = before.split(/\r?\n/).length
    const cssLines = block[1].split(/\r?\n/)
    cssLines.forEach((text, i) => {
      const line = startLine + i
      const decl = /^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/.exec(text)
      if (!decl) return
      const prop = decl[1]
      const value = decl[2]
      if (!NUMERIC_PROPS.includes(prop)) return
      if (value.includes('var(--sm-')) return
      if (value.includes('%') || value === 'auto' || value === 'none' || value === '0') return
      const nums = [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Number(m[1]))
      for (const n of nums) {
        if (!allowedNumbers.has(n)) report(file, line, `魔法数值 ${n}px (${prop})`, text)
      }
      // rpx 一律视为违规（项目统一 px + token）
      if (/\d+rpx/.test(value)) report(file, line, '禁止 rpx，统一使用 px token', text)
    })
  }

  // 3. var 定义检查
  lines.forEach((text, i) => {
    for (const match of text.matchAll(/var\((--sm-[a-z0-9-]+)/g)) {
      if (!definedVars.has(match[1])) report(file, i + 1, `未定义变量 ${match[1]}`, text)
    }
  })

  // 4. 选择器限制（仅 style 块）
  STYLE_BLOCK.lastIndex = 0
  while ((block = STYLE_BLOCK.exec(source)) !== null) {
    const startLine = source.slice(0, block.index).split(/\r?\n/).length
    block[1].split(/\r?\n/).forEach((text, i) => {
      const trimmed = text.trim()
      if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('@')) return
      if (!trimmed.includes('{')) return
      const selector = trimmed.slice(0, trimmed.indexOf('{')).trim()
      if (!selector) return
      if (/[>~+]|\s(?![,{])/.test(selector) && !selector.startsWith('page')) {
        report(file, startLine + i, `蒸汽模式不支持关系选择器: ${selector}`, text)
      }
    })
  }
}

if (problems.length === 0) {
  console.log(`check-tokens: OK  (${files.length} files scanned)`)
  process.exit(0)
}

console.log(`check-tokens: ${problems.length} 处违规\n`)
const byFile = new Map()
for (const p of problems) {
  if (!byFile.has(p.file)) byFile.set(p.file, [])
  byFile.get(p.file).push(p)
}
for (const [file, list] of byFile) {
  console.log(file)
  for (const p of list) console.log(`  ${p.line}: ${p.message}   → ${p.text}`)
  console.log()
}
process.exit(1)

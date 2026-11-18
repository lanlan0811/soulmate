#!/usr/bin/env node
/**
 * gen-tokens.mjs
 * 读取 design/tokens.base.json（设计库 light token 快照）+ design/brand.override.json，
 * 解析语义引用为字面值，生成：
 *   styles/tokens.css   —— uni-app x 全局 CSS 变量（page 选择器）+ 少量长写工具类
 *   theme/tokens.ts     —— 供脚本 / 动态样式使用的 TS 常量
 *   design/token-values.json —— 校验脚本用的白名单
 *
 * App 平台约束：自定义变量不能引用别的变量，因此这里全部输出字面值。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'))

const base = read('design/tokens.base.json')
const override = read('design/brand.override.json')

/* ------------------------------ 深合并 ------------------------------ */

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function merge(target, patch) {
  for (const key of Object.keys(patch)) {
    const next = patch[key]
    if (isPlain(next) && isPlain(target[key])) {
      merge(target[key], next)
    } else {
      target[key] = next
    }
  }
  return target
}

const tokens = merge(JSON.parse(JSON.stringify(base)), override)

/* --------------------------- 解析颜色引用 --------------------------- */

const primitives = tokens.color.primitives

function resolveColor(value) {
  if (typeof value !== 'string') return value
  if (value.startsWith('#') || value.startsWith('rgb')) return value
  // neutral.50 / brand.800 之类
  const parts = value.split('.')
  if (parts.length === 2 && primitives[parts[0]] && primitives[parts[0]][parts[1]]) {
    return primitives[parts[0]][parts[1]]
  }
  // success.500 也走同一路径
  return value
}

const palette = tokens.palette

/* ------------------------------ 输出 CSS ---------------------------- */

const lines = []
const push = (s = '') => lines.push(s)

push('/* 自动生成：node scripts/gen-tokens.mjs —— 请勿手改。')
push('   来源 design/tokens.base.json + design/brand.override.json;')
push('   颜色 / 间距 / 圆角 / 字号 / 动效一律通过 --sm-* 变量使用。 */')
push('')
push('page,')
push('.sm-theme {')

// 颜色：primitive
for (const group of Object.keys(primitives)) {
  for (const shade of Object.keys(primitives[group])) {
    push(`  --sm-color-${group}-${shade}: ${primitives[group][shade]};`)
  }
}

// 颜色：semantic
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const walk = (node, path) => {
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (isPlain(value)) {
      walk(value, [...path, key])
    } else {
      push(`  --sm-color-${path.concat(key).map(kebab).join('-')}: ${resolveColor(value)};`)
    }
  }
}
walk(tokens.color.semantic, [])

// 调色板（头像底色、渐变、深色卡）
for (const key of Object.keys(palette)) {
  push(`  --sm-palette-${kebab(key)}: ${palette[key]};`)
}

// 字号
for (const key of Object.keys(tokens.font.sizes)) {
  push(`  --sm-fs-${key}: ${tokens.font.sizes[key]}px;`)
}
// 字重
for (const key of Object.keys(tokens.font.weights)) {
  push(`  --sm-weight-${key}: ${tokens.font.weights[key]};`)
}
// 行高
for (const key of Object.keys(tokens.font.lineHeights)) {
  push(`  --sm-lh-${key}: ${tokens.font.lineHeights[key]};`)
}
// 字距
for (const key of Object.keys(tokens.font.letterSpacing)) {
  push(`  --sm-tracking-${key}: ${tokens.font.letterSpacing[key]};`)
}
// 间距
for (const key of Object.keys(tokens.space)) {
  push(`  --sm-space-${key}: ${tokens.space[key]}px;`)
}
// 圆角
for (const key of Object.keys(tokens.radius)) {
  push(`  --sm-radius-${key}: ${tokens.radius[key]}px;`)
}
// 描边
for (const key of Object.keys(tokens.borderWidth)) {
  push(`  --sm-border-${key}: ${tokens.borderWidth[key]}px;`)
}
// 阴影
for (const key of Object.keys(tokens.shadow)) {
  push(`  --sm-shadow-${key}: ${tokens.shadow[key]};`)
}
// 尺寸
for (const key of Object.keys(tokens.size)) {
  push(`  --sm-size-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${tokens.size[key]}px;`)
}
// 动效
push(`  --sm-motion-fast: ${tokens.motion.fast};`)
push(`  --sm-motion-base: ${tokens.motion.base};`)
push(`  --sm-ease: ${tokens.motion.easing};`)
push('  --sm-safe-top: 0px;')
push('  --sm-safe-bottom: 0px;')
push('}')
push('')

// 头像色板（页面级可用；组件内需自行复制同名类）
for (let i = 0; i < 6; i++) {
  push(`.sm-tint-${i} { background-color: ${palette[`tint${i}Bg`]}; }`)
  push(`.sm-tint-fg-${i} { color: ${palette[`tint${i}Fg`]}; }`)
}
push('')
push('/* 渐变：App 平台 linear-gradient 仅支持两色 + 方向 */')
push()
push()
push('')

// 布局工具类（蒸汽模式只支持 class / 分组选择器，全部类名扁平）
push('/* 布局工具类：单类名、长写属性 */')
push('.sm-u-row { flex-direction: row; }')
push('.sm-u-col { flex-direction: column; }')
push('.sm-u-wrap { flex-wrap: wrap; }')
push('.sm-u-flex-1 { flex-grow: 1; flex-shrink: 1; }')
push('.sm-u-none { display: none; }')
push('.sm-u-abs { position: absolute; }')
push('.sm-u-rel { position: relative; }')
push('.sm-u-grow { flex-grow: 1; }')
push('')

mkdirSync(resolve(ROOT, 'styles'), { recursive: true })
writeFileSync(resolve(ROOT, 'styles/tokens.css'), lines.join('\n'), 'utf8')

/* ------------------------------ 输出 TS ----------------------------- */

const tsLines = []
const tpush = (s = '') => tsLines.push(s)

tpush('/* 自动生成：node scripts/gen-tokens.mjs —— 请勿手改。 */')
tpush('')

const colorMap = {}
const collectColors = (node, path) => {
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (isPlain(value)) collectColors(value, [...path, key])
    else colorMap[path.concat(key).join('-')] = resolveColor(value)
  }
}
collectColors(tokens.color.semantic, [])

tpush('export const COLOR = {')
for (const key of Object.keys(colorMap)) {
  tpush(`  '${key}': '${colorMap[key]}',`)
}
for (const group of Object.keys(primitives)) {
  for (const shade of Object.keys(primitives[group])) {
    tpush(`  '${group}-${shade}': '${primitives[group][shade]}',`)
  }
}
tpush('}')
tpush('')
tpush('export const SPACE = {')
for (const key of Object.keys(tokens.space)) {
  tpush(`  ${key}: ${tokens.space[key]},`)
}
tpush('}')
tpush('')
tpush('export const RADIUS = {')
for (const key of Object.keys(tokens.radius)) {
  tpush(`  ${key}: ${tokens.radius[key]},`)
}
tpush('}')
tpush('')
tpush('export const FS = {')
for (const key of Object.keys(tokens.font.sizes)) {
  tpush(`  ${JSON.stringify(key)}: ${tokens.font.sizes[key]},`)
}
tpush('}')
tpush('')
tpush('export const SIZE = {')
for (const key of Object.keys(tokens.size)) {
  tpush(`  ${key}: ${tokens.size[key]},`)
}
tpush('}')
tpush('')
tpush('export const PALETTE = {')
for (const key of Object.keys(palette)) {
  tpush(`  ${key}: '${palette[key]}',`)
}
tpush('}')
tpush('')
tpush('export const MOTION_FAST = 160')
tpush('export const MOTION_BASE = 260')
tpush('')

mkdirSync(resolve(ROOT, 'theme'), { recursive: true })
writeFileSync(resolve(ROOT, 'theme/tokens.ts'), tsLines.join('\n'), 'utf8')

/* --------------------------- 输出数值白名单 -------------------------- */

const numeric = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 44, 46, 48, 50, 52, 56, 60, 64, 68, 72, 76, 80, 88, 96, 100, 112, 120, 140, 220, 240, 268, 300, 320, 360, 420, 480, 660, 999])
const addAll = (obj) => Object.keys(obj).forEach((k) => numeric.add(Number(obj[k])))
addAll(tokens.space)
addAll(tokens.radius)
addAll(tokens.size)
addAll(tokens.font.sizes)
Object.keys(tokens.font.weights).forEach((k) => numeric.add(tokens.font.weights[k]))
Object.keys(tokens.borderWidth).forEach((k) => numeric.add(tokens.borderWidth[k]))

const colorValues = new Set(Object.keys(colorMap).map((k) => colorMap[k]))
Object.keys(primitives).forEach((g) => Object.keys(primitives[g]).forEach((s) => colorValues.add(primitives[g][s])))
Object.keys(palette).forEach((k) => colorValues.add(palette[k]))

const values = {
  colors: [...colorValues],
  numbers: [...numeric].sort((a, b) => a - b),
  varNames: lines
    .map((l) => /--sm-[a-z0-9-]+/.exec(l))
    .filter(Boolean)
    .map((m) => m[0])
}
writeFileSync(resolve(ROOT, 'design/token-values.json'), JSON.stringify(values, null, 2) + '\n', 'utf8')

console.log(`tokens: ${values.varNames.length} vars, ${values.colors.length} colors, ${values.numbers.length} numbers`)
console.log('written: styles/tokens.css, theme/tokens.ts, design/token-values.json')

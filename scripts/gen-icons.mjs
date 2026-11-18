#!/usr/bin/env node
/**
 * gen-icons.mjs
 * 合并设计库 77 个线性图标 + 项目补充图标，为每个图标烘焙 6 个色板变体的 .svg。
 * App 平台不支持内联 SVG，只能用 <image> 加载 static 下的 .svg 文件。
 * 输出：static/icons/{variant}/{name}.svg
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'))

const core = read('.claude/design_library/icons/core.json')
const extra = read('design/icons.extra.json')

const icons = {}
for (const name of Object.keys(core.icons)) icons[name] = core.icons[name]
for (const name of Object.keys(extra.icons)) icons[name] = extra.icons[name]

const VARIANTS = {
  ink: '#17152B',
  muted: '#8378A3',
  brand: '#5B4C9B',
  inverse: '#FFFFFF',
  accent: '#C97DA0',
  danger: '#C03A5E',
  soft: '#7183CE',
  deep: '#C9BEE4'
}

const root = resolve(ROOT, 'static/icons')
rmSync(root, { recursive: true, force: true })

let count = 0
for (const variant of Object.keys(VARIANTS)) {
  const dir = resolve(root, variant)
  mkdirSync(dir, { recursive: true })
  for (const name of Object.keys(icons)) {
    const body = icons[name]
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
      `stroke="${VARIANTS[variant]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`
    writeFileSync(resolve(dir, `${name}.svg`), svg, 'utf8')
    count++
  }
}

console.log(`icons: ${Object.keys(icons).length} × ${Object.keys(VARIANTS).length} variants = ${count} files`)
for (const variant of Object.keys(VARIANTS)) {
  console.log('  static/icons/' + variant + '/')
}

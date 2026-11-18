# theme 与 tokens

- `design/tokens.base.json`：设计库 `light.tokens.json` 的完整快照，颜色 token 的唯一起源。
- `design/brand.override.json`：项目级补充，**只加移动端尺寸、派生色板与渐变端点**；颜色值全部取自设计库 light token，不覆盖任何品牌色。
- `styles/tokens.css`、`theme/tokens.ts`、`design/token-values.json` 全部由 `node scripts/gen-tokens.mjs` 生成，请勿手改。
- 组件与页面里只允许 `var(--sm-*)`，禁止裸 `#hex` / `rgb()` / 魔法 px。校验：`node scripts/check-tokens.mjs`。
- uni-app x App 平台不支持 CSS 变量引用变量，因此生成物全部是字面值。需要新颜色时先改 `design/tokens.base.json`（来自设计库）或 `design/brand.override.json` 的派生色板，再重新生成。
- 图标：`node scripts/gen-icons.mjs` 从设计库 `icons/core.json` + `design/icons.extra.json` 烘焙 8 个色板变体到 `static/icons/`。

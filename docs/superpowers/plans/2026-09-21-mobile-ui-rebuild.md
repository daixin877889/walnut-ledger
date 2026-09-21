# 核桃记账移动端 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前占位式 Vue 页面完整重构为已经确认的“核桃记账”移动端原型，并保持现有注册、离线记账和同步能力。

**Architecture:** 建立统一设计令牌、SVG 图标和应用壳层，五个核心页面只负责各自内容与交互。快速记账继续使用现有金额状态机和 IndexedDB 写入逻辑，但以固定控制台、独立滚动分类区重做视图。使用组件测试验证信息结构和交互，使用 390×844 手机视口截图与原型做视觉验收。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Vite、Vitest、IndexedDB、CSS、内联 SVG

**Spec:** `docs/superpowers/specs/2026-09-19-walnut-ledger-design.md`；视觉基准：`walnut-ledger-ui-prototype.html`

## Global Constraints

- 品牌名必须为“核桃记账”，视觉采用已确认的清爽绿色原创方案。
- App 使用账单、统计、账户、我的四个底部导航和中央“记一笔”按钮。
- 快速记账页必须直接展示 20 个分类；分类区独立滚动，金额、属性和数字键盘固定。
- 数字键盘不得触发系统软键盘，必须支持数字、小数点、退格、加法、减法、完成和“保存并继续记一笔”。
- 保留本地优先写入和现有 Cloudflare API，不以静态演示数据替换业务接口。
- 同时适配 iPhone 安全区和常见 Android 手机视口，不建设桌面管理后台。

## Review Focus

- 320px 窄屏：分类仍保持五列可点，键盘与完成按钮不溢出。
- 844px 以内高度：只有分类区域滚动，固定控制台始终完整可见。
- 金额达到最大长度：金额文字缩放或截断，不挤压分类名称与操作按钮。
- 空账本和接口不可用：页面仍保留完整视觉结构，并提供明确空状态。
- iPhone 底部安全区：导航与键盘内容不被 Home Indicator 遮挡。

---

### Task 1: 设计系统与应用壳层

**Files:**
- Create: `apps/mobile/src/styles/tokens.css`
- Create: `apps/mobile/src/styles/base.css`
- Create: `apps/mobile/src/ui/AppIcon.vue`
- Create: `apps/mobile/src/ui/AppShell.vue`
- Create: `apps/mobile/src/ui/AppShell.test.ts`
- Modify: `apps/mobile/src/main.ts`
- Modify: `apps/mobile/src/app/App.vue`

**Interfaces:**
- Produces: `AppIcon(name, size)`；`AppShell` 提供页面内容区、四栏导航与中央 `/entry` 按钮。
- Consumes: Vue Router 当前路由。

- [ ] **Step 1: 写失败测试**

```ts
it('renders four primary destinations and the central entry action', () => {
  const wrapper = mount(AppShell, { global: { plugins: [router] } })
  expect(wrapper.get('[aria-label="账单"]').attributes('href')).toBe('/bills')
  expect(wrapper.get('[aria-label="统计"]').attributes('href')).toBe('/reports')
  expect(wrapper.get('[aria-label="记一笔"]').attributes('href')).toBe('/entry')
  expect(wrapper.get('[aria-label="账户"]').attributes('href')).toBe('/accounts')
  expect(wrapper.get('[aria-label="我的"]').attributes('href')).toBe('/me')
})
```

- [ ] **Step 2: 运行测试并确认因组件不存在而失败**

Run: `pnpm --filter @walnut/mobile test -- AppShell.test.ts`
Expected: FAIL，提示无法导入 `AppShell.vue`。

- [ ] **Step 3: 实现设计令牌、图标和壳层**

定义 `--walnut-green:#20a46d`、`--walnut-deep:#0d6644`、`--walnut-mint:#eaf8f1`、背景、文字、分割线、圆角、阴影和安全区变量；`AppShell` 使用五列固定底栏，中央按钮上浮，路由激活项呈绿色。`AppIcon` 使用统一线性 SVG，不显示 emoji、字符占位图标或图标名称文本。

- [ ] **Step 4: 验证壳层测试**

Run: `pnpm --filter @walnut/mobile test -- AppShell.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/src/styles apps/mobile/src/ui apps/mobile/src/main.ts apps/mobile/src/app/App.vue
git commit -m "feat: add walnut mobile design system"
```

### Task 2: 重做快速记账核心页

**Files:**
- Create: `apps/mobile/src/features/entry/categories.ts`
- Create: `apps/mobile/src/features/entry/EntryPage.test.ts`
- Modify: `apps/mobile/src/features/entry/EntryPage.vue`

**Interfaces:**
- Consumes: `reduceAmount(state, key)`、`amountCents(state)`、`createIndexedDbDatabase()`、`AppIcon`。
- Produces: 支出/收入/转账切换、分类选择、固定金额控制台和离线保存交互。

- [ ] **Step 1: 写失败测试**

```ts
it('shows every expense category and a fixed custom keypad', () => {
  const wrapper = mount(EntryPage)
  expect(wrapper.findAll('[data-category]')).toHaveLength(20)
  expect(wrapper.get('[aria-label="退格"]')).toBeTruthy()
  expect(wrapper.text()).toContain('保存并继续记一笔')
  expect(wrapper.get('.category-panel').classes()).toContain('category-panel')
  expect(wrapper.get('.entry-console').classes()).toContain('entry-console')
})
```

- [ ] **Step 2: 运行测试并确认当前占位结构失败**

Run: `pnpm --filter @walnut/mobile test -- EntryPage.test.ts`
Expected: FAIL，缺少 `data-category`、中文退格标签和继续记账按钮。

- [ ] **Step 3: 实现原型布局和交互**

以原型中的顶部标题、三段切换、五列图标分类、日期/账户/成员/备注、金额行和 4×5 键盘重写页面。分类区使用 `overflow-y:auto; min-height:0`，控制台使用固定高度和 `env(safe-area-inset-bottom)`；退格显示 SVG，键值仍传给金额状态机。完成后保存并返回账单页；继续记账保存后重置金额并保留类型、分类与账户。

- [ ] **Step 4: 验证金额和页面测试**

Run: `pnpm --filter @walnut/mobile test -- amount-machine.test.ts EntryPage.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/src/features/entry
git commit -m "feat: rebuild quick entry experience"
```

### Task 3: 重做账单首页

**Files:**
- Create: `apps/mobile/src/features/bills/bill-view-model.ts`
- Create: `apps/mobile/src/features/bills/BillsPage.test.ts`
- Modify: `apps/mobile/src/features/bills/BillsPage.vue`

**Interfaces:**
- Consumes: 本地数据库流水、`AppIcon`、`AppShell`。
- Produces: 月度总览、预算进度、分日账单列表和空状态。

- [ ] **Step 1: 写失败测试**

```ts
it('renders the confirmed bill dashboard hierarchy', () => {
  const wrapper = mount(BillsPage)
  expect(wrapper.text()).toContain('核桃记账')
  expect(wrapper.text()).toContain('本月支出')
  expect(wrapper.text()).toContain('本月收入')
  expect(wrapper.text()).toContain('月度预算')
  expect(wrapper.text()).toContain('最近账单')
})
```

- [ ] **Step 2: 运行测试并确认占位页失败**

Run: `pnpm --filter @walnut/mobile test -- BillsPage.test.ts`
Expected: FAIL，缺少月度总览与预算层级。

- [ ] **Step 3: 实现账单仪表盘**

实现品牌顶栏、绿色渐变月度总览卡、收入支出双栏、白色预算卡、筛选入口和按日期分组的账单卡片。真实本地数据存在时使用聚合结果；无数据时金额显示 `¥0.00`，列表显示带插画式 SVG 图标的空状态，保留“记一笔”入口。

- [ ] **Step 4: 验证测试**

Run: `pnpm --filter @walnut/mobile test -- BillsPage.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/src/features/bills
git commit -m "feat: rebuild bills dashboard"
```

### Task 4: 重做统计、账户与我的页面

**Files:**
- Create: `apps/mobile/src/features/reports/ReportsPage.test.ts`
- Create: `apps/mobile/src/features/accounts/AccountsPage.test.ts`
- Create: `apps/mobile/src/features/profile/ProfilePage.vue`
- Create: `apps/mobile/src/features/profile/ProfilePage.test.ts`
- Modify: `apps/mobile/src/features/reports/ReportsPage.vue`
- Modify: `apps/mobile/src/features/accounts/AccountsPage.vue`
- Modify: `apps/mobile/src/app/router.ts`

**Interfaces:**
- Consumes: `AppIcon`、本地报表/账户数据、认证会话和设备入口。
- Produces: 原型一致的统计卡、资产卡、账户列表及“我的”菜单页。

- [ ] **Step 1: 写三个失败测试**

```ts
expect(mount(ReportsPage).text()).toContain('分类占比')
expect(mount(AccountsPage).text()).toContain('净资产')
expect(mount(ProfilePage).text()).toContain('同步与备份')
```

- [ ] **Step 2: 运行测试并确认占位页失败**

Run: `pnpm --filter @walnut/mobile test -- ReportsPage.test.ts AccountsPage.test.ts ProfilePage.test.ts`
Expected: FAIL，缺少原型卡片与菜单。

- [ ] **Step 3: 实现三个页面**

统计页实现时间胶囊、支出柱形趋势和 CSS 圆环分类占比；账户页实现深绿色净资产卡、资产/负债摘要和账户卡片；我的页实现用户同步状态、账本/分类/预算/周期账单、导入导出、同步备份和安全设置菜单，并把设备管理作为安全设置子入口。

- [ ] **Step 4: 验证测试**

Run: `pnpm --filter @walnut/mobile test -- ReportsPage.test.ts AccountsPage.test.ts ProfilePage.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/src/features/reports apps/mobile/src/features/accounts apps/mobile/src/features/profile apps/mobile/src/app/router.ts
git commit -m "feat: rebuild reports accounts and profile pages"
```

### Task 5: 手机视觉验收与部署产物

**Files:**
- Create: `apps/mobile/e2e/visual.spec.ts`
- Create: `apps/mobile/test-results/visual/.gitkeep`
- Modify: `apps/mobile/package.json`
- Modify: `docs/deployment/cloudflare.md`

**Interfaces:**
- Consumes: `/bills`、`/entry`、`/reports`、`/accounts`、`/me`。
- Produces: 390×844 和 320×700 两组可复现截图及溢出断言。

- [ ] **Step 1: 写失败视觉测试**

```ts
for (const path of ['/bills', '/entry', '/reports', '/accounts', '/me']) {
  await page.goto(path)
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page).toHaveScreenshot(`${path.slice(1)}-390x844.png`, { fullPage: true })
}
```

- [ ] **Step 2: 首次运行生成差异并人工对照原型**

Run: `pnpm --filter @walnut/mobile test:visual`
Expected: 首次 FAIL 并生成五个页面差异图。

- [ ] **Step 3: 修正视觉偏差**

逐页对照 `walnut-ledger-ui-prototype.html`，修正颜色、圆角、阴影、字号、间距、安全区和固定区域；不得以更新错误基线代替修正明显差异。

- [ ] **Step 4: 完整验证**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm --filter @walnut/mobile test:visual`
Expected: 单元测试、类型检查、生产构建、两个手机视口视觉测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile docs/deployment/cloudflare.md
git commit -m "test: verify walnut mobile visual fidelity"
```


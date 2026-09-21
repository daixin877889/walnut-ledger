# 核桃记账 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可安装到 Android 与 iOS、支持离线记账、多设备同步和多人共享账本的核桃记账 MVP，并使用 Cloudflare 免费资源承载云端能力。

**Architecture:** 单仓库包含 Ionic/Capacitor 移动端、Cloudflare Workers/Hono API 和共享 Zod contracts。移动端将写操作原子保存到 SQLite 与 Outbox，界面只依赖本地数据；同步引擎异步推送到 D1，并按账本 revision 拉取增量。R2 保存导出文件和逻辑备份，Cron Triggers 执行清理和备份任务。

**Tech Stack:** Node.js 20+、pnpm 9+、TypeScript 5.x、Vue 3、Vite、Ionic Vue、Capacitor、Pinia、Zod、Vitest、Playwright、`@capacitor-community/sqlite`、Dexie、Hono、Cloudflare Workers、D1、R2、Wrangler。

**Spec:** `docs/superpowers/specs/2026-09-19-walnut-ledger-design.md`

## Global Constraints

- 金额使用整数“分”，API 与数据库禁止使用浮点金额。
- 所有账本业务数据包含 `ledger_id`；每次读写都验证成员关系与角色。
- 写接口接受 `idempotency_key`；同一用户重复提交只能产生一份结果。
- 移动端本地优先；断网时新增、修改、删除和查询均可用。
- 支持所有者、可编辑成员、只读成员三级权限。
- 快速记账页分类独立展示，金额区和自定义键盘固定，不弹系统软键盘。
- 正式交付 Android APK/AAB 与 iOS 工程，不建设 Web 管理后台。
- 首版不使用 Durable Objects，不实现广告、会员、短信、邮件验证码、理财资讯。
- Access Token 30 分钟，Refresh Token 30 天并绑定设备；Refresh Token 仅存摘要。
- 每个任务遵循测试先行；任务测试和全量回归通过后再提交。

## Review Focus

- 金额边界：`0`、负数、小数精度溢出、超过 JavaScript 安全整数的值必须拒绝；Task 1 与 Task 5 覆盖。
- 权限隔离：已知其他账本的 UUID 也不得读取、修改或通过同步接口获取；Task 4、Task 5、Task 6 覆盖。
- 重放与并发：相同幂等键重放不重复入账，过期 `base_version` 返回完整冲突；Task 5、Task 6 覆盖。
- 本地故障：断网、App 被杀、同步中断后，本地账单和 Outbox 不丢失且可继续重试；Task 8、Task 12 覆盖。
- 性能退化：10,000 条流水下列表分页/虚拟滚动，快速键盘点击下一帧反馈；Task 10、Task 11、Task 14 覆盖。

---

## File Structure

```text
walnut-ledger/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   ├── api/
│   │   ├── src/{auth,db,ledgers,transactions,sync,reports,jobs}/
│   │   ├── migrations/
│   │   ├── test/
│   │   └── wrangler.toml
│   └── mobile/
│       ├── src/{app,core,features,pages,theme}/
│       ├── android/
│       └── ios/
├── packages/contracts/src/
├── docs/api/openapi.yaml
└── tests/e2e/
```

## Phase A：工程基础与 Cloudflare API

### Task 1: 建立工作区、共享 contracts 与健康检查

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/src/money.ts`
- Create: `packages/contracts/src/envelope.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/money.test.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Produces: `parseMoneyInput(value: string): number`、`ApiEnvelope<T>`、`createApp()`、`GET /healthz`。

- [ ] **Step 1: 写金额解析失败测试**

```ts
describe('parseMoneyInput', () => {
  it('将 12.34 转为 1234 分', () => expect(parseMoneyInput('12.34')).toBe(1234))
  it.each(['0', '-1', '1.001', '90071992547409.92', 'abc'])('拒绝 %s', value => {
    expect(() => parseMoneyInput(value)).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @walnut/contracts test -- money.test.ts`
Expected: FAIL，`parseMoneyInput` 不存在。

- [ ] **Step 3: 实现金额与响应契约**

```ts
export function parseMoneyInput(value: string): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error('INVALID_MONEY')
  const [yuan, decimal = ''] = value.split('.')
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('INVALID_MONEY')
  return cents
}
export type ApiEnvelope<T> = { code: string; message: string; data: T; request_id: string }
```

- [ ] **Step 4: 写并实现 Worker 健康检查**

```ts
it('returns API envelope', async () => {
  const response = await createApp().request('/healthz')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ code: 'OK', data: { ready: true } })
})
```

- [ ] **Step 5: 运行工作区测试并提交**

Run: `pnpm test`
Expected: contracts 与 API 测试全部 PASS。

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages apps/api
git commit -m "chore: scaffold cloudflare workspace"
```

### Task 2: 建立 D1 数据模型、迁移与查询边界

**Files:**
- Create: `apps/api/migrations/0001_core.sql`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/db/d1.ts`
- Create: `apps/api/src/db/schema.ts`
- Test: `apps/api/test/migrations.test.ts`
- Create: `apps/api/wrangler.toml`

**Interfaces:**
- Produces: `Env`、`runBatch(db, statements)`；核心表、外键与索引。

- [ ] **Step 1: 写迁移结构与回滚测试**

```ts
it('creates core tables', async () => {
  const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  expect(rows.results.map(row => row.name)).toEqual(expect.arrayContaining([
    'users', 'devices', 'invite_codes', 'ledgers', 'ledger_members',
    'accounts', 'categories', 'tags', 'transaction_tags', 'transactions',
    'budgets', 'idempotency_keys', 'sync_changes', 'operation_logs'
  ]))
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @walnut/api test -- migrations.test.ts`
Expected: FAIL，迁移尚不存在。

- [ ] **Step 3: 编写 D1 迁移与批处理封装**

主键为 TEXT UUID，时间为 ISO-8601 UTC TEXT，金额为 INTEGER。业务表包含 `ledger_id`，建立 `(ledger_id, updated_at)` 或 `(ledger_id, revision)` 索引，外键开启，删除使用 `deleted_at`。

```ts
export function runBatch(db: D1Database, statements: D1PreparedStatement[]) {
  return db.batch(statements)
}
```

- [ ] **Step 4: 验证一条失败导致整批回滚**

Run: `pnpm --filter @walnut/api test -- migrations.test.ts`
Expected: 合法插入与违反约束的插入同批执行后，目标表行数仍为 0。

- [ ] **Step 5: 提交**

```bash
git add apps/api/migrations apps/api/src/db apps/api/src/env.ts apps/api/wrangler.toml apps/api/test
git commit -m "feat: add d1 core schema"
```

### Task 3: 实现邀请码注册、登录与设备会话

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Create: `apps/api/src/auth/password.ts`
- Create: `apps/api/src/auth/tokens.ts`
- Create: `apps/api/src/auth/repository.ts`
- Create: `apps/api/src/auth/service.ts`
- Create: `apps/api/src/auth/routes.ts`
- Test: `apps/api/test/auth.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `/api/v1/auth/register|login|refresh|logout`、设备列表/退出 API、`AuthService`。

- [ ] **Step 1: 写过期邀请码测试**

```ts
it('rejects expired invite without creating user', async () => {
  await seedInvite(env.DB, { code: 'OLD-CODE', expiresAt: '2020-01-01T00:00:00Z' })
  const response = await register({ invite_code: 'OLD-CODE', username: 'dai', password: 'correct-horse-battery' })
  expect(response.status).toBe(422)
  expect(await countRows(env.DB, 'users')).toBe(0)
})
```

- [ ] **Step 2: 实现 PBKDF2 密码摘要**

```ts
export async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}
```

摘要保存算法、迭代次数、salt 和结果并恒定时间比较。生产迭代次数由 `PASSWORD_ITERATIONS` 设置下限，并在 Workers 免费 CPU 限制下基准测试。

- [ ] **Step 3: 实现注册与 Token 轮换**

同一 D1 batch 消耗邀请码、创建用户、个人账本、owner 成员和设备。Access Token 用 Secret 签名；Refresh Token 使用安全随机数且只保存 SHA-256 摘要，刷新即轮换。

- [ ] **Step 4: 增加重复用户名、错误密码、重复刷新与设备退出测试**

Run: `pnpm --filter @walnut/api test -- auth.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts/src apps/api/src/auth apps/api/src/app.ts apps/api/test/auth.test.ts
git commit -m "feat: add invite authentication"
```

### Task 4: 实现共享账本、三级权限与邀请

**Files:**
- Create: `packages/contracts/src/ledger.ts`
- Create: `apps/api/src/ledgers/policy.ts`
- Create: `apps/api/src/ledgers/repository.ts`
- Create: `apps/api/src/ledgers/service.ts`
- Create: `apps/api/src/ledgers/routes.ts`
- Test: `apps/api/test/ledgers.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `requirePermission(db, userId, ledgerId, permission)`；账本、成员、邀请和所有权 API。

- [ ] **Step 1: 写角色矩阵和跨账本测试**

```ts
it.each([
  ['owner', 'manage_members', true],
  ['editor', 'write_transaction', true],
  ['editor', 'manage_members', false],
  ['viewer', 'write_transaction', false],
  ['viewer', 'read', true]
])('%s / %s => %s', async (role, permission, allowed) => {
  await expectPermission(role, permission, allowed)
})
```

- [ ] **Step 2: 实现权限策略**

```ts
const permissions = {
  owner: new Set(['read', 'write_transaction', 'manage_ledger', 'manage_members']),
  editor: new Set(['read', 'write_transaction']),
  viewer: new Set(['read'])
} as const
```

Repository 查询同时绑定 `ledger_id` 与资源 ID，不先查询资源再在内存判断。

- [ ] **Step 3: 实现邀请预览、确认加入和审计**

邀请码保存哈希、有效期、次数和默认角色。加入重复成员保持幂等；角色变化、移除、所有权转让写入 `operation_logs`。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/api test -- ledgers.test.ts`
Expected: 跨账本 UUID 返回 404 且不泄露内容。

```bash
git add packages/contracts/src/ledger.ts apps/api/src/ledgers apps/api/src/app.ts apps/api/test/ledgers.test.ts
git commit -m "feat: add shared ledger permissions"
```

### Task 5: 实现账户、分类、标签、账单、幂等与转账

**Files:**
- Create: `packages/contracts/src/transaction.ts`
- Create: `apps/api/src/transactions/validation.ts`
- Create: `apps/api/src/transactions/repository.ts`
- Create: `apps/api/src/transactions/service.ts`
- Create: `apps/api/src/transactions/routes.ts`
- Test: `apps/api/test/transactions.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: 账户、分类、标签、账单 CRUD，游标分页流水，`createTransfer(command)`。

- [ ] **Step 1: 写金额、越权和幂等测试**

```ts
it('returns original transaction for replay', async () => {
  const first = await createExpense({ idempotency_key: 'device-1:42', amount_cents: 1200 })
  const second = await createExpense({ idempotency_key: 'device-1:42', amount_cents: 1200 })
  expect(second.id).toBe(first.id)
  expect(await countTransactions()).toBe(1)
})
```

- [ ] **Step 2: 实现 CRUD 与输入校验**

金额必须是正安全整数；账户、分类和标签属于同账本且未归档；备注最多 500 字；分页按 `occurred_at DESC, id DESC`；删除只写墓碑。

- [ ] **Step 3: 实现原子转账**

```ts
await runBatch(db, [
  insertTransfer.bind(transferId, ledgerId, fromId, toId, amount, occurredAt),
  insertEntry.bind(outId, ledgerId, fromId, -amount, transferId),
  insertEntry.bind(inId, ledgerId, toId, amount, transferId),
  insertIdempotency.bind(userId, idempotencyKey, transferId)
])
```

- [ ] **Step 4: 验证转账回滚并提交**

Run: `pnpm --filter @walnut/api test -- transactions.test.ts`
Expected: 任一语句失败不留下主记录或单边流水。

```bash
git add packages/contracts/src/transaction.ts apps/api/src/transactions apps/api/src/app.ts apps/api/test/transactions.test.ts
git commit -m "feat: add transactions and transfers"
```

### Task 6: 实现增量同步、墓碑与冲突协议

**Files:**
- Create: `packages/contracts/src/sync.ts`
- Create: `apps/api/src/sync/repository.ts`
- Create: `apps/api/src/sync/service.ts`
- Create: `apps/api/src/sync/routes.ts`
- Test: `apps/api/test/sync.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `POST /sync/push`、`GET /sync/pull`、`POST /sync/resolve`；`PushResult` 与 `PullResult`。

- [ ] **Step 1: 写过期版本与跨账本测试**

```ts
it('returns both versions for stale base version', async () => {
  const result = await push(updateFixture({ base_version: 1 }))
  expect(result.conflicts[0]).toMatchObject({
    entity_id: transactionId,
    client: { version: 2 },
    server: { version: 2, updated_by: editorB }
  })
})
```

- [ ] **Step 2: 实现 push 与 revision**

每批最多 50 项；接受的变更用 D1 batch 更新实体、增加 ledger revision、写 `sync_changes`。每项有幂等键，版本不匹配只返回冲突。

- [ ] **Step 3: 实现 pull、墓碑和显式解决**

`pull` 默认 200、最大 500 条，revision 升序并返回 `has_more`。解决方式为 `keep_local` 或 `use_server`，解决本身产生新版本和 revision。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/api test -- sync.test.ts`
Expected: 覆盖重复 push、分页 pull、删除/修改冲突和无权限账本。

```bash
git add packages/contracts/src/sync.ts apps/api/src/sync apps/api/src/app.ts apps/api/test/sync.test.ts
git commit -m "feat: add incremental sync protocol"
```

### Task 7: 实现预算、报表、CSV/Excel 导出与维护任务

**Files:**
- Create: `packages/contracts/src/report.ts`
- Create: `apps/api/src/reports/repository.ts`
- Create: `apps/api/src/reports/routes.ts`
- Create: `apps/api/src/exports/csv.ts`
- Create: `apps/api/src/exports/xlsx.ts`
- Create: `apps/api/src/exports/routes.ts`
- Create: `apps/api/src/jobs/scheduled.ts`
- Test: `apps/api/test/reports.test.ts`
- Test: `apps/api/test/jobs.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/wrangler.toml`

**Interfaces:**
- Produces: 月度汇总、分类占比、日趋势、预算进度、CSV/XLSX 导出、`scheduled()`。

- [ ] **Step 1: 写时区、退款和转账排除测试**

```ts
it('excludes transfers and subtracts refunds', async () => {
  const result = await monthlySummary({ month: '2026-09', timezone: 'Asia/Shanghai' })
  expect(result).toEqual({ income_cents: 800000, expense_cents: 123400, balance_cents: 676600 })
})
```

- [ ] **Step 2: 实现有界聚合与预算**

查询必须包含 `ledger_id`、起止时间并命中索引。转账不计收支，退款抵减原分类，预算按账本时区自然月计算。

- [ ] **Step 3: 实现 CSV 与 R2**

CSV 对以 `= + - @` 开头文本前置单引号，添加 UTF-8 BOM；XLSX 使用纯 JavaScript workbook 生成器并将金额单元格写为两位小数数值。导出对象写私有 R2；下载重新校验账本权限并短期有效。

- [ ] **Step 4: 实现 Cron 清理与逻辑备份**

```ts
it('retains recent tombstones', async () => {
  await runScheduled(env, new Date('2026-09-21T00:00:00Z'))
  expect(await exists(recentTombstone)).toBe(true)
  expect(await exists(expiredTombstone)).toBe(false)
})
```

备份按表分页生成含 schema version 的 JSONL 写入 R2；失败保留上次成功备份。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @walnut/api test -- reports.test.ts jobs.test.ts`
Expected: PASS。

```bash
git add packages/contracts/src/report.ts apps/api/src/reports apps/api/src/exports apps/api/src/jobs apps/api/src/app.ts apps/api/wrangler.toml apps/api/test
git commit -m "feat: add reports exports and jobs"
```

## Phase B：Ionic/Capacitor 本地优先客户端

### Task 8: 建立移动端骨架与双本地数据库适配器

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/vite.config.ts`
- Create: `apps/mobile/capacitor.config.ts`
- Create: `apps/mobile/src/main.ts`
- Create: `apps/mobile/src/app/router.ts`
- Create: `apps/mobile/src/app/App.vue`
- Create: `apps/mobile/src/core/database/types.ts`
- Create: `apps/mobile/src/core/database/sqlite.ts`
- Create: `apps/mobile/src/core/database/indexed-db.ts`
- Test: `apps/mobile/src/core/database/database.test.ts`

**Interfaces:**
- Produces: `LocalDatabase`、`saveWithOutbox()`、四导航与中央记账路由。

- [ ] **Step 1: 写 SQLite/IndexedDB 契约测试**

```ts
for (const createDatabase of [createTestSqliteDatabase, createTestIndexedDbDatabase]) {
  it('persists transaction and outbox together', async () => {
    const db = await createDatabase()
    await db.saveWithOutbox(expense, createOperation(expense))
    expect(await db.getTransaction(expense.id)).toEqual(expense)
    expect(await db.listPendingOutbox()).toHaveLength(1)
  })
}
```

- [ ] **Step 2: 实现统一接口和迁移**

```ts
export interface LocalDatabase {
  saveWithOutbox(transaction: LocalTransaction, operation: OutboxOperation): Promise<void>
  listTransactions(query: TransactionQuery): Promise<Page<LocalTransaction>>
  listPendingOutbox(limit?: number): Promise<OutboxOperation[]>
  applyPullPage(page: PullResult): Promise<void>
}
```

原生用 SQLite transaction，浏览器预览用 Dexie transaction；共享 schema version 和契约测试。

- [ ] **Step 3: 实现 Ionic Shell**

`/bills`、`/reports`、`/accounts`、`/me` 为底部页，`/entry` 为中央按钮打开的全屏页。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/mobile test`
Expected: 数据库和路由测试 PASS。

```bash
git add apps/mobile
git commit -m "feat: scaffold ionic offline client"
```

### Task 9: 实现登录注册、API 客户端与安全会话

**Files:**
- Create: `apps/mobile/src/core/api/client.ts`
- Create: `apps/mobile/src/core/api/errors.ts`
- Create: `apps/mobile/src/core/session/secure-store.ts`
- Create: `apps/mobile/src/core/session/session-store.ts`
- Create: `apps/mobile/src/features/auth/LoginPage.vue`
- Create: `apps/mobile/src/features/auth/RegisterPage.vue`
- Create: `apps/mobile/src/features/auth/DevicesPage.vue`
- Test: `apps/mobile/src/features/auth/auth.test.ts`

**Interfaces:**
- Produces: `ApiClient.request<T>()`、刷新单飞锁、`SessionStore`。

- [ ] **Step 1: 写并发 401 测试**

```ts
it('performs one refresh for concurrent 401 responses', async () => {
  await Promise.all([client.get('/ledgers'), client.get('/auth/devices')])
  expect(mockServer.refreshCalls).toBe(1)
})
```

- [ ] **Step 2: 实现安全存储和 API 客户端**

原生 Token 写 Android Keystore/iOS Keychain；浏览器测试只用内存。刷新失败清空会话并跳转登录。

- [ ] **Step 3: 实现邀请码注册、登录和设备页**

Zod 校验并区分邀请码无效、用户名占用、密码错误、网络离线；已登录用户离线时仍进入本地账本。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/mobile test -- auth.test.ts`
Expected: PASS。

```bash
git add apps/mobile/src/core/api apps/mobile/src/core/session apps/mobile/src/features/auth
git commit -m "feat: add mobile authentication"
```

### Task 10: 实现快捷记账分类区与专用键盘

**Files:**
- Create: `apps/mobile/src/features/entry/EntryPage.vue`
- Create: `apps/mobile/src/features/entry/CategoryGrid.vue`
- Create: `apps/mobile/src/features/entry/AmountDisplay.vue`
- Create: `apps/mobile/src/features/entry/NumericKeypad.vue`
- Create: `apps/mobile/src/features/entry/QuickAttributes.vue`
- Create: `apps/mobile/src/features/entry/amount-machine.ts`
- Test: `apps/mobile/src/features/entry/amount-machine.test.ts`
- Test: `apps/mobile/src/features/entry/EntryPage.test.ts`

**Interfaces:**
- Produces: `reduceAmount(state, key)`、`EntryDraft`、`save()`、`saveAndContinue()`。

- [ ] **Step 1: 写金额状态机测试**

```ts
it.each([
  [['1', '2', '.', '3', '4'], '12.34'],
  [['1', '0', '+', '2', '='], '12.00'],
  [['5', '-', '2', '='], '3.00'],
  [['1', '2', 'backspace'], '1']
])('%j => %s', (keys, expected) => {
  expect(keys.reduce(reduceAmount, initialAmountState()).display).toBe(expected)
})
```

- [ ] **Step 2: 实现状态机**

最多两位小数，结果为正安全整数分；加减即时计算；无效按键保持原状态并轻提示。

- [ ] **Step 3: 实现固定页面布局**

顶部切换支出/收入/转账；20 个主要分类直接显示在独立滚动区；金额、日期、账户、成员、备注和键盘固定在下部；金额使用非 input 展示，禁止系统键盘。

- [ ] **Step 4: 写本地保存测试**

```ts
it('saves locally without network', async () => {
  await selectCategory('餐饮')
  await pressKeys(['2', '8', '.', '5'])
  await click('完成')
  expect(localDb.saveWithOutbox).toHaveBeenCalledOnce()
  expect(api.post).not.toHaveBeenCalled()
})
```

同时验证 44px 点击区域、选中态、读屏标签和“保存并继续记一笔”。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @walnut/mobile test -- amount-machine.test.ts EntryPage.test.ts`
Expected: PASS。

```bash
git add apps/mobile/src/features/entry
git commit -m "feat: add fast transaction entry"
```

### Task 11: 实现账单、账户、预算与统计页面

**Files:**
- Create: `apps/mobile/src/features/bills/BillsPage.vue`
- Create: `apps/mobile/src/features/bills/BillDetailPage.vue`
- Create: `apps/mobile/src/features/accounts/AccountsPage.vue`
- Create: `apps/mobile/src/features/accounts/TransferPage.vue`
- Create: `apps/mobile/src/features/reports/ReportsPage.vue`
- Create: `apps/mobile/src/features/budgets/BudgetPage.vue`
- Create: `apps/mobile/src/components/VirtualTransactionList.vue`
- Test: `apps/mobile/src/features/bills/BillsPage.test.ts`
- Test: `apps/mobile/src/features/reports/ReportsPage.test.ts`

**Interfaces:**
- Consumes: 本地分页查询、报表 contracts、转账 Outbox。

- [ ] **Step 1: 写 10,000 条虚拟列表测试**

```ts
it('renders only visible rows', async () => {
  renderBills(makeTransactions(10_000))
  expect(screen.getAllByTestId('transaction-row').length).toBeLessThan(80)
  await scrollToIndex(9_999)
  expect(screen.getByText('流水 10000')).toBeVisible()
})
```

- [ ] **Step 2: 实现本地流水、详情与筛选**

按日期分组分页读取；支持关键字、类型、分类、账户、成员和时间；编辑删除先写本地与 Outbox。

- [ ] **Step 3: 实现账户、转账、预算与报表**

账户余额由本地流水重建；报表先显示本地结果，联网后以服务端汇总校准；分类和日期可下钻。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/mobile test -- BillsPage.test.ts ReportsPage.test.ts`
Expected: PASS。

```bash
git add apps/mobile/src/features apps/mobile/src/components
git commit -m "feat: add bills accounts and reports"
```

### Task 12: 实现同步引擎、冲突处理与共享账本

**Files:**
- Create: `apps/mobile/src/core/sync/sync-engine.ts`
- Create: `apps/mobile/src/core/sync/sync-scheduler.ts`
- Create: `apps/mobile/src/core/sync/backoff.ts`
- Create: `apps/mobile/src/features/sync/ConflictPage.vue`
- Create: `apps/mobile/src/features/ledgers/LedgerSwitcher.vue`
- Create: `apps/mobile/src/features/ledgers/MembersPage.vue`
- Create: `apps/mobile/src/features/ledgers/JoinLedgerPage.vue`
- Test: `apps/mobile/src/core/sync/sync-engine.test.ts`
- Test: `apps/mobile/src/features/ledgers/ledgers.test.ts`

**Interfaces:**
- Produces: `SyncEngine.run(ledgerId)`、`SyncScheduler`、冲突解决 UI。

- [ ] **Step 1: 写中断恢复测试**

```ts
it('keeps outbox after interrupted push', async () => {
  api.push.mockRejectedValueOnce(new TypeError('network offline'))
  await expect(engine.run(ledgerId)).rejects.toThrow('network offline')
  expect(await db.listPendingOutbox()).toHaveLength(2)
  api.push.mockResolvedValueOnce(acceptedPush)
  await engine.run(ledgerId)
  expect(await db.listPendingOutbox()).toHaveLength(0)
})
```

- [ ] **Step 2: 实现 push-then-pull 和退避**

同账本互斥；先 push、保存确认，再分页 pull 并事务合并。网络恢复、回前台、手动刷新和新增触发；退避 2s、5s、15s、60s，上限 5 分钟并带抖动。

- [ ] **Step 3: 实现冲突与共享账本 UI**

冲突页并列展示本机/服务器字段、修改人与时间，选择 `keep_local` 或 `use_server`。加入账本先预览再确认；按钮按角色控制，但权限仍由 Worker 裁决。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @walnut/mobile test -- sync-engine.test.ts ledgers.test.ts`
Expected: PASS。

```bash
git add apps/mobile/src/core/sync apps/mobile/src/features/sync apps/mobile/src/features/ledgers
git commit -m "feat: add offline sync and shared ledgers"
```

## Phase C：原生打包、验证与交付

### Task 13: 配置 Capacitor 原生工程与设备能力

**Files:**
- Modify: `apps/mobile/capacitor.config.ts`
- Create: `apps/mobile/android/`
- Create: `apps/mobile/ios/`
- Create: `apps/mobile/src/core/platform/haptics.ts`
- Create: `apps/mobile/src/core/platform/files.ts`
- Create: `apps/mobile/src/features/settings/ExportPage.vue`
- Test: `apps/mobile/src/core/platform/platform.test.ts`

**Interfaces:**
- Produces: `hapticTap()`、`saveExportFile()`、Android/iOS 原生工程。

- [ ] **Step 1: 写平台降级测试**

```ts
it('uses web download when Filesystem is unavailable', async () => {
  await saveExportFile(csvBlob, '核桃记账-2026-09.csv', webPlatform)
  expect(webPlatform.download).toHaveBeenCalledWith(csvBlob, '核桃记账-2026-09.csv')
})
```

- [ ] **Step 2: 配置原生工程**

应用 ID `cn.hetao.ledger`，显示名“核桃记账”。配置网络、安全区域、深色模式、文件和触感；生产仅允许 HTTPS API。

- [ ] **Step 3: 实现导出与触感**

数字键和保存成功使用轻触感，不支持时静默降级。导出走系统分享/文件选择器，不申请全盘存储权限。

- [ ] **Step 4: 同步并验证构建**

Run: `pnpm --filter @walnut/mobile build && pnpm --filter @walnut/mobile exec cap sync`
Expected: Web 构建及 Android/iOS 同步成功。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile
git commit -m "feat: configure capacitor native apps"
```

### Task 14: 端到端测试、性能门槛、部署与文档

**Files:**
- Create: `tests/e2e/auth-ledger-entry.spec.ts`
- Create: `tests/e2e/offline-sync-conflict.spec.ts`
- Create: `tests/e2e/permissions.spec.ts`
- Create: `scripts/seed-performance-data.ts`
- Create: `docs/api/openapi.yaml`
- Create: `docs/deployment/cloudflare.md`
- Create: `docs/deployment/backup-restore.md`
- Create: `docs/testing/device-matrix.md`
- Modify: `package.json`

**Interfaces:**
- Produces: 可重复部署、OpenAPI、恢复演练、设备测试记录和发布构建。

- [ ] **Step 1: 写核心 E2E**

```ts
test('creates expense offline then syncs', async ({ page, context }) => {
  await registerWithInvite(page, 'TEST-INVITE')
  await context.setOffline(true)
  await createExpense(page, { category: '餐饮', amount: '28.50' })
  await expect(page.getByText('待同步')).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: '立即同步' }).click()
  await expect(page.getByText('已同步')).toBeVisible()
})
```

- [ ] **Step 2: 增加权限与冲突 E2E**

验证 viewer 不能记账、editor 不能管理成员、owner 可转让；两设备修改同账单后出现冲突页，选择结果两端一致。

- [ ] **Step 3: 执行性能基准**

种入 10,000 条流水；中低端 Android 检查键盘下一帧反馈、列表无持续卡顿、本地冷启动可用。记录设备、系统、WebView、首屏时间、帧率和同步 500 条耗时。

- [ ] **Step 4: 编写部署与恢复文档**

包含 D1 migrations、Secrets、R2/D1/Cron、额度观察、回滚、D1 Time Travel、R2 备份恢复、APK/AAB 构建。OpenAPI 覆盖全部接口与错误码。

- [ ] **Step 5: 完整验证**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build`
Expected: 全部退出码为 0，无跳过的核心用例。

- [ ] **Step 6: 提交**

```bash
git add tests scripts docs package.json
git commit -m "test: complete mvp delivery verification"
```

## 最终完成条件

- Android APK/AAB 可安装，iOS 工程可在 Xcode 签名构建。
- 邀请码注册、登录、设备管理可用。
- 支出、收入、转账、编辑、删除断网可用并恢复同步。
- 快速记账分类可见、键盘固定且不弹系统键盘。
- 共享账本权限、邀请、成员管理和冲突处理通过 E2E。
- 账单、账户、预算、基础报表与 CSV/XLSX 导出可用。
- Workers、D1、R2、Cron 可通过 Wrangler 部署，不依赖自建服务器。
- 自动化测试、10,000 条性能测试、备份恢复演练均有记录。

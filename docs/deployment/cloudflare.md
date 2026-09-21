# Cloudflare 部署

## 前置条件

安装 Node.js 20+、pnpm 11，登录 Cloudflare：`pnpm --filter @walnut/api exec wrangler login`。

## 创建资源

```bash
pnpm --filter @walnut/api exec wrangler d1 create walnut-ledger
pnpm --filter @walnut/api exec wrangler r2 bucket create walnut-ledger-files
```

把 D1 返回的 `database_id` 写入 `apps/api/wrangler.toml`，然后设置密钥并迁移：

R2 需要先在 Cloudflare Dashboard 中启用；未启用时可以省略 `[[r2_buckets]]`，账本、同步和报表仍可使用，只有文件导出与逻辑备份不可用。

```bash
pnpm --filter @walnut/api exec wrangler secret put ACCESS_TOKEN_SECRET
pnpm --filter @walnut/api exec wrangler d1 migrations apply walnut-ledger --remote
pnpm --filter @walnut/api exec wrangler deploy
```

密钥至少 32 个随机字节。生产 App 的 API 地址必须使用 Workers 的 HTTPS 地址。发布前检查 D1、R2、Workers 请求量和 Cron 用量是否仍在免费额度内。

## 原生构建

```bash
pnpm --filter @walnut/mobile build
pnpm --filter @walnut/mobile exec cap sync
pnpm --filter @walnut/mobile exec cap open android
pnpm --filter @walnut/mobile exec cap open ios
```

Android Studio 生成签名 APK/AAB；Xcode 生成 iOS Archive。签名密钥和证书不要提交到仓库。

## Web 预览部署

```bash
pnpm --filter @walnut/mobile build
pnpm --filter @walnut/api exec wrangler pages deploy ../mobile/dist --project-name walnut-ledger --branch main
```

首次执行会创建 Pages 项目。`apps/mobile/public/_redirects` 保证 `/login`、`/register` 等客户端路由可以直接访问。

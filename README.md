# 核桃记账

无会员、无广告、离线优先的多用户共享记账应用。前端为 Vue 3 + Capacitor，后端为 Cloudflare Workers + D1 + R2。

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

本地 API：`pnpm --filter @walnut/api dev`；移动端预览：`pnpm --filter @walnut/mobile dev`。手机不能访问电脑的 `localhost`，局域网调试请让 Vite 监听 `0.0.0.0` 并使用电脑局域网 IP，或直接安装 Capacitor 调试包。

部署见 `docs/deployment/cloudflare.md`，恢复见 `docs/deployment/backup-restore.md`。

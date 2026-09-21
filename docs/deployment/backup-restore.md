# 备份与恢复

- D1：优先使用 Cloudflare D1 Time Travel 恢复到事故前时间点；恢复前暂停写入并记录当前 bookmark。
- R2：导出文件与逻辑备份位于私有 bucket，不开放公共读取。
- 逻辑恢复：校验备份中的 schema version，建立新 D1 数据库，按外键顺序导入 users、ledgers、members、resources、transactions、sync_changes，再切换 Worker binding。
- 演练：每季度在独立数据库执行一次恢复，核对表行数、账本余额、最新 revision 和随机 20 笔流水。
- 回滚：部署失败时回滚 Worker 版本；数据库迁移只向前修复，不覆盖原库。

# 日常：GitHub Pages + Supabase 免费共享记事本

保留原有界面。待办、项目和日记保存到同一张 PostgreSQL 表，所有访客无需注册或手动登录即可共享读写。打开或刷新页面读取最新内容，无需部署自己的服务器。

## 新版界面

- 待办使用固定 19×19 像素的方框，三个模块在桌面上顶部对齐。
- 项目默认只显示标题和展开箭头，保存成功后自动收起；先显示前 3 个项目，底部渐隐提示可展开或收起其余项目。手动折叠时保留未保存的编辑内容。
- 上方浅铅灰色「流水账」支持随输入自动增高和全屏沉浸式书写；退出全屏保留草稿，提交后只存入「日志箱」。
- 日历默认折叠为日期按钮，点击小箭头展开，选定日期后收起。
- 第三栏仅预览最近提交的 4 条小纸条；所有小纸条（包括原有日记）均保留在底部「小纸条」中。
- 「日志箱」与「小纸条」按记录日期倒序分组，顶部横排日期可点击跳转，同日记录按提交时间倒序排列。
- 两个归档页和全屏书写均可用关闭按钮或 Esc 返回，保存失败时不清空草稿。

已有 Supabase 表无需修改或重新执行 SQL。存储模块将流水账作为带保留标题 `__little_days_daily_log_v1__` 的 diary 行保存，读回时映射为 log；普通日记保持原样。不要手动改动该保留标题。

## 当前状态

- Supabase Project URL 和前端 Publishable Key 已填入 `config.js`。
- 用户已在 Supabase 成功执行建表 SQL。实际读取返回 HTTP 200，跨域响应允许 `https://yves-lunar.github.io`，写入预检也已通过。
- 已用独立临时记录完成真实新增、修改、再次读取和删除验证，测试记录已清理。原有数据未修改。GitHub Pages 发布及双设备页面验证仍需完成。

## 第一步：创建数据表（只需一次）

1. 打开 [项目 SQL Editor](https://supabase.com/dashboard/project/wgabwfewcexgcicdqmjd/sql/new)。
2. 复制仓库中 **supabase-init.sql** 的全部内容，粘贴到新查询并点击 **Run**。
3. 显示成功后，进入 Table Editor，确认存在 `little_days_items` 表。

脚本创建表、开启 RLS，并仅给该表设置共享读写权限。访客都可以读取、修改和删除别人的记录，这是当前共享记事本的预期行为。它不删除数据，也不改变其他表的访问策略。无需手动创建字段。

如提示权限或数据表无法访问，在 Integrations → Data API 确认 Data API 已启用且 `public` schema 可访问。脚本已包含该表需要的 GRANT 和 RLS 策略，无需全局开启新表默认公开权限。

**不需要执行腾讯云的建表文件，也不需要购买跨域域名功能或配置登录回调地址。**

## 第二步：发布

将以下文件一起提交到 GitHub Pages 发布分支的根目录：

- `index.html`
- `config.js`
- `supabase-store.js`
- `app.js`
- `notebook-ui.js`
- `notebook-model.js`
- `notebook.css`
- `style.css`
- `favicon.svg`

无需安装依赖或构建，也不依赖外部 JavaScript CDN。`supabase-init.sql` 上传 GitHub 不会自动执行，需先完成第一步。

`config.js` 只放前端 `sb_publishable_` 密钥，不要填写 `sb_secret_`、service_role 密钥或数据库密码。

## 第三步：验证共享读写

1. 在电脑上添加待办、项目和日记。
2. 用手机或无痕窗口打开网站，确认能读取这些内容且无需登录。
3. 在第二台设备修改项目、勾选待办，刷新第一台设备查看更新。
4. 删除一条测试记录，刷新另一台设备确认删除同步。

每次操作只修改对应记录，不覆盖整个记事本。列表会分页读取。保持原有的「打开或刷新读取最新数据」方式，不提供逐字实时协同；同时编辑同一条记录时，后保存的字段覆盖先保存的字段。

旧 Sites / CloudBase 数据不会自动迁移。新表为空属于正常情况；如有需要保留的旧数据，应另外备份和迁移。

## 免费额度与使用限制

根据 [Supabase 定价](https://supabase.com/pricing)，Free 计划包含 500 MB 数据库、5 GB 出口流量，低活跃约一周可能暂停项目。暂停后需要到控制台恢复；不能保证免费项目始终在线。保持 Free 计划，不需要为本项目升级付费。

## 排错

- `PGRST205` / 表未创建：确认在此 Supabase 项目执行了 `supabase-init.sql`；刚创建后等待元数据刷新。
- 401：确认 URL 和 Publishable Key 属于同一项目。
- 403 / 42501：检查 Data API、表级 GRANT 和 RLS 策略是否生效。
- 读取为空：新表本来就为空；如果表中有数据却读不到，检查 RLS 读权限。
- 网络失败：确认项目未暂停，并测试当前设备能否访问项目接口。

## 本地检查

运行 `node --test tests/supabase-store.test.cjs tests/notebook-model.test.cjs`。12 项测试覆盖共享读写、分页、流水账兼容保存、归档分组与最近 4 条筛选。

运行 `node tests/serve-preview.cjs` 后打开 `http://127.0.0.1:8080`，可使用纯模拟数据预览界面；不访问真实数据库。预览中正文含 `[模拟失败]` 可测试保存失败时保留草稿。部署时不需要上传 `tests` 文件夹。

`app.js` 保留原打包依赖并提供 React 运行时；可维护的界面代码位于 `notebook-ui.js`，日期分组逻辑在 `notebook-model.js`，新增样式在 `notebook.css`。

## 官方参考

- [Data API 与 apikey 请求头](https://supabase.com/docs/guides/api/creating-routes)
- [Publishable Key](https://supabase.com/docs/guides/getting-started/api-keys)
- [GRANT 与 RLS](https://supabase.com/docs/guides/database/secure-data)

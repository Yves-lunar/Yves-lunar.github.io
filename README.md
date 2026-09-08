# 日常 · 个人主页源码

这是已交付主页的完整项目源码，包含页面、样式、组件、保存接口、数据库结构及迁移文件。源码不包含已安装依赖、构建产物、访问凭据或线上个人数据。

## 本地运行

需要 Node.js 22.13 或更高版本，以及 pnpm。
解压后进入 little-days 文件夹，在终端依次执行：

```sh
pnpm install
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fixed_sasquatch.sql
pnpm dev
```

打开终端显示的本地地址，通常为 http://localhost:3000/ 。运行期间请保持终端打开。
首次运行需执行数据库初始化命令；以后直接执行 pnpm dev 即可。本地数据与线上数据独立，本地数据保存在 .wrangler/state，删除该文件夹会清空本地记录。

## 主要文件

- app/page.tsx：三栏主页、待办、项目记事、日历和日记交互。
- app/globals.css：马卡龙配色、排版、响应式布局。
- app/layout.tsx：网页标题、描述和语言设置。
- app/api/items/route.ts：内容读取、添加、修改和删除接口。
- db/schema.ts：数据表结构。
- drizzle/：数据库迁移文件。
- components/ui/：界面基础组件。
- .openai/hosting.json：当前 Sites 项目与数据库绑定配置。

这是带保存服务的 React / TypeScript 项目，不是双击即可运行的单个 HTML 文件。线上版本使用 Sites 私人访问控制；独立部署到其他平台时需要配置数据库和适当的访问控制。

当前线上地址：https://little-days-arrodes.miaa-wrs.chatgpt.site

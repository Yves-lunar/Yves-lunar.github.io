# 日常：GitHub Pages 云端共享版

## 上传方式

1. 解压本压缩包。
2. 把里面的文件直接上传到 GitHub 仓库根目录，确保 index.html 出现在仓库首页，不要再套一层文件夹。
3. 仓库 Settings → Pages → Source 选择 Deploy from a branch，分支选择 main（或你实际上传的分支），目录选择 /(root)，点击 Save。
4. 等待 GitHub 的 Pages 发布完成，再打开 github.io 地址。如仍显示旧内容，请强制刷新。

官方设置说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 文件

- index.html：网页入口（必须上传）。
- app.js：已打包的网页功能，无需安装 Node.js、运行命令或依赖外部 JavaScript CDN。
- style.css：页面样式。
- config.js：已配置好的公开云端服务地址，不含密码或密钥。
- favicon.svg：网页图标。
- .nojekyll：让 GitHub Pages 按静态文件发布，建议一并上传。

## 保存方式

这是云端共享版，不是浏览器本地保存版。GitHub Pages 展示网页，现有 Sites 云端服务保存待办、项目和日记。所有设备和访客读写同一份数据，不需要登录。其他设备打开或刷新页面即可读取最新内容；不提供逐字实时协同编辑。

无需修改 config.js。请保留现有云端服务的公开访问设置；GitHub Pages 本身不提供数据库。如果关闭或删除云端服务，网页仍会显示，但无法读取或保存数据。

此包不包含任何现有日记内容、数据库副本、登录凭据或个人密钥。不要将旧 React 项目当作这份静态发布包使用。

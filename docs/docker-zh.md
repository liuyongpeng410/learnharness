# LearnHarness Docker 部署（Windows Docker Desktop）

本目录是一份可自行构建的本地部署。官方仓库没有受支持的 Docker 镜像，请不要拉取任何第三方 LearnHarness 镜像。镜像只在你自己的 Docker Desktop 里构建，不会被推送到仓库。

适用环境：Docker Desktop 使用 Linux 容器、linux/amd64 引擎。构建在 Linux 容器内完成，避免在 Windows 上直接生成 standalone 目录（Windows 的符号链接结果不能搬进 Linux 镜像）。

## 准备

- 安装 Docker Desktop，并确认是 Linux 容器，不是 Windows 容器。
- 构建需要访问 Docker Hub 上的官方镜像 `node:26-bookworm-slim`，以及 npmjs.org。应用要求与 CI 相同的 Node 26。
- 给 Docker Desktop 预留至少 8 GB 内存和数 GB 磁盘。构建会安装编译工具、按 lockfile 安装依赖，再编译插件和 Next.js standalone。Electron 是 lockfile 里的桌面开发依赖；standalone 组装时会从运行镜像里去掉它。
- 已在 linux/amd64 上测过：含拉取基础镜像的一次完整 `docker compose build` 约 2 分 4 秒，本地镜像 `learnharness:0.7.0` 约 636 MB。基础镜像固定为 `node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1`。网络慢时下载会更久。
- 解压部署包后直接在该目录构建，不需要再克隆仓库。包根目录的 `PINNED_SOURCE_REF` 是打进该包的提交。

## 构建、启动、状态、停止

把下面路径换成解压后的目录。四条命令都不会删除数据卷。

```powershell
docker compose --project-directory "C:\path\to\learnharness-docker" --project-name learnharness build
docker compose --project-directory "C:\path\to\learnharness-docker" --project-name learnharness up --detach
docker compose --project-directory "C:\path\to\learnharness-docker" --project-name learnharness ps
docker compose --project-directory "C:\path\to\learnharness-docker" --project-name learnharness stop
```

状态还可以看健康检查：

```powershell
docker inspect --format "{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}" learnharness
```

`stop` 之后再次运行，用下面这条。它只启动已有容器，不新建卷，也不删除卷。

```powershell
docker compose --project-directory "C:\path\to\learnharness-docker" --project-name learnharness start
```

浏览器打开 `http://127.0.0.1:3000`。容器内部监听 `0.0.0.0:3000`，这样 Docker 才能把端口转进去。主机侧只发布 `127.0.0.1:3000`。不要改成 `0.0.0.0:3000`，也不要去掉地址里的 `127.0.0.1`。

容器名是 `learnharness`。不要启动、停止或删除其他容器，包括已经停着的 `deeptutor`。

## 数据与空凭据

命名卷 `learnharness-data` 挂在容器内的 `/var/lib/learnharness`。学习记录在 `/var/lib/learnharness/data`（`LH_DATA_DIR`），密钥文件在 `/var/lib/learnharness/auth.json`（`LH_AUTH_FILE`）。首次启动若还没有该文件，会写成空对象 `{}`，权限 `0600`。已有文件不会被覆盖。

卷与容器分离。`stop` 和上面的 `start` 都会留下这份数据。不要执行 `docker compose down -v`，不要执行 `docker volume rm learnharness-data`。

镜像和 compose 文件里没有 API 密钥，也不会读取 Windows 用户环境里的密钥。没有在设置中自行保存密钥之前，不会配置模型供应商。本部署不代填密钥，也不连接任何账号。

## 浏览器模式的限制

这是不带桌面包壳的浏览器模式，没有登录。本机任何能打开 `http://127.0.0.1:3000` 的程序都能读取聊天和设置、改已保存的密钥、发起对话。端口只绑在本机回环地址，是为了不让局域网里的其他机器连上。这不是多用户服务，也没有按用户隔离。

同一台电脑上的本机文件路径不会进入容器。部署不挂载主机目录，也不挂载 Docker 套接字，不使用特权模式。把 `C:\...` 贴进会话，容器里的进程看不到那份 Windows 文件。

镜像里没有 Chrome/Chromium，也没有 Electron。官方运行时不会另外下载 Chromium。依赖本机浏览器或 Electron 浏览器辅助进程的演示核对，在这个容器里不可用。Claude Code CLI 也不在镜像里。

ChatGPT 的登录回调监听服务器自己的 `127.0.0.1`。在这里那是容器内部，不是 Windows 主机，所以本部署完成不了这个回调。本包没有验证 Copilot 或 Grok 的设备码流程，也不去连接这些账号。

本地保存数据不等于处理过程都在本地。只有你自己配了模型、检索或听写之后，相应服务才会收到内容。

## 依赖告警

在 Node 26.13.1、npm 11.20.0 上对仓库根 `package-lock.json` 执行了 `npm audit`。没有执行 `npm audit fix`，也没有为了消告警而升级依赖。

- 整棵依赖树：critical 2、high 4、moderate 10，合计 16。两则 critical 来自开发依赖 `concurrently` 引到的 `shell-quote`。
- 去掉开发依赖（`npm audit --omit=dev`）：critical 0、high 3（`puppeteer-core`、`chromium-bidi`、`zod`）、moderate 2（`hono`、`@hono/node-server`）。运行镜像使用的是 standalone 追踪结果，生产依赖仍在其中，所以上面的 high 不会因为“这是 Docker 镜像”而消失。

`plugins:setup` 时，`ui-showcase` 自己的 lockfile 报告了 3 个 high，另外四个插件报告 0。`ui-showcase` 是开发示例，不是打进 `core-plugins` 的四个核心插件。

这些是锁文件里的既有告警。把它们写在这里只是如实记录，不表示镜像已经过安全审计，也不表示问题已经修复或可以视为安全。

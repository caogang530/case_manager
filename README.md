# Casework · 测试用例工作台

在 `codex/verdict-greenfield` 分支上，运行 `npm --prefix verdict start` 启动 Verdict。[Verdict 工作台说明](verdict/README.md)

用例按模块组织，每个叶子节点是一条用例。用例库可以导入和导出 XMind 文件，测试计划从用例库创建快照并独立记录执行结果。

Vue 3、Pinia 和 Element Plus 提供前端工作台，FastAPI 和 SQLite 提供数据存储。现有数据库可以直接使用。

## 工作流

- 用例库支持导入新版 `content.json` 与旧版 `content.xml` 的 XMind 文件。可以拖入或选择多个文件。用例库编辑后自动保存。
- 编辑器支持大纲与导图切换。双击标题可编辑，属性栏可设置优先级、备注、图标、颜色和图片。导图支持拖动、滚轮平移和缩放适应。
- 测试计划支持直接选择执行状态、复选框多选、范围选择和全选匹配。可用「标记所选」或数字键批量操作。点击「保存」后才写入数据库，也可将计划结构同步到来源库。
- 可组合关键词、优先级和执行状态筛选，并跳转到上一条或下一条匹配。修改状态后可点「刷新匹配」。
- 按 `⌘/Ctrl+K` 快速搜索用例库和测试计划。打开单项时才加载完整节点和图片。

| 快捷键 | 行为 |
|---|---|
| `⌘/Ctrl+K` | 快速查找 |
| `⌘/Ctrl+S` | 保存 |
| `F2` 或双击标题 | 编辑标题 |
| `Tab` / `Enter` | 在编辑区内选中节点后添加子节点 / 同级节点 |
| `Delete` / `Backspace` | 删除选中节点 |
| `↑ ↓ ← →` | 在节点间导航 |
| `Esc` | 取消编辑或取消选择 |
| `⌘/Ctrl+C / X / V` | 复制、剪切、粘贴节点，或粘贴剪贴板图片 |
| `⌘/Ctrl+Z` / `⌘/Ctrl+Shift+Z` | 撤销 / 重做 |
| `1` / `2` / `3` / `4` / `5` | 通过 / 失败 / 阻塞 / 跳过 / 未执行 |

## 代码入口

- `src/views/ResourceIndex.vue` 提供资源列表和导入、新建、导出操作。
- `src/views/EditorWorkspace.vue` 提供编辑历史、属性与执行操作。
- `src/utils/xmind.js` 实现 XMind 文件转换。
- `server/main.py` 提供 API，并在生产模式下托管前端构建产物。

## 本地开发

### 环境要求
- Node.js ≥ 18
- Python 3.13（推荐用 [uv](https://docs.astral.sh/uv/) 管理虚拟环境）

### 0. 一键启动（推荐）

```bash
./start.sh
```

自动创建/复用 `.venv`、安装前后端依赖，并同时启动后端(8000)与前端(5173)。访问 **http://localhost:5173**，按 `Ctrl+C` 停止。

```bash
./start.sh stop    # 清理本项目残留的前后端进程(含手动启动后未退出的)
```

### 1. 启动后端（端口 8000)

```bash
# 首次:创建虚拟环境并安装依赖
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 启动(带热重载)
python -m server.main
```

启动后自动创建 `server/data.db` 及两张表，无需手动建库。

### 2. 启动前端（端口 5173，另开终端）

```bash
npm install
npm run dev
```

访问 **http://localhost:5173**。dev 服务器已把 `/api` 代理到 `http://localhost:8000`，无需处理跨域。

> 旧版本（纯 localStorage 时代）的数据会在首次打开时自动迁移到数据库（仅在数据库为空时触发）。

---

## 生产部署

### 方式零:Docker(推荐,一条命令)

仓库内置多阶段 `Dockerfile`(Node 构建前端 → Python 运行时托管),无需安装任何依赖:

```bash
# 构建镜像
docker build -t case-manager .

# 运行(数据持久化到名为 case-data 的卷)
docker run -d --name case-manager -p 8000:8000 -v case-data:/data case-manager
```

访问 **http://localhost:8000**。或使用 docker compose:

```bash
docker compose up -d --build
```

说明:
- 容器内数据库位于 `/data/data.db`(通过环境变量 `XCM_DB_PATH` 配置),挂载卷后删容器/重建镜像数据不丢
- 备份数据:`docker run --rm -v case-data:/data -v $PWD:/backup alpine cp /data/data.db /backup/`
- 修改端口映射:`-p 8080:8000` 即可改对外端口

### 方式一：单进程（推荐，最简单）

```bash
# 1. 构建前端
npm install
npm run build            # 产物输出到 dist/

# 2. 启动后端(检测到 dist/ 会自动托管,并支持前端路由回退)
source .venv/bin/activate
python -m server.main
```

访问 **http://localhost:8000** 即可，前后端同一个进程、同一个端口。

服务器上后台常驻示例：

```bash
nohup .venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
```

### 方式二：Nginx 反向代理

`npm run build` 后由 Nginx 托管 `dist/`，把 `/api` 转发给后端：

```nginx
server {
    listen 80;
    root /path/to/xmind_case_manager/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
    }

    # 前端路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

后端以 `--host 127.0.0.1` 运行即可，无需对外暴露。

### 数据备份
所有数据都在 `server/data.db` 一个文件里，定期复制该文件即完成备份：

```bash
cp server/data.db backup/data-$(date +%Y%m%d).db
```

---

## API 说明

树结构（`root`）和执行结果（`results`）以 JSON 整体存储，后端不感知内部语义。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/libraries` | 用例库列表（按更新时间倒序） |
| POST | `/api/libraries` | 新建用例库 `{id, name, root}` |
| PUT | `/api/libraries/{id}` | 更新（`name` / `root` 可选） |
| DELETE | `/api/libraries/{id}` | 删除用例库 |
| GET | `/api/plans` | 测试计划列表 |
| POST | `/api/plans` | 新建计划 `{id, name, libraryId, libraryName, root, results}` |
| PUT | `/api/plans/{id}` | 更新（`name` / `root` / `results` 可选） |
| DELETE | `/api/plans/{id}` | 删除计划 |

交互式接口文档：启动后端后访问 http://localhost:8000/docs (Swagger UI)。

---

## 常见问题

**Q: 点击「导入 XMind」文件选择框里文件是灰的？**
A: 已兼容（accept 放宽了 zip 相关类型）。如个别环境仍有问题，直接把 `.xmind` 文件**拖拽到用例库页面**即可导入。

**Q: 怎么给用例插图？**
A: 截图后选中目标节点按 `⌘/Ctrl+V` 即可。从 XMind 导入的文件里的节点图片也会自动带入。

**Q: 误删了节点/改错了怎么办？**
A: `⌘/Ctrl+Z` 撤销，最多可回退 30 步（用例库直接恢复并落库；测试计划恢复到草稿，保存后生效）。

**Q: 页面提示"无法连接后端服务"?**
A: 后端没启动。执行 `source .venv/bin/activate && python -m server.main`，开发模式下确认它在 8000 端口。

**Q: 端口冲突？**
A: 后端端口在 `server/main.py` 的 `uvicorn.run(...)` 中修改；前端代理在 `vite.config.js` 的 `server.proxy` 中同步修改。

**Q: 想多人共用一套数据？**
A: 按「生产部署」把服务跑在一台服务器上，团队成员访问同一地址即可共享数据。如需账号权限、并发编辑等能力，可把存储从 SQLite 换成 MySQL(API 层不变）。

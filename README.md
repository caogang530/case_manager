# XMind 用例管理平台

xmind 风格的测试用例管理 Web 平台。用例以思维导图树形结构组织，**最右侧的叶子节点即一条测试用例**；支持从测试计划对用例做通过/失败/阻塞标记并实时统计通过率；与 XMind 软件双向互通（导入/导出标准 `.xmind` 文件，含图片与执行结果标记）。

- 前端：Vue 3 + Vite + Pinia + Vue Router + Element Plus
- 后端：FastAPI(Python 3.13)
- 数据库：SQLite（单文件 `server/data.db`，零部署成本）

---

## 功能一览

### 用例库
- xmind 风格横向树形编辑：双击改标题、悬停添加子节点/删除节点
- 用例支持 **P0~P2 优先级打标**(单击选中叶子用例后在过滤条右侧设置),红/橙/蓝三色徽章展示
- **用例过滤**:关键词(命中用例或任意父级标题)、优先级多选;过滤时保留匹配用例的祖先链
- 只存储用例本身，不做执行标记
- 支持标准 `.xmind` 文件导入（新版 `content.json` 与旧版 `content.xml` 均兼容,优先级 marker 也会还原），支持按钮选择和**拖拽文件到页面**两种方式
- 节点中的**图片**会一并导入并在树中展示
- 可导出为 `.xmind`(优先级写成 priority-1/2/3 marker)，在 XMind 软件中直接打开

### 测试计划
- 从任意用例库**快照复制**创建(含优先级)，后续与用例库互不影响
- 用例标记四种状态：**未执行 / 通过 / 失败 / 阻塞**
  - 交互：单击节点 = 选中（蓝色描边），再次点击已选中的节点 = 循环切换状态
- **用例过滤**:关键词、状态多选、优先级多选,可组合
- 顶部实时统计：通过率、执行率、各状态数量；每个父节点显示 `通过数/总数` 进度
- 支持批量标记（全部通过 / 全部重置）
- **保存机制**：所有修改（含标记）先落在草稿，点击「保存」才写入数据库；有未保存修改时离开页面会弹窗提醒（保存并离开 / 放弃修改 / 取消），关闭浏览器标签页也会拦截
- **同步到用例库**：把计划中调整过的用例结构覆盖同步回来源用例库（同时保存计划）
- 导出 `.xmind` 时执行结果写成 XMind marker（通过 ✅ `task-done` / 失败 ❌ `symbol-wrong` / 阻塞 ⏸ `symbol-pause`)，图片写回 `resources/`,XMind 软件中可见

---

## 目录结构

```
xmind_case_manager/
├── server/
│   ├── main.py            # FastAPI 应用:CRUD API + 托管前端 dist + SPA 回退
│   ├── __init__.py
│   └── data.db            # SQLite 数据库(首次启动自动创建,已 gitignore)
├── src/
│   ├── main.js / App.vue  # 入口;App 启动时加载用例库和计划数据
│   ├── router/index.js    # /libraries、/libraries/:id、/plans、/plans/:id
│   ├── stores/
│   │   ├── data.js        # 后端 API 客户端(fetch 封装)+ localStorage 旧数据读取
│   │   ├── library.js     # 用例库 store:CRUD + 树编辑,操作即时落库
│   │   └── plan.js        # 测试计划 store:CRUD + 保存草稿;状态枚举与循环顺序
│   ├── utils/
│   │   ├── tree.js        # 树遍历、叶子收集、统计计算、克隆
│   │   └── xmind.js       # .xmind 导入导出(jszip,含图片与 marker)
│   ├── components/
│   │   ├── MindTreeNode.vue  # 递归 xmind 风格树节点(库/计划双模式 + 选中态)
│   │   └── StatsBar.vue      # 通过率统计条
│   └── views/
│       ├── LibraryList.vue / LibraryDetail.vue
│       └── PlanList.vue / PlanDetail.vue
├── requirements.txt       # Python 依赖
├── package.json           # 前端依赖
├── vite.config.js         # dev 服务器,/api 代理到 8000
├── test-case.xmind        # 示例:纯文本用例
└── test-image.xmind       # 示例:带图片的用例
```

---

## 本地开发

### 环境要求
- Node.js ≥ 18
- Python 3.13（推荐用 [uv](https://docs.astral.sh/uv/) 管理虚拟环境）

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

**Q: 导入后图片不显示？**
A: 平台支持节点图片（`xap:resources/...` 引用）。如果图片是加在 XMind 的「备注/笔记」里的，目前不会导入，需要的话可以再适配。

**Q: 页面提示"无法连接后端服务"?**
A: 后端没启动。执行 `source .venv/bin/activate && python -m server.main`，开发模式下确认它在 8000 端口。

**Q: 端口冲突？**
A: 后端端口在 `server/main.py` 的 `uvicorn.run(...)` 中修改；前端代理在 `vite.config.js` 的 `server.proxy` 中同步修改。

**Q: 想多人共用一套数据？**
A: 按「生产部署」把服务跑在一台服务器上，团队成员访问同一地址即可共享数据。如需账号权限、并发编辑等能力，可把存储从 SQLite 换成 MySQL(API 层不变）。

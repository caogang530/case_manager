"""XMind 用例管理平台后端:FastAPI + SQLite。

数据模型:
- libraries: 用例库(id, name, root JSON, created_at, updated_at)
- plans:     测试计划(id, name, library_id, library_name, root JSON, results JSON, created_at, updated_at)

root / results 以 JSON 字符串整体存储,前端负责结构语义,后端只做持久化。
"""

import json
import os
import sqlite3
import time

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 数据库路径可用环境变量覆盖(Docker 部署时指向挂载卷,如 /data/data.db)
DB_PATH = os.environ.get("XCM_DB_PATH", os.path.join(BASE_DIR, "data.db"))
DIST_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "dist"))

app = FastAPI(title="XMind Case Manager")

# 开发模式下 vite(5173) 直连后端时允许跨域;通过 vite proxy 或后端托管 dist 时用不到
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS libraries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                library_id TEXT,
                library_name TEXT,
                root TEXT NOT NULL,
                results TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )


init_db()


def now_ms() -> int:
    return int(time.time() * 1000)


def row_to_library(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "root": json.loads(row["root"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_plan(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "libraryId": row["library_id"],
        "libraryName": row["library_name"],
        "root": json.loads(row["root"]),
        "results": json.loads(row["results"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def leaf_ids(root: dict):
    stack = [root]
    while stack:
        node = stack.pop()
        children = node.get("children") or []
        if children:
            stack.extend(children)
        else:
            yield node.get("id")


def library_summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "caseCount": sum(1 for _ in leaf_ids(json.loads(row["root"]))),
    }


def percentage(count: int, total: int) -> float:
    return ((count * 2000 + total) // (2 * total)) / 10 if total else 0.0


def plan_summary(row: sqlite3.Row) -> dict:
    root = json.loads(row["root"])
    results = json.loads(row["results"])
    counts = dict.fromkeys(("unexecuted", "passed", "failed", "blocked", "skipped"), 0)
    for node_id in leaf_ids(root):
        status = results.get(node_id)
        counts[status if isinstance(status, str) and status in counts else "unexecuted"] += 1
    total = sum(counts.values())
    executed = total - counts["unexecuted"]
    return {
        "id": row["id"],
        "name": row["name"],
        "libraryId": row["library_id"],
        "libraryName": row["library_name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "stats": {
            **counts,
            "total": total,
            "executed": executed,
            "execRate": percentage(executed, total),
            "passRate": percentage(counts["passed"], total),
        },
    }


# ---------------- 用例库 ----------------


@app.get("/api/libraries")
def list_libraries(summary: bool = False) -> list[dict]:
    with get_conn() as conn:
        convert = library_summary if summary else row_to_library
        return [convert(row) for row in conn.execute("SELECT * FROM libraries ORDER BY updated_at DESC")]


@app.get("/api/libraries/{lib_id}")
def get_library(lib_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM libraries WHERE id = ?", (lib_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用例库不存在")
        return row_to_library(row)


@app.post("/api/libraries", status_code=201)
def create_library(payload: dict = Body(...)) -> dict:
    lib_id = payload.get("id")
    name = payload.get("name")
    root = payload.get("root")
    if not lib_id or not name or root is None:
        raise HTTPException(400, "缺少必填字段: id / name / root")
    ts = now_ms()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO libraries (id, name, root, created_at, updated_at)"
            " VALUES (?, ?, ?, COALESCE((SELECT created_at FROM libraries WHERE id = ?), ?), ?)",
            (lib_id, name, json.dumps(root, ensure_ascii=False), lib_id, ts, ts),
        )
        row = conn.execute("SELECT * FROM libraries WHERE id = ?", (lib_id,)).fetchone()
    return row_to_library(row)


@app.put("/api/libraries/{lib_id}")
def update_library(lib_id: str, payload: dict = Body(...)) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM libraries WHERE id = ?", (lib_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用例库不存在")
        name = payload.get("name", row["name"])
        root = payload.get("root")
        root_json = json.dumps(root, ensure_ascii=False) if root is not None else row["root"]
        conn.execute(
            "UPDATE libraries SET name = ?, root = ?, updated_at = ? WHERE id = ?",
            (name, root_json, now_ms(), lib_id),
        )
        row = conn.execute("SELECT * FROM libraries WHERE id = ?", (lib_id,)).fetchone()
    return row_to_library(row)


@app.delete("/api/libraries/{lib_id}", status_code=204)
def delete_library(lib_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM libraries WHERE id = ?", (lib_id,))


# ---------------- 测试计划 ----------------


@app.get("/api/plans")
def list_plans(summary: bool = False) -> list[dict]:
    with get_conn() as conn:
        convert = plan_summary if summary else row_to_plan
        return [convert(row) for row in conn.execute("SELECT * FROM plans ORDER BY updated_at DESC")]


@app.get("/api/plans/{plan_id}")
def get_plan(plan_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            raise HTTPException(404, "测试计划不存在")
        return row_to_plan(row)


@app.post("/api/plans", status_code=201)
def create_plan(payload: dict = Body(...)) -> dict:
    plan_id = payload.get("id")
    name = payload.get("name")
    root = payload.get("root")
    if not plan_id or not name or root is None:
        raise HTTPException(400, "缺少必填字段: id / name / root")
    results = payload.get("results") or {}
    ts = now_ms()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO plans (id, name, library_id, library_name, root, results, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM plans WHERE id = ?), ?), ?)",
            (
                plan_id,
                name,
                payload.get("libraryId"),
                payload.get("libraryName"),
                json.dumps(root, ensure_ascii=False),
                json.dumps(results, ensure_ascii=False),
                plan_id,
                ts,
                ts,
            ),
        )
        row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    return row_to_plan(row)


@app.put("/api/plans/{plan_id}")
def update_plan(plan_id: str, payload: dict = Body(...)) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            raise HTTPException(404, "测试计划不存在")
        name = payload.get("name", row["name"])
        root = payload.get("root")
        root_json = json.dumps(root, ensure_ascii=False) if root is not None else row["root"]
        results = payload.get("results")
        results_json = (
            json.dumps(results, ensure_ascii=False) if results is not None else row["results"]
        )
        conn.execute(
            "UPDATE plans SET name = ?, root = ?, results = ?, updated_at = ? WHERE id = ?",
            (name, root_json, results_json, now_ms(), plan_id),
        )
        row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    return row_to_plan(row)


@app.delete("/api/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM plans WHERE id = ?", (plan_id,))


# ---------------- 生产模式:托管前端构建产物 ----------------

if os.path.isdir(DIST_DIR):

    @app.exception_handler(404)
    async def spa_fallback(request, exc):  # noqa: ARG001
        # API 的 404 仍返回 JSON,其余路径回退到 index.html 支持前端路由
        if request.url.path.startswith("/api/"):
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))

    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app", host="127.0.0.1", port=8000, reload=True, timeout_graceful_shutdown=5
    )

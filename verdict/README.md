# Verdict

Verdict 是一个可以独立运行的发布测试工作台。首次启动会创建含示例用例的本地工作区。

```sh
npm --prefix verdict start
```

在项目根目录运行后，浏览器访问 `http://127.0.0.1:8787`。需要 Node.js 20 或更新版本。数据默认存储在 `verdict/data/workspace.json`，可通过 `VERDICT_DATA` 指定数据文件，或通过 `VERDICT_PORT` 指定端口。预览服务绑定本机地址。

- 发布总览按 P0 风险排序，也可以直接进入待执行队列。
- 测试计划从用例库建立独立快照。记录结果后可自动进入下一条。批量操作针对当前选中的行，修改自动保存，并可撤销上一步。
- 用例库支持模块层级、优先级、步骤、预期结果、备注和图片。可导入 XMind 工作表和导出执行结果标记。

```sh
npm --prefix verdict test
```

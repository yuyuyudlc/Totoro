# Totoro Sunrun

基于 Next.js App Router 的阳光跑与早操打卡网页。

## 许可证

Copyright (c) 2026 yuyuyudlc

本项目的原创代码采用 [GNU Affero General Public License v3.0](LICENSE)（SPDX：`AGPL-3.0-only`）授权，仅限第 3 版。

你可以在遵守许可证的前提下使用、修改和分发本项目，包括商业用途。分发本项目或修改版时，应按许可证要求保留版权及许可声明，并提供对应源代码；若修改本项目并通过网络提供服务，必须向所有通过网络与该修改版交互的用户显著提供免费获取该版本对应源代码的途径。

本软件不提供任何担保，具体权利、义务和免责条款以 [LICENSE](LICENSE) 全文为准。第三方依赖及第三方代码、图片等素材仍遵循各自的许可证或权利声明，不因本项目的授权而变更。

## 技术栈

- Next.js App Router
- React
- Zustand
- Lucide React
- BullMQ + Redis（跑步延迟队列）
- pnpm

## 开发

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm lint
pnpm test
pnpm build
```

## 当前功能与平台限制

保留 Next.js 网页与服务端。浏览器只访问本站 `/api/*`，由服务端调用小程序业务接口。

- 输入小程序 Token 登录，支持 Bearer 前缀；GetStudentInfoByToken 校验并获取学生资料。
- getSunrunPaper 获取任务、路线、任务周期、里程与用时要求。
- 网页尚未实现等价的微信后台定位、运动分析、人脸与摄像头采集；学校要求这些校验时，开始跑步会在创建场次前停止。批量接口与旧提交入口已删除。
- 提供“开始跑步”入口，按所选任务与路线执行准备、创建场次、点位查询和成绩提交。

按 `.env.example` 设置 `SUNRUN_MINIPROGRAM_BASE_URL` 为学校实际小程序业务域名，默认 `https://wxxcx.xtotoro.com`，仅允许 HTTPS origin，不添加 `/wxxcx` 路径。原域名发生网络连接错误或超时时，会自动尝试 `SUNRUN_MINIPROGRAM_FALLBACK_BASE_URL`。

本项目不兑换或生成 Token。验证成功且资料包含 snCode、schoolCode、schoolCampusCode 后保存登录状态；旧扫码登录缓存会清除。

`npm test` 使用本地模拟响应检查登录、任务与跑步请求契约，不请求生产接口。`security-audit/` 为分析材料，不参与项目 lint。

## 早操打卡

登录后的任务页会调用 `/wxxcx/platform/mornSign/getMornSignPaper` 获取当前账号的早操任务，展示任务日期、签到时段、今日完成数、允许范围和点位列表。

选择点位并点击“提交签到”后，服务端会重新获取一次当前任务，使用该点位返回的经纬度和二维码，按小程序 `encryptLong` 协议加密请求，再调用 `/wxxcx/platform/mornSign/morningExercises`。每次点击只提交一次，不会因上游业务拒绝自动重试；提交后会刷新任务，以确认 `dayCompSignCount` 是否变化。

## 开始跑步

任务页会先生成路线、里程、用时、配速和步数预览，确认后再执行真实跑步接口。预览数据以随机 ID 在服务端临时保存十分钟，不包含 Token 或生成后的轨迹点；服务重启后需要重新生成预览。确认开始时使用预览选定的统计参数生成轨迹：目标里程比任务里程多 0.2%–1.2%，按约 1 秒一个定位点采样，叠加自相关的高斯定位误差和偶发多路径漂移，中间夹若干次停留（相邻点位移不足 1 米）和 2–4.5 秒的采样空档，时间戳累计到预览用时；步数按 138–188 步/分的步频换算。随后依次执行准备配置、`getRunBegin`、点位查询、`sunRunExercises` 和 `sunRunExercisesDetail`，成绩仍然立即提交。

开始前会校验任务日期、任务时段和路线归属：超出 `startDate`–`endDate`、不在 `runTimeRuleList` 时段内、或任务已配置路线却没选路线时，预览和确认阶段都会直接拒绝。所有时间字段（`evaluateDate`、`startTime`、`endTime`、轨迹点 `time`）统一按 `Asia/Shanghai` 输出，与服务器所在时区无关。

任务没有固定路线时，预览显示“无固定路线”，开始后使用内置路线 1 生成轨迹，同时继续向上游提交空 `lineId` 和空 `sunrunPathPointList`；任务已有路线时不允许走这个分支。若学校启用了开跑人脸、随机人脸或摄像头检查，流程会在创建场次前停止，不会伪造校验资料。

`SUNRUN_MINIPROGRAM_BASE_URL` 必须设置为无路径的 HTTPS origin；使用原接口时为 `https://wxxcx.xtotoro.com`。开始跑步会请求 `getRunBegin` 和两段成绩提交接口。

## 跑步延迟队列

“确认开始”固定把任务写入 Redis，并按预览的完整跑步用时延迟执行。到期后，独立 Worker 使用确认时刻作为跑步开始时间，依次调用准备配置、`getRunBegin`、点位查询、`sunRunExercises` 和 `sunRunExercisesDetail` 正式接口。账号和记录是否隔离由正式后端负责，本项目不维护账号白名单或模式开关。

配置 Redis 地址：

```dotenv
REDIS_URL=redis://127.0.0.1:6379
```

Worker 执行正式请求需要完整请求资料，因此 Token、任务、路线和跑步计划会作为任务载荷直接保存在 Redis 中。Redis 必须部署在受信网络，禁止暴露到公网，并应配置访问认证与最小权限。

网页与 Worker 必须使用完全相同的配置，并分别作为常驻进程启动：

```bash
pnpm dev
pnpm worker:run
```

整段正式接口流程不是幂等操作，因此每个 BullMQ 任务只执行一次，不对整个流程自动重试。成功结果保留一小时，失败结果保留一天；前端通过任务状态接口轮询并展示最终场次编号。

## Markdown 对话框

公共组件 `components/MarkdownDialog.jsx` 使用原生 `<dialog>` 提供焦点管理、Escape 与遮罩关闭。对话内容固定从项目根目录的 `dialog/index.md` 导入，由 `@next/mdx` 在开发或生产构建阶段编译，不会在浏览器运行时读取文件。

## 评论区

任务页底部通过 `@giscus/react` 接入仓库的 GitHub Discussions。评论按页面路径映射到 `General` 分类，首次发言需要使用 GitHub 账号授权 Giscus；仓库需要保持 Discussions 开启并安装 [Giscus GitHub App](https://github.com/apps/giscus)。嵌入区域会从站点同源的 `public/giscus-theme.css` 加载自定义主题，使编辑器、按钮和评论卡片保持项目的纸张底色、粗黑边框与方角风格。

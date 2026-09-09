# Changelog

## 0.1.14 (2026-09-09)

### 新增

- 仪表盘新增「近 24 小时」统计：滚动 24 小时窗口 KPI 对比、逐小时趋势曲线（后端按小时分桶）
- Agent Apps 改为显式同意制：未接管仅展示检测状态与说明，用户确认后才写入配置；新增一键「断开接管」；Claude 写入托管标记，手写配置不再被自动认领
- Agent Apps 配置管理更新：断开时结构化清理我们写入的键；OpenCode 默认模型改用顶层 model 键（修复按字母序读取导致的错乱）、清理残留模型条目、保留自定义 SDK 包；Claude 同步根 model；Codex thinking 读写对称；保存不再重排用户 JSON 键序
- WizardSteps 新增 fill 高度模式：向导可垂直撑满视口，底部按钮钉在卡片底部

### 修复

- 协议转换层 5 个问题：`stop` 参数解码遗漏；Chat 上游流式 usage 统计记 0（注入 `stream_options.include_usage`）；无签名 thinking 块显式 422（不再生成会被上游拒绝的 `signature:null`）；连续 tool 消息合并为单条 user turn（消除角色交替 400）；跨厂商 file ID 命名空间防呆
- 日志清理加最近 7 天硬保护，删除时打印文件名便于审计
- 热力图恢复全量历史数据（24h 改造引起的数据源回归）
- Codex 配置路径尊重 `CODEX_HOME` 环境变量
- 添加供应商向导宽度 860→1200 并垂直撑满视口
- 深色模式下 info 通知白底白字不可读
- 清理 4 个死依赖（three / @react-three/fiber / @react-three/postprocessing / ogl）与 8 个死文件；Dropdown 默认占位符 i18n 化；README 补 Agent Apps 说明

## 0.1.13 (2026-09-04)## 0.1.12 (2026-09-04)

### 新增

- Agent Apps 应用设置页：管理 Codex/Claude/OpenCode 的模型配置、推理参数与功能开关，写入各工具原生配置文件
- 模型品牌图标：按模型名自动解析供应商 Logo（ModelLogo），供应商卡、模型库存与详情页接入
- TooltipGroup 成组提示接入供应商卡与令牌操作按钮

### 界面

- 供应商卡重设计：模型叠堆展示，删除 Prism WebGL 背景改静态渐变
- 侧边栏激活态降噪为单层中性强调
- 设置页/供应商编辑页/仪表盘时间范围接入 interior Tabs 与 LoadingButton/IconMorph
- 模型库存页 FilterGrid 长方形卡片回退

### 修复

- agent_apps 测试补齐新参数，lib 测试恢复编译
- 收拢 save_* 函数参数为 SaveTarget 结构体，修 clippy too_many_arguments

## 0.1.11 (2026-07-31)

## 0.1.13 (2026-09-04)

### 界面

- 全应用 UI 对齐 interior 组件库风格：设置页与应用设置页换为文档站同款单卡 Tabs（白块穿出灰条与内容连体，切换带弹簧滑动）
- 代理控制卡重做：回归浅色卡片语言（白底+发丝线+轻阴影），移除深色玻璃拟态与流光描边装饰，启停/复制按钮与全站统一
- 侧边栏导航 hover/按压态改纯 CSS，激活态降噪；删除外壳噪点纹理与品牌色渐变装饰层
- 供应商/模型配置页收敛：统一 chip 形态、能力开关改 Switch、批量设置弹层换 Popover、测试连接按钮换 LoadingButton、模型详情品牌色降频
- 应用设置：模型多选下拉重构（定位/翻转/焦点管理）、行密度统一、折叠分组弹簧动效
- 修复深色模式下 info 通知白底白字不可读的问题
- 修复 59 处未定义 CSS token 引用（含启动按钮内边距实际为 0 的 bug）

## 0.1.11 (2026-07-31)

### 修复
- 修复设置页刷新令牌按钮只更新界面、未可靠持久化的问题
- 刷新令牌改为生成与后端一致的 UUID v4 格式
- 令牌刷新增加确认弹窗、保存中状态和保存失败提示

### 诊断
- 为 `GET /v1/models` 增加非敏感请求元数据日志，便于区分鉴权失败与网络请求未到达本地代理

## 0.1.10 (2026-07-31)

### 修复
- 侧边栏版本号改为读取应用运行时版本，不再固定显示旧版本
- `/health` 返回当前 Cargo 包版本，避免健康接口版本落后
- 来源映射详情不再把聚合路由与供应商来源并列展示

### 文档
- 新增 19 种路由策略的独立说明、索引和 README 入口

## 0.1.9 (2026-07-31)

### 新增
- 为每个对外暴露模型提供独立的路由策略设置
- 新增优先级、加权、轮询、P2C、成本优先、配额感知、上下文优化等 19 种路由策略
- 新增多模型融合与顺序流水线编排模式
- 路由目标支持权重、优先级、成本、配额和重置时间提示
- `least-used` 按 concrete target 的历史请求数选择，`p2c` 抽取不同目标并综合成功率与延迟评分
- 旧版逗号聚合会在模型详情页展开为可编辑的上游目标，轮询故障转移不再跳过下一个可用目标

### 修复
- 修复同名直接模型绕过模型级路由策略的问题
- 修复显式 `openai-chat` 目标被协议兼容检查错误过滤的问题
- 修复更新下载进度在多分片事件下停滞并在完成时直接跳到 100% 的问题
- 更新服务器未提供文件总大小时改为显示活动式下载进度

## 0.1.8 (2026-07-28)

### 修复
- 修复 Codex 通过 Responses API 使用 OpenAI Chat 兼容上游时，流式响应被过早截断的问题
- 修复 function call 的生命周期、参数分片、工具名称和输出顺序，支持 Codex 连续调用工具
- 修复 DeepSeek thinking mode 工具续轮缺少 `reasoning_content` 的问题
- 修复所有匹配 Provider 进入健康冷却后无法恢复路由的问题
- 修复 Windows 应用与任务栏图标缺少圆角和透明边距的问题

### 变更
- Responses 完成事件现在携带按 `output_index` 排序的完整输出项
- 代理重启时重置临时 Provider 健康状态，并增强上游连接错误诊断日志

## 0.1.6 (2026-07-25)

### 新增
- Windows/Linux 自定义窗口控制按钮（最小化、最大化/还原、关闭），位于右上角

## 0.1.5 (2026-07-25)

### 新增
- 完整中英文国际化覆盖：新增 ~180 个翻译 key，30+ 页面组件现已支持语言切换
- 英文 README（README_EN.md）

### 修复
- 修复页面顶端无法拖动窗口的问题（将 drag region 从 sticky 元素移至独立 absolute overlay）

## 0.1.4 (2026-07-25)

### 新增
- Responses 协议支持：新增 `/v1/responses` 端点，兼容 OpenAI Responses API
- Anthropic 协议支持：新增 `/v1/messages` 端点，支持 Anthropic Messages API
- 页面标题栏恢复，添加渐进模糊效果（GradualBlur），标题滚动时悬浮固定
- 全局禁用文本选中，仅保留输入框等可编辑区域的选中能力
- 启动代理按钮添加 StarBorder 光晕动效
- 关于页新增项目链接卡片（帮助文档、更新日志、官方网站、意见反馈）

### 变更
- 仪表盘时间范围 tab 调整到 KPI 卡片上方
- 模型分布环形图和近期调用记录现在按时间范围筛选
- 供应商卡片点击直接进入详情页，移除箭头按钮
- 模型配置页隐藏协议转换能力、模型聚合规则和添加聚合功能
- 模型卡片 hover 光晕效果范围调整
- Dashboard 空状态文案优化

### 修复
- 修复 Responses 协议流式响应中 `msg_melody` text part 缺失的问题
- 修复近期调用记录延迟列无数据显示的问题
- 修复设置页背景色与其他页面有色差的问题
- 修复检查更新按钮 loading 动画不旋转的问题
- 修复检查更新时动画阻塞的问题
- 修复模型颜色显示问题（GPT/DeepSeek/Qwen/Claude 更新为官方品牌色）

## 0.1.0 (2026-07-03)

Initial development release.

### 新增
- 多 LLM 提供商管理（OpenAI、Anthropic、DeepSeek 等）
- 智能路由聚合（轮询、最低延迟、随机、顺序）
- 本地代理服务器（`/v1/chat/completions`，支持 SSE 流式响应）
- 统一 Provider Adapter 架构（OpenAI / Anthropic / OpenAI-compatible）
- 仪表盘（Token 用量、请求数、活跃模型、平均响应时间）
- 多语言支持（简体中文 / English）
- 设置持久化（Tauri app data 目录）
- API Key 加密存储（AES-256-GCM，自动生成密钥）
- 代理认证（`Authorization: Bearer <token>`）
- 速率限制、请求超时、CORS 限制
- 健康检查 `/health`
- 统一错误响应格式
- 请求记录持久化（JSONL 滚动日志，每 50 条自动落盘）
- 日志导出功能（Export → Downloads 文件夹）
- 打开日志目录（系统文件管理器）

### 工程
- Rust 后端：Axum 代理服务器、文件持久化、14 个单元测试
- 前端：React 19 + Zustand + Recharts、TypeScript 严格模式
- CI：GitHub Actions（前端 typecheck+build，后端 cargo check+test+clippy+fmt）
- 可复用 UI 组件库（FormField、FormGrid、SectionTitle、Button 等）
- `.gitignore` 覆盖 Tauri/Rust 构建产物

### 变更
- Tauri identifier: `com.tauri-app.melody-hub` → `com.melody-hub.app`
- CSP: `null` → 最小 CSP 策略
- 构建命令: `pnpm` → `npm`（更广泛兼容）
- 后端设置路径: `current_dir()` → Tauri app data 目录
- 前端类型: 移除 `apiKeyDisplay` 字段，由前端派生
- 前后端数据契约: 统一 camelCase 映射

### 修复
- OpenAI base URL 双 `/v1` 拼接问题
- 设置保存失败时不再提示成功
- 路由策略只推进当前聚合的轮询索引
- 失败请求进入统计记录（含错误类别）
- 上游错误响应脱敏（截断超长消息）
- 仪表盘热力图使用真实数据替代随机生成

### 待实现
- 日志导出功能
- 打开日志目录
- 统一 provider adapter
- 请求记录持久化到本地数据库（v0.3.0 计划中）
- Windows 代码签名与打包说明（v0.2.0 计划中）

## 版本策略

Melody Hub 遵循语义化版本（SemVer 2.0.0）：

| 版本 | 说明 |
|---|---|
| **v0.1.x** | 初始开发版 — API 和数据结构可能不兼容变更 |
| **v0.2.x** | 日志导出、provider adapter、Windows 签名 |
| **v0.3.x** | 请求记录持久化、数据库支持 |
| **v1.0.0** | 首个稳定版 — 向前兼容保证 |

补丁版本（v0.1.1, v0.1.2, ...）仅修复 bug，不新增功能。
次要版本（v0.2.0, v0.3.0, ...）可包含破坏性变更，变更前会在 CHANGELOG 中标注 `BREAKING`。

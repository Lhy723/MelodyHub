# interior 适配层（MelodyHub）

- `_vendor/`：上游原文件基线（54 个，含 `"use client"` + Tailwind），仅对照，不被业务引用。上游来源见 `_vendor/SOURCE.txt`。
- 同级 `*.tsx + *.css`：已换肤可用组件。换肤规则：删 `"use client"`、删 Tailwind、改 CSS Vars + `lucide-react`、保留 `useX` 行为与 reduced-motion。

Batch 1 完成：`copy-button`、`modal`（`ConfirmDialog` 已换底座）、`loading-button`（新增）、`progress-bar`（新增）、`pagination`（已换肤暂不接入，待视觉确认）、`Dropdown` 增强移植（禁用项跳过/typeahead/window blur/空格选择，9 用例通过）。
Batch 2（4 协作子会话并行换肤，父会话已验 typecheck/lint，全量 50 通过）：`popover`（`usePopover` 定位+回焦）、`tooltip-group`、`accordion`（chevron 换 Lucide）、`command-palette`（仅换肤未接入 ⌘K，`open=undefined` 内联 / boolean 浮层，`onSelect` 需调用方自关）。
Batch 2 剩余（9 协作子会话并行换肤，父会话已验 typecheck/lint，全量 50 通过；删 2 处上游带来的不存在 eslint rule 的 disable 注释）：`drawer`（`useDrawer` 拖拽+焦点陷阱，关闭图标换 X）、`expanding-search`（debounce 搜索，内联 svg 换 Search/X）、`collapsible-banner`（三态，svg 换 Info/ChevronDown/X）、`sticky-header`、`scroll-spy`、`hide-on-scroll`、`reading-progress`（完成态换 Check）、`tabs`（另修复上游 ref 覆盖致键盘聚焦失效，API 与自制版不兼容待决策）、`segmented-control`（无 icon 支持待决策）。
页面接入（父会话直做）：`Pagination` 接 `RecentRequests`（1-indexed→0-indexed ±1 适配，删 ~80 行内联分页按钮）；`useCopyToClipboard` 接 `ProxyControl`（替换手写 copyEndpoint/copyToken，修 clipboard fallback 缺失与 setTimeout 泄漏）。
Batch 4（9 协作子会话并行换肤，父会话已验 typecheck/lint，全量 50 通过，无残留）：`hold-to-confirm`（确认态 svg 换 Check）、`press-depth`、`ripple`（`tintClassName` 默认改 `''` 走 `--bg-overlay-l4`）、`icon-morph`（保留内联 motion.path 变形动画载体）、`context-menu`（扁平 items 无子菜单，图标由调用方透传）、`long-press`、`text-reveal`、`otp-input`（备用）、`like-burst`（保留双层 motion.svg 心形动画载体，点赞色 `status-error-default`）。

页面接入（tabs 2 处）：供应商编辑页分组 + 仪表盘时间范围（近 7/30/90 天，手搓下划线 Tab 换 `Tabs variant="underline"`，`value/onValueChange` 直连 `statsStore.timeRange`，切 Tab 照旧重拉统计；浏览器实测选中态跟手）。

页面接入（reorder-list 1 处 + 新路由策略）：聚合新增 `manual` 手动排序策略——Rust `RoutingStrategy::Manual`（按配置数组顺序直试、首选第 1 位，跳过数字排序；`from_stored/as_key` 打通，单测锁定取首位语义）；前端策略下拉新增条目（`GripVertical` 图标、中英�文案）；模型详情页选 manual 时目标面板换拖拽列表（序号徽标+启用开关，键盘空格抓取/方向键移动/Esc 取消，保存后持久化顺序）。种子实测：键盘换序+序号重排正常。

页面接入（value-flash 1 处）：仪表盘 KPI 卡底行趋势值换 `ValueFlash`（大数字 `Counter` 按要求不动；`compare` 扩展透给 `useValueFlash`，响应卡传 `(n, p) => p - n` 让“降为好”闪绿；静默态文案与颜色与原来一致，只在统计刷新时闪）。

页面接入（filter-grid 1 处）：模型库存页富卡片墙换等高筛选网格（`items=entries` 全量定高；筛选 全部/视觉/思考/强度/工具/JSON，带计数，聚合来源无模型参数故能力筛选中不出现；`columns=3/rowHeight=132/maxRows=4/gap=16` 定高三行卡片，点格进详情；正方形 `square` 方案已按要求回退删除）。

页面接入（pagination 2 处）：近期调用记录（`store` 0-indexed ↔ 组件 1-indexed 做 ±1 适配）+ 供应商详情页近期请求（原来 `slice(0, 10)` 十条后看不到，现在 10 条/页本地分页，多页才出现分页条）。

页面接入（wizard-steps 5 步 + 删自制版）：添加供应商页 `ui/Stepper + 5×<Step>` 全换 interior `WizardSteps`（`steps=[{id,label,content}]`，内容 JSX 原样搬入；`index=currentStep-1` 受控 + `defaultIndex=retryStep-1/key` 保留失败重试 remount；`onComplete=handleFinish`）。为此给组件加了 4 个 MelodyHub 扩展：`canNext`（`canProceed && !saving` 置灰下一步/完成，校验仍是事前）、`height="auto"`（ResizeObserver 量面板 `scrollHeight` 自适应高，长表单不关滚动盒；jsdom 无 ResizeObserver 加守卫）、`bare`（去视口卡片铬，用页面自己的卡片）、`railNavigation={false}`（轨道只做进度展示不可点，前进只走按钮、校验绕不过）。自制版 `src/components/ui/Stepper.tsx` 及其单测删除（改用 `wizard-steps.test.tsx` 6 用例：前进/禁用/轨道关闭/受控方向/完成回调/bare）。另附带的新东西：页头多了当前步骤名 + 五段进度轨（原来指示器是关掉的）、读屏 `Step X of 5` 播报、返回键第一步自动隐藏（原来手写 `display:none`）。浏览器实测空名置灰→填名放行→第二步返回键出现→视口自然高度。新增 `providers.add.step1..5` 中英。

页面接入（segmented-control 7 处 + 删自制版）：设置页语言/主题/每页条数/最大并发/限速/代理协议/重试次数 7 组 `ui/SegmentedControl` 全换 interior 版。为此给组件加了两个 MelodyHub 扩展（与之前 Tabs 加 `badge` 同一手法）：`SegmentedOption.icon`（主题组 Sun/Moon/Monitor 原样保留，幽灵层+滑块层双渲染，读屏仍只读 label）、`size="sm"`（密集行 13px 收紧，对齐原来手量尺寸）。自制版 `src/components/ui/SegmentedControl.tsx` 删除（手量 `getBoundingClientRect` 滑块、无 radiogroup 语义、无键盘导航、无 disabled 项），连带清掉 `index.css` 里失效的 `ds-segmented-control__indicator`。换回来的是：radiogroup 读屏命名、左右键/Home/End 导航、motion 弹簧滑块、hover 预显。设置页实测主题图标正常、点每页条数滑块跟手且可切回。

页面接入（drawer 1 处）：仪表盘近期调用记录行点击 → 右侧 360px 抽屉看详情（表里放不下的请求 ID + `CopyButton` 一键复制、失败分类红色 Tag、故障转移链 `原供应商 → 现供应商 ×N`，失败/转移行按需出现；行可点 + Enter/Space 打开，Esc/点幕布/× 关闭；新增 `dashboard.requestDetail.*` 中英 7 条；种子实测失败行全链路正常，`CopyButton` 三脸叠渲染的隐藏英文 `Failed` 已用 `errorLabel` 中文压住）。

页面接入（modal 2 处）：设置页更新确认框从手写 overlay（~120 行：backdrop + panel + 自制头）换成 interior `Modal` 底座（`maxWidth` 默认 440 与原来同宽；标题/版本行走 `title/description`，品牌图标头去掉；更新日志 + `ProgressBar` 走 `children`；两按钮走 `footer`；安装中 `showClose/closeOnEscape/closeOnBackdrop` 全关；附带删掉文件里最后的 `motion` 引用）。数据管理“重置”行的 `window.confirm` 原生阻塞框换成 `ConfirmDialog(danger)`，全站 `window.confirm` 清零。

页面接入（presence-avatars 1 处）：供应商卡片“模型数量”行右侧换成模型头像叠堆（`max=5/size=22`，`sigil` 取前两段首字母 gpt-4o→G4/deepseek-chat→DC/`accent` 按 id 哈希取色，悬停 title 显示全名，`+N` 悬停列隐藏模型，读屏播报“共 N 个模型”；空模型时只显示 0）。组件本身换肤新增 `sigil/accent/describe` 三个模型场景扩展，默认仍是上游英文播报。浏览器种子实测 7 模型→5 贴片 + `+2` + 计数全链路正常。

页面接入（progress-bar 1 处）：设置页更新确认框里的手写下载进度条（~95 行：8px 轨道 + 确定/不确定双分支 + 底部大数字）换成 `ProgressBar`（`installProgress 0..1 → value×100`，`contentLength` 未知时传 `null` 走不确定爬行，100% 时 label 切“安装中...”，sr 公告复用同一文案；`index.css` 三个 keyframes 改由 `progress-bar.css` 消费，无死代码）。其余加载态全是布尔 spinner/skeleton，没有可测量的进度语义，硬上不确定条属于装饰性动效，不换。

页面接入（tag-input 1 处）：设置页安全分组 IP 白名单（`TagInput` 受控：字符串按逗号 split/trim↔数组，提交用 `', '` join 写回，后端 `split(',')+trim` 语义不变；分隔符逗号+空格，回车/粘贴批量添加，去重默认开，不加 IP 正则以免误杀 `192.168.1.*` 通配符；新增 `settings.security.ipHint` 中英；浏览器实测键入→回车→chip→×删除全链路正常）。聚合目标是带开关/权重的结构化编辑器、其余多值全是后端展示用 `split`，均不适用。

页面接入（floating-label 表单独占行 9 处）：编辑页基本信息 API Base/Key（Key 眼睛按钮改为悬浮覆盖 + `mh-with-trailing-icon` 避让，placeholder 指引并入 hint，失焦自动显隐逻辑保留）、独立代理地址、模型手动添加行（回车键改由外层 div 捕获冒泡）、添加页名称（`inputRef` 自动聚焦保留）/API Base/API Key（校验错误改走 `invalid` + hint 文案切换，`required` 红星保留）/代理地址/手动模型名。刻意保留：设置页全部（`SettingsRow` 左列已有标签，再加浮动标签会重复；数字框无对应 type）、表格单元格与模型卡片行内小输入（密集区浮动铬太重，number 无对应 type）、映射 key→value 行（添加页 Step 3 与编辑页映射分组同步换：行对齐改 `start` + 箭头/删除键按 40px 壳体居中，映射输入等宽字体用 `mh-mapping-row` 保留，浏览器实测截图对齐正常）。刻意保留：编辑页头名称（标题式无边框输入）、下拉搜索框与三处编辑器搜索/草稿提交框（行为特殊）、`ProviderForm.tsx`（全仓库无引用，遗留文件未动）。

页面接入（icon-morph 全量）：上游 4 预设之外新增 `chevron/eye/power/copy-check/plus-check`（同 slot 数字个数校验通过，收拢帧全 12），并导出 `MorphGlyph` 无头渲染（调用方保留按钮铬）。已接入 13 处：设置页令牌显隐/复制、供应商基本信息显隐、映射分组/模型行/添加页映射 chevron、添加页远端行 plus→✓、卡片与详情页电源、两处 Key 复制（改走 `useCopyToClipboard`，修掉无 fallback 与 setTimeout 泄漏）、详情页测试按钮（`testing` 改 `useAsyncAction`）、Dashboard 启停 play-pause（上一批）与两行复制、添加页测试 CTA（上一批）。刻意保留：AddProvider 1048 能力勾选旁静态 Eye（标签图标非切换）、详情页测试结果 CheckCircle/XCircle（填充式结果徽标，错误态要求瞬间可读不上变形动画）。
Batch 3（16 协作子会话分两波换肤，父会话已验 typecheck/lint，全量 50 通过；修 slider-detents ES2023 `toSorted/findLast`→ES2020 等价、`wizard-steps` 无用初始赋值）：`sortable-table`（排序箭头/check 换 Lucide）、`filter-grid`、`reorder-list`（grip 换 GripVertical）、`skeleton-swap`（复用全局 skeletonPulse）、`value-flash`（三角换 Triangle）、`new-items-pill`（箭头换 ArrowUp）、`load-more`（四态图标换 ChevronDown/LoaderCircle/TriangleAlert/Check）、`show-more`、`tag-input`（叉号换 X）、`tree-view`（caret 换 ChevronRight）、`slider-detents`、`task-steps`（Tick/Cross/Arc 换 Check/X/LoaderCircle）、`wizard-steps`（check 换 Check）、`floating-label`、`inline-validation`（换 Check/CircleAlert）、`password-strength`（有意保留内联 motion.svg 动画载体）。

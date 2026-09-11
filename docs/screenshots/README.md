# 界面截图

本目录集中存放 Melody Hub 的界面截图，避免图片散落在项目根目录。

## 目录约定

- `dashboard.png`、`models.png`、`settings.png`：README 当前使用的主截图。其中 `settings.png` 对应「系统设置」页（`/settings`），不是「应用设置」页（`/applications`）。
- 三张图由 `scripts/capture-readme-screenshots.mjs` 生成（Playwright + mock IPC，数据全部为虚构示例，不含真实密钥与令牌）。
- `archive/`：早期界面稿，仅用于版本对照，不在 README 中展示。
- `debug/`：复现界面问题时留下的截图，不作为产品展示素材。

更新主截图时请保持上述文件名不变，以免 README 链接失效。建议使用一致的窗口尺寸、系统缩放比例、语言和主题，并确认画面中不包含真实 API Key、认证令牌或其他敏感信息。

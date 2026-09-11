#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Melody Hub — Tauri 前后端包版本一致性校验
// ═══════════════════════════════════════════════════════════════
// Tauri 要求同一个插件/核心包在 npm 与 Rust crate 上的 major.minor
// 完全一致，否则运行时直接报 "version mismatched Tauri packages"。
// 两边锁定机制不同（frontend: pnpm-lock.yaml，Rust: Cargo.lock），
// 任一单独升级都会漂移——此脚本在 CI 里把漂移拦在合并之前。
//
// 用法：node scripts/check-tauri-versions.mjs
// 需要 node_modules 已安装（读取 npm 实际解析版本）与
// src-tauri/Cargo.lock（读取 Rust 实际锁定版本）。

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cargoLockPath = join(root, 'src-tauri', 'Cargo.lock');

/** npm 包 → Rust crate 对应关系（autostart 仅 Rust 侧，不参与校验）。 */
const PAIRS = [
  { npm: '@tauri-apps/api', crate: 'tauri' },
  { npm: '@tauri-apps/plugin-updater', crate: 'tauri-plugin-updater' },
  { npm: '@tauri-apps/plugin-opener', crate: 'tauri-plugin-opener' },
  { npm: '@tauri-apps/plugin-store', crate: 'tauri-plugin-store' },
  { npm: '@tauri-apps/plugin-window-state', crate: 'tauri-plugin-window-state' },
];

/** major.minor（忽略补丁号，与 Tauri 自身判定口径一致）。 */
const majorMinor = (version) => version.split('.').slice(0, 2).join('.');

function npmVersion(pkg) {
  const manifest = join(root, 'node_modules', pkg, 'package.json');
  if (!existsSync(manifest)) {
    fail(`缺少 ${pkg}：请先在仓库根目录运行 pnpm install`);
  }
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

function rustVersion(crate) {
  if (!existsSync(cargoLockPath)) {
    fail('缺少 src-tauri/Cargo.lock：该文件需纳入版本控制以保证依赖可复现');
  }
  const lock = readFileSync(cargoLockPath, 'utf8');
  const pattern = new RegExp(`name = "${crate}"\\nversion = "([^"]+)"`);
  const match = lock.match(pattern);
  if (!match) fail(`src-tauri/Cargo.lock 中找不到 crate "${crate}"`);
  return match[1];
}

const mismatches = [];
const rows = [];

for (const { npm, crate } of PAIRS) {
  const js = npmVersion(npm);
  const rust = rustVersion(crate);
  const aligned = majorMinor(js) === majorMinor(rust);
  rows.push({ npm, crate, js, rust, aligned });
  if (!aligned) mismatches.push({ npm, crate, js, rust });
}

const width = Math.max(...rows.map((r) => r.crate.length));
for (const r of rows) {
  const mark = r.aligned ? '✓' : '✗';
  console.log(
    `${mark} ${r.crate.padEnd(width)}  rust ${r.rust.padEnd(8)}  npm ${r.js.padEnd(8)}  (${r.npm})`,
  );
}

if (mismatches.length > 0) {
  console.error('\nTauri 前后端版本不一致（major.minor 必须相同）：');
  for (const m of mismatches) {
    console.error(`  - ${m.crate} ${m.rust} vs ${m.npm} ${m.js}`);
  }
  console.error(
    '\n修复：同步升级两侧并一起提交锁文件（package.json + pnpm-lock.yaml，src-tauri/Cargo.toml + Cargo.lock）。',
  );
  process.exit(1);
}

console.log(`\n全部 ${rows.length} 个包版本一致。`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

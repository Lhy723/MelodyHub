import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ListFilter, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import { Card, CardDesc, CardTitle, Dropdown, Input, Switch } from '../../components/ui';

type Translate = (key: string) => string;
type CodexValue = unknown;
type CodexSettingKind = 'boolean' | 'string' | 'number' | 'integer' | 'enum' | 'enumOrJson' | 'stringList' | 'json';
type CodexSettingGroup =
  | 'model'
  | 'permissions'
  | 'tools'
  | 'features'
  | 'agents'
  | 'integrations'
  | 'tui'
  | 'environment'
  | 'advanced';

interface CodexSettingSpec {
  key: string;
  kind: CodexSettingKind;
  group: CodexSettingGroup;
  options?: string[];
}

const ROOT_SPECS: CodexSettingSpec[] = [
  { key: 'model', kind: 'string', group: 'model' },
  { key: 'model_provider', kind: 'string', group: 'model' },
  { key: 'model_reasoning_effort', kind: 'string', group: 'model' },
  { key: 'model_reasoning_summary', kind: 'enum', group: 'model', options: ['none', 'auto', 'concise', 'detailed'] },
  { key: 'model_verbosity', kind: 'enum', group: 'model', options: ['low', 'medium', 'high'] },
  { key: 'model_auto_compact_token_limit', kind: 'integer', group: 'model' },
  { key: 'model_auto_compact_token_limit_scope', kind: 'enum', group: 'model', options: ['total', 'body_after_prefix'] },
  { key: 'model_context_window', kind: 'integer', group: 'model' },
  { key: 'model_catalog_json', kind: 'string', group: 'model' },
  { key: 'model_instructions_file', kind: 'string', group: 'model' },
  { key: 'review_model', kind: 'string', group: 'model' },
  { key: 'plan_mode_reasoning_effort', kind: 'string', group: 'model' },
  { key: 'personality', kind: 'enum', group: 'model', options: ['none', 'friendly', 'pragmatic'] },
  { key: 'oss_provider', kind: 'string', group: 'model' },

  { key: 'approval_policy', kind: 'enumOrJson', group: 'permissions', options: ['untrusted', 'on-request', 'never'] },
  { key: 'approvals_reviewer', kind: 'enum', group: 'permissions', options: ['user', 'auto_review', 'guardian_subagent'] },
  { key: 'default_permissions', kind: 'string', group: 'permissions' },
  { key: 'sandbox_mode', kind: 'enum', group: 'permissions', options: ['read-only', 'workspace-write', 'danger-full-access'] },
  { key: 'sandbox_workspace_write.exclude_slash_tmp', kind: 'boolean', group: 'permissions' },
  { key: 'sandbox_workspace_write.exclude_tmpdir_env_var', kind: 'boolean', group: 'permissions' },
  { key: 'sandbox_workspace_write.network_access', kind: 'boolean', group: 'permissions' },
  { key: 'sandbox_workspace_write.writable_roots', kind: 'stringList', group: 'permissions' },
  { key: 'allow_login_shell', kind: 'boolean', group: 'permissions' },
  { key: 'hide_agent_reasoning', kind: 'boolean', group: 'permissions' },
  { key: 'show_raw_agent_reasoning', kind: 'boolean', group: 'permissions' },

  { key: 'tools.view_image', kind: 'boolean', group: 'tools' },
  { key: 'tools.web_search', kind: 'json', group: 'tools' },
  { key: 'tool_output_token_limit', kind: 'integer', group: 'tools' },
  { key: 'tool_suggest', kind: 'json', group: 'tools' },

  { key: 'agents.default_subagent_model', kind: 'string', group: 'agents' },
  { key: 'agents.default_subagent_reasoning_effort', kind: 'string', group: 'agents' },
  { key: 'agents.enabled', kind: 'boolean', group: 'agents' },
  { key: 'agents.interrupt_message', kind: 'boolean', group: 'agents' },
  { key: 'agents.max_concurrent_threads_per_session', kind: 'integer', group: 'agents' },
  { key: 'agents.max_depth', kind: 'integer', group: 'agents' },
  { key: 'features.multi_agent_v2.enabled', kind: 'boolean', group: 'agents' },
  { key: 'features.multi_agent_v2.default_wait_timeout_ms', kind: 'integer', group: 'agents' },
  { key: 'features.multi_agent_v2.min_wait_timeout_ms', kind: 'integer', group: 'agents' },
  { key: 'features.multi_agent_v2.max_wait_timeout_ms', kind: 'integer', group: 'agents' },
  { key: 'features.multi_agent_v2.max_concurrent_threads_per_session', kind: 'integer', group: 'agents' },
  { key: 'features.multi_agent_v2.expose_spawn_agent_model_overrides', kind: 'boolean', group: 'agents' },
  { key: 'features.multi_agent_v2.hide_spawn_agent_metadata', kind: 'boolean', group: 'agents' },
  { key: 'features.multi_agent_v2.non_code_mode_only', kind: 'boolean', group: 'agents' },
  { key: 'features.multi_agent_v2.multi_agent_mode_hint_text', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.root_agent_usage_hint_text', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.subagent_developer_instructions', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.subagent_usage_hint_text', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.tool_namespace', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.usage_hint_enabled', kind: 'boolean', group: 'agents' },
  { key: 'features.multi_agent_v2.usage_hint_text', kind: 'string', group: 'agents' },
  { key: 'features.multi_agent_v2.wait_agent_enabled', kind: 'boolean', group: 'agents' },

  { key: 'analytics.enabled', kind: 'boolean', group: 'environment' },
  { key: 'feedback.enabled', kind: 'boolean', group: 'environment' },
  { key: 'check_for_update_on_startup', kind: 'boolean', group: 'environment' },
  { key: 'cli_auth_credentials_store', kind: 'enum', group: 'environment', options: ['file', 'keyring', 'auto', 'ephemeral'] },
  { key: 'chatgpt_base_url', kind: 'string', group: 'environment' },
  { key: 'openai_base_url', kind: 'string', group: 'environment' },
  { key: 'forced_login_method', kind: 'enum', group: 'environment', options: ['chatgpt', 'api'] },
  { key: 'mcp_oauth_callback_port', kind: 'integer', group: 'environment' },
  { key: 'mcp_oauth_callback_url', kind: 'string', group: 'environment' },
  { key: 'mcp_oauth_credentials_store', kind: 'enum', group: 'environment', options: ['auto', 'file', 'keyring'] },
  { key: 'apps_mcp_product_sku', kind: 'string', group: 'environment' },
  { key: 'forced_chatgpt_workspace_id', kind: 'json', group: 'environment' },
  { key: 'shell_environment_policy.experimental_use_profile', kind: 'boolean', group: 'environment' },
  { key: 'shell_environment_policy.ignore_default_excludes', kind: 'boolean', group: 'environment' },
  { key: 'shell_environment_policy.inherit', kind: 'enum', group: 'environment', options: ['all', 'core', 'none'] },
  { key: 'shell_environment_policy.exclude', kind: 'stringList', group: 'environment' },
  { key: 'shell_environment_policy.include_only', kind: 'stringList', group: 'environment' },
  { key: 'shell_environment_policy.filters', kind: 'json', group: 'environment' },
  { key: 'shell_environment_policy.set', kind: 'json', group: 'environment' },
  { key: 'instructions', kind: 'string', group: 'environment' },
  { key: 'developer_instructions', kind: 'string', group: 'environment' },
  { key: 'include_apps_instructions', kind: 'boolean', group: 'environment' },
  { key: 'include_collaboration_mode_instructions', kind: 'boolean', group: 'environment' },
  { key: 'include_environment_context', kind: 'boolean', group: 'environment' },
  { key: 'include_permissions_instructions', kind: 'boolean', group: 'environment' },
  { key: 'compact_prompt', kind: 'string', group: 'environment' },
  { key: 'log_dir', kind: 'string', group: 'environment' },
  { key: 'sqlite_home', kind: 'string', group: 'environment' },
  { key: 'notify', kind: 'stringList', group: 'environment' },
  { key: 'profile', kind: 'string', group: 'environment' },

  { key: 'history.max_bytes', kind: 'integer', group: 'advanced' },
  { key: 'history.persistence', kind: 'enum', group: 'advanced', options: ['save-all', 'none'] },
  { key: 'file_opener', kind: 'enum', group: 'advanced', options: ['vscode', 'vscode-insiders', 'windsurf', 'cursor', 'none'] },
  { key: 'web_search', kind: 'enum', group: 'advanced', options: ['disabled', 'cached', 'indexed', 'live'] },
  { key: 'project_doc_fallback_filenames', kind: 'stringList', group: 'advanced' },
  { key: 'project_doc_max_bytes', kind: 'integer', group: 'advanced' },
  { key: 'project_root_markers', kind: 'stringList', group: 'advanced' },
  { key: 'service_tier', kind: 'string', group: 'advanced' },
  { key: 'background_terminal_max_timeout', kind: 'integer', group: 'advanced' },
  { key: 'disable_paste_burst', kind: 'boolean', group: 'advanced' },
  { key: 'experimental_compact_prompt_file', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_start_instructions', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_webrtc_call_base_url', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_ws_backend_prompt', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_ws_base_url', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_ws_model', kind: 'string', group: 'advanced' },
  { key: 'experimental_realtime_ws_startup_context', kind: 'string', group: 'advanced' },
  { key: 'experimental_thread_config_endpoint', kind: 'string', group: 'advanced' },
  { key: 'experimental_use_unified_exec_tool', kind: 'boolean', group: 'advanced' },
  { key: 'suppress_unstable_features_warning', kind: 'boolean', group: 'advanced' },
  { key: 'realtime', kind: 'json', group: 'advanced' },
  { key: 'debug', kind: 'json', group: 'advanced' },
  { key: 'desktop', kind: 'json', group: 'advanced' },
  { key: 'ghost_snapshot', kind: 'json', group: 'advanced' },
  { key: 'notice', kind: 'json', group: 'advanced' },
  { key: 'orchestrator', kind: 'json', group: 'advanced' },
  { key: 'audio', kind: 'json', group: 'advanced' },
  { key: 'auto_review', kind: 'json', group: 'advanced' },
  { key: 'otel', kind: 'json', group: 'advanced' },
  { key: 'experimental_thread_store', kind: 'json', group: 'advanced' },
  { key: 'windows.sandbox', kind: 'enum', group: 'advanced', options: ['elevated', 'unelevated'] },
  { key: 'windows.sandbox_private_desktop', kind: 'boolean', group: 'advanced' },
];

const FEATURE_BOOLEAN_KEYS = [
  'apply_patch_freeform',
  'apply_patch_streaming_events',
  'apps',
  'auth_elicitation',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'chronicle',
  'code_mode_buffered_exec',
  'code_mode_only',
  'codex_git_commit',
  'codex_hooks',
  'collab',
  'collaboration_modes',
  'computer_use',
  'concurrent_reasoning_summaries',
  'connectors',
  'default_mode_request_user_input',
  'deferred_executor',
  'deferred_tool_world_state',
  'elevated_windows_sandbox',
  'enable_experimental_windows_sandbox',
  'enable_fanout',
  'enable_mcp_apps',
  'enable_request_compression',
  'exec_permission_approvals',
  'executed_tool_call_metadata',
  'executor_capability_discovery',
  'experimental_use_unified_exec_tool',
  'experimental_windows_sandbox',
  'external_agent_memory_import',
  'external_migration',
  'fast_mode',
  'goals',
  'guardian_approval',
  'guardianv2',
  'hooks',
  'image_detail_original',
  'image_generation',
  'imagegenext',
  'in_app_browser',
  'in_app_updates',
  'item_ids',
  'js_repl',
  'js_repl_tools_only',
  'local_thread_store_compression',
  'mcp_2026_07_28',
  'memories',
  'memory_tool',
  'mentions_v2',
  'multi_agent',
  'multi_agent_mode',
  'personality',
  'plugin_hooks',
  'plugin_sharing',
  'plugins',
  'prevent_idle_sleep',
  'realtime_conversation',
  'recommended_plugins',
  'remote_compaction_v2',
  'remote_control',
  'remote_models',
  'remote_plugin',
  'request_permissions',
  'request_permissions_tool',
  'request_rule',
  'resize_all_images',
  'respect_system_proxy',
  'responses_websockets',
  'responses_websockets_v2',
  'runtime_metrics',
  'search_tool',
  'secret_auth_storage',
  'shell_snapshot',
  'shell_tool',
  'shell_zsh_fork',
  'skill_env_var_dependency_prompt',
  'skill_mcp_dependency_install',
  'skill_search',
  'sqlite',
  'standalone_web_search',
  'steer',
  'telepathy',
  'terminal_resize_reflow',
  'terminal_visualization_instructions',
  'tool_call_mcp_elicitation',
  'tool_search',
  'tool_search_always_defer_mcp_tools',
  'tool_suggest',
  'tui_app_server',
  'unavailable_dummy_tools',
  'undo',
  'unified_exec',
  'unified_exec_zsh_fork',
  'use_agent_identity',
  'use_legacy_landlock',
  'use_linux_sandbox_bwrap',
  'web_search',
  'web_search_cached',
  'web_search_request',
  'workspace_dependencies',
  'workspace_owner_usage_nudge',
];

const FEATURE_SPECS: CodexSettingSpec[] = FEATURE_BOOLEAN_KEYS.map((key) => ({
  key: `features.${key}`,
  kind: 'boolean',
  group: 'features',
}));

const FEATURE_EXTRA_SPECS: CodexSettingSpec[] = [
  { key: 'features.apps_mcp_path_override', kind: 'json', group: 'features' },
  { key: 'features.code_mode.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.code_mode.direct_only_tool_namespaces', kind: 'stringList', group: 'features' },
  { key: 'features.code_mode.excluded_tool_namespaces', kind: 'stringList', group: 'features' },
  { key: 'features.code_mode_host.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.code_mode_host.disable_in_process_fallback', kind: 'boolean', group: 'features' },
  { key: 'features.current_time_reminder.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.current_time_reminder.clock_source', kind: 'enum', group: 'features', options: ['system', 'external'] },
  { key: 'features.current_time_reminder.delivery_mode', kind: 'enum', group: 'features', options: ['any_inference', 'after_user_or_tool_output'] },
  { key: 'features.current_time_reminder.reminder_interval_seconds', kind: 'integer', group: 'features' },
  { key: 'features.current_time_reminder.sleep_tool', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.allow_local_binding', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.allow_upstream_proxy', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.dangerously_allow_all_unix_sockets', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.dangerously_allow_non_loopback_proxy', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.domains', kind: 'json', group: 'features' },
  { key: 'features.network_proxy.enable_socks5', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.enable_socks5_udp', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.network_proxy.mode', kind: 'enum', group: 'features', options: ['limited', 'full'] },
  { key: 'features.network_proxy.proxy_url', kind: 'string', group: 'features' },
  { key: 'features.network_proxy.socks_url', kind: 'string', group: 'features' },
  { key: 'features.network_proxy.unix_sockets', kind: 'json', group: 'features' },
  { key: 'features.non_prefixed_mcp_tool_names.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.non_prefixed_mcp_tool_names.server_names', kind: 'stringList', group: 'features' },
  { key: 'features.rollout_budget.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.rollout_budget.limit_tokens', kind: 'integer', group: 'features' },
  { key: 'features.rollout_budget.prefill_token_weight', kind: 'number', group: 'features' },
  { key: 'features.rollout_budget.reminder_at_remaining_tokens', kind: 'json', group: 'features' },
  { key: 'features.rollout_budget.sampling_token_weight', kind: 'number', group: 'features' },
  { key: 'features.token_budget.enabled', kind: 'boolean', group: 'features' },
  { key: 'features.token_budget.auto_compact_fallback_buffer_tokens', kind: 'integer', group: 'features' },
  { key: 'features.token_budget.auto_compact_fallback_prompt', kind: 'string', group: 'features' },
  { key: 'features.token_budget.guidance_message', kind: 'string', group: 'features' },
  { key: 'features.token_budget.reminder_message_template', kind: 'string', group: 'features' },
  { key: 'features.token_budget.reminder_threshold_tokens', kind: 'integer', group: 'features' },
];

const COMPLEX_ROOT_SPECS: CodexSettingSpec[] = [
  { key: 'apps', kind: 'json', group: 'integrations' },
  { key: 'mcp_servers', kind: 'json', group: 'integrations' },
  { key: 'model_providers', kind: 'json', group: 'integrations' },
  { key: 'marketplaces', kind: 'json', group: 'integrations' },
  { key: 'plugins', kind: 'json', group: 'integrations' },
  { key: 'profiles', kind: 'json', group: 'integrations' },
  { key: 'projects', kind: 'json', group: 'integrations' },
  { key: 'permissions', kind: 'json', group: 'permissions' },
  { key: 'hooks', kind: 'json', group: 'integrations' },
  { key: 'skills', kind: 'json', group: 'integrations' },
  { key: 'memories', kind: 'json', group: 'integrations' },
  { key: 'memories.consolidation_model', kind: 'string', group: 'integrations' },
  { key: 'memories.dedicated_tools', kind: 'boolean', group: 'integrations' },
  { key: 'memories.disable_on_external_context', kind: 'boolean', group: 'integrations' },
  { key: 'memories.extract_model', kind: 'string', group: 'integrations' },
  { key: 'memories.generate_memories', kind: 'boolean', group: 'integrations' },
  { key: 'memories.max_raw_memories_for_consolidation', kind: 'integer', group: 'integrations' },
  { key: 'memories.max_rollout_age_days', kind: 'integer', group: 'integrations' },
  { key: 'memories.max_rollouts_per_startup', kind: 'integer', group: 'integrations' },
  { key: 'memories.max_unused_days', kind: 'integer', group: 'integrations' },
  { key: 'memories.min_rate_limit_remaining_percent', kind: 'integer', group: 'integrations' },
  { key: 'memories.min_rollout_idle_hours', kind: 'integer', group: 'integrations' },
  { key: 'memories.use_memories', kind: 'boolean', group: 'integrations' },
  { key: 'skills.bundled.enabled', kind: 'boolean', group: 'integrations' },
  { key: 'skills.include_instructions', kind: 'boolean', group: 'integrations' },
  { key: 'skills.config', kind: 'json', group: 'integrations' },
  { key: 'tui.keymap', kind: 'json', group: 'tui' },
  { key: 'tui.model_availability_nux', kind: 'json', group: 'tui' },
  { key: 'tui.notifications', kind: 'json', group: 'tui' },
  { key: 'tui.pet', kind: 'string', group: 'tui' },
  { key: 'tui.pet_anchor', kind: 'enum', group: 'tui', options: ['composer', 'screen-bottom'] },
  { key: 'tui.session_picker_view', kind: 'enum', group: 'tui', options: ['comfortable', 'dense'] },
  { key: 'tui.status_line', kind: 'stringList', group: 'tui' },
  { key: 'tui.status_line_use_colors', kind: 'boolean', group: 'tui' },
  { key: 'tui.terminal_resize_reflow_max_rows', kind: 'integer', group: 'tui' },
  { key: 'tui.terminal_title', kind: 'stringList', group: 'tui' },
  { key: 'tui.alternate_screen', kind: 'enum', group: 'tui', options: ['auto', 'always', 'never'] },
  { key: 'tui.animations', kind: 'boolean', group: 'tui' },
  { key: 'tui.notification_condition', kind: 'enum', group: 'tui', options: ['unfocused', 'always'] },
  { key: 'tui.notification_method', kind: 'enum', group: 'tui', options: ['auto', 'osc9', 'bel'] },
  { key: 'tui.raw_output_mode', kind: 'boolean', group: 'tui' },
  { key: 'tui.resume_cwd', kind: 'enum', group: 'tui', options: ['current', 'session'] },
  { key: 'tui.show_tooltips', kind: 'boolean', group: 'tui' },
  { key: 'tui.theme', kind: 'string', group: 'tui' },
  { key: 'tui.vim_mode_default', kind: 'boolean', group: 'tui' },
  { key: 'tools.experimental_request_user_input', kind: 'json', group: 'tools' },
  { key: 'tools.update_plan', kind: 'json', group: 'tools' },
];

const GROUPS: CodexSettingGroup[] = [
  'model',
  'permissions',
  'tools',
  'features',
  'agents',
  'integrations',
  'tui',
  'environment',
  'advanced',
];

// Codex 配置项的中文标签与解释。未命中的 key 会回退到 humanizeKey。
const CODEX_LABELS: Record<string, { label: string; hint?: string }> = {
  // model
  model: { label: '默认模型', hint: 'Codex 调用时使用的主模型名称。' },
  model_provider: { label: '模型提供方', hint: '对应 model_providers 中的自定义 provider 名称。' },
  model_reasoning_effort: { label: '思考强度', hint: '控制模型在复杂任务上投入的推理预算。' },
  model_reasoning_summary: { label: '推理摘要', hint: '是否以及如何输出推理过程摘要。' },
  model_verbosity: { label: '回复详细度', hint: '控制模型回复的详尽程度。' },
  model_auto_compact_token_limit: { label: '自动压缩阈值', hint: '上下文超过该 token 数时触发自动压缩。' },
  model_auto_compact_token_limit_scope: { label: '压缩阈值范围', hint: '阈值按总 token 或前缀后正文计算。' },
  model_context_window: { label: '上下文窗口', hint: '覆盖模型默认的上下文窗口大小。' },
  model_catalog_json: { label: '模型目录', hint: '自定义可用模型列表 (JSON)。' },
  model_instructions_file: { label: '模型指令文件', hint: '附加到系统提示的指令文件路径。' },
  review_model: { label: '审查模型', hint: '用于代码审查的模型名称。' },
  plan_mode_reasoning_effort: { label: '计划模式思考强度', hint: '计划模式下的推理预算。' },
  personality: { label: '人格风格', hint: '模型对话风格：无 / 友好 / 务实。' },
  oss_provider: { label: 'OSS 提供方', hint: '开源部署使用的本地 provider。' },

  // permissions
  approval_policy: { label: '审批策略', hint: 'untrusted / on-request / never。' },
  approvals_reviewer: { label: '审批者', hint: '谁来审查执行请求。' },
  default_permissions: { label: '默认权限', hint: '默认放行的工具权限规则。' },
  sandbox_mode: { label: '沙箱模式', hint: 'read-only / workspace-write / danger-full-access。' },
  'sandbox_workspace_write.exclude_slash_tmp': { label: '排除 /tmp', hint: '工作区写入沙箱中排除 /tmp 路径。' },
  'sandbox_workspace_write.exclude_tmpdir_env_var': { label: '排除 TMPDIR', hint: '排除环境变量 TMPDIR 指向的目录。' },
  'sandbox_workspace_write.network_access': { label: '沙箱允许联网', hint: '工作区写入沙箱是否允许网络访问。' },
  'sandbox_workspace_write.writable_roots': { label: '可写根目录', hint: '额外允许写入的目录列表。' },
  allow_login_shell: { label: '允许登录 Shell', hint: '使用登录 shell 执行命令。' },
  hide_agent_reasoning: { label: '隐藏推理', hint: '在 UI 中隐藏 Agent 推理过程。' },
  show_raw_agent_reasoning: { label: '显示原始推理', hint: '显示未加工的推理 token。' },

  // tools
  'tools.view_image': { label: '查看图片', hint: '允许 Codex 查看图片内容。' },
  'tools.web_search': { label: '网页搜索', hint: '网页搜索工具配置 (JSON)。' },
  tool_output_token_limit: { label: '工具输出上限', hint: '单次工具输出 token 上限。' },
  tool_suggest: { label: '工具建议', hint: '工具建议规则 (JSON)。' },

  // agents
  'agents.default_subagent_model': { label: '子 Agent 默认模型', hint: '子 Agent 使用的默认模型。' },
  'agents.default_subagent_reasoning_effort': { label: '子 Agent 思考强度', hint: '子 Agent 的推理预算。' },
  'agents.enabled': { label: '启用多 Agent', hint: '允许 Codex 协调多个 Agent。' },
  'agents.interrupt_message': { label: '允许打断消息', hint: '运行中是否允许发送打断消息。' },
  'agents.max_concurrent_threads_per_session': { label: '单会话最大并发线程', hint: '每个会话允许的子 Agent 并发上限。' },
  'agents.max_depth': { label: '最大嵌套深度', hint: '子 Agent 嵌套调用的最大层数。' },
  'features.multi_agent_v2.enabled': { label: '启用多 Agent v2', hint: '使用 v2 版本的多 Agent 编排。' },
  'features.multi_agent_v2.default_wait_timeout_ms': { label: '默认等待超时(ms)', hint: '等待子 Agent 完成的默认超时。' },
  'features.multi_agent_v2.min_wait_timeout_ms': { label: '最小等待超时(ms)' },
  'features.multi_agent_v2.max_wait_timeout_ms': { label: '最大等待超时(ms)' },
  'features.multi_agent_v2.max_concurrent_threads_per_session': { label: 'v2 单会话最大并发' },
  'features.multi_agent_v2.expose_spawn_agent_model_overrides': { label: '暴露子 Agent 模型覆盖' },
  'features.multi_agent_v2.hide_spawn_agent_metadata': { label: '隐藏子 Agent 元数据' },
  'features.multi_agent_v2.non_code_mode_only': { label: '仅非代码模式' },
  'features.multi_agent_v2.multi_agent_mode_hint_text': { label: '多 Agent 模式提示文案' },
  'features.multi_agent_v2.root_agent_usage_hint_text': { label: '根 Agent 使用提示文案' },
  'features.multi_agent_v2.subagent_developer_instructions': { label: '子 Agent 开发指令' },
  'features.multi_agent_v2.subagent_usage_hint_text': { label: '子 Agent 使用提示文案' },
  'features.multi_agent_v2.tool_namespace': { label: '工具命名空间' },
  'features.multi_agent_v2.usage_hint_enabled': { label: '启用使用提示' },
  'features.multi_agent_v2.usage_hint_text': { label: '使用提示文案' },
  'features.multi_agent_v2.wait_agent_enabled': { label: '启用等待 Agent' },

  // environment
  'analytics.enabled': { label: '启用分析', hint: '上报匿名使用分析数据。' },
  'feedback.enabled': { label: '启用反馈', hint: '允许用户提交反馈。' },
  check_for_update_on_startup: { label: '启动时检查更新', hint: '启动时检查新版本。' },
  cli_auth_credentials_store: { label: '认证凭据存储', hint: 'file / keyring / auto / ephemeral。' },
  chatgpt_base_url: { label: 'ChatGPT Base URL', hint: '覆盖 ChatGPT 登录后端地址。' },
  openai_base_url: { label: 'OpenAI Base URL', hint: '覆盖 OpenAI API 地址。' },
  forced_login_method: { label: '强制登录方式', hint: 'chatgpt / api。' },
  mcp_oauth_callback_port: { label: 'MCP OAuth 回调端口' },
  mcp_oauth_callback_url: { label: 'MCP OAuth 回调 URL' },
  mcp_oauth_credentials_store: { label: 'MCP OAuth 凭据存储' },
  apps_mcp_product_sku: { label: 'Apps MCP 产品 SKU' },
  forced_chatgpt_workspace_id: { label: '强制 ChatGPT 工作区 ID' },
  'shell_environment_policy.experimental_use_profile': { label: '实验性使用 profile', hint: 'Shell 环境策略实验项。' },
  'shell_environment_policy.ignore_default_excludes': { label: '忽略默认排除项' },
  'shell_environment_policy.inherit': { label: '环境变量继承', hint: 'all / core / none。' },
  'shell_environment_policy.exclude': { label: '环境变量排除列表' },
  'shell_environment_policy.include_only': { label: '仅包含的环境变量' },
  'shell_environment_policy.filters': { label: '环境变量过滤器 (JSON)' },
  'shell_environment_policy.set': { label: '环境变量覆盖 (JSON)' },
  instructions: { label: '用户指令', hint: '附加到系统提示的用户指令。' },
  developer_instructions: { label: '开发者指令' },
  include_apps_instructions: { label: '包含应用指令' },
  include_collaboration_mode_instructions: { label: '包含协作模式指令' },
  include_environment_context: { label: '包含环境上下文' },
  include_permissions_instructions: { label: '包含权限指令' },
  compact_prompt: { label: '压缩提示词' },
  log_dir: { label: '日志目录' },
  sqlite_home: { label: 'SQLite 主目录' },
  notify: { label: '通知方式' },
  profile: { label: 'Profile 名称' },

  // advanced
  'history.max_bytes': { label: '历史最大字节' },
  'history.persistence': { label: '历史持久化', hint: 'save-all / none。' },
  file_opener: { label: '文件打开器', hint: 'vscode / cursor / windsurf 等。' },
  web_search: { label: '网页搜索模式', hint: 'disabled / cached / indexed / live。' },
  project_doc_fallback_filenames: { label: '项目文档回退文件名' },
  project_doc_max_bytes: { label: '项目文档最大字节' },
  project_root_markers: { label: '项目根标记' },
  service_tier: { label: '服务层级' },
  background_terminal_max_timeout: { label: '后台终端最大超时' },
  disable_paste_burst: { label: '禁用粘贴突发' },
  experimental_compact_prompt_file: { label: '实验性压缩提示文件' },
  experimental_realtime_start_instructions: { label: '实时启动指令' },
  experimental_realtime_webrtc_call_base_url: { label: '实时 WebRTC 呼叫 URL' },
  experimental_realtime_ws_backend_prompt: { label: '实时 WebSocket 后端提示' },
  experimental_realtime_ws_base_url: { label: '实时 WebSocket URL' },
  experimental_realtime_ws_model: { label: '实时 WebSocket 模型' },
  experimental_realtime_ws_startup_context: { label: '实时 WebSocket 启动上下文' },
  experimental_thread_config_endpoint: { label: '实验性线程配置端点' },
  experimental_use_unified_exec_tool: { label: '实验性统一执行工具' },
  suppress_unstable_features_warning: { label: '抑制不稳定特性警告' },
  realtime: { label: '实时配置 (JSON)' },
  debug: { label: '调试配置 (JSON)' },
  desktop: { label: '桌面配置 (JSON)' },
  ghost_snapshot: { label: '幽灵快照 (JSON)' },
  notice: { label: '通知配置 (JSON)' },
  orchestrator: { label: '编排器 (JSON)' },
  audio: { label: '音频 (JSON)' },
  auto_review: { label: '自动审查 (JSON)' },
  otel: { label: 'OpenTelemetry (JSON)' },
  experimental_thread_store: { label: '实验性线程存储 (JSON)' },
  'windows.sandbox': { label: 'Windows 沙箱', hint: 'elevated / unelevated。' },
  'windows.sandbox_private_desktop': { label: 'Windows 私有桌面' },

  // integrations
  apps: { label: 'Apps (JSON)' },
  mcp_servers: { label: 'MCP 服务器 (JSON)', hint: 'MCP 服务器配置。' },
  model_providers: { label: '模型 Provider (JSON)', hint: '自定义模型 provider 列表。' },
  marketplaces: { label: '插件市场 (JSON)' },
  plugins: { label: '插件 (JSON)' },
  profiles: { label: 'Profile (JSON)' },
  projects: { label: '项目 (JSON)' },
  permissions: { label: '权限规则 (JSON)' },
  hooks: { label: 'Hooks (JSON)' },
  skills: { label: 'Skills (JSON)' },
  memories: { label: '记忆 (JSON)' },
  'memories.consolidation_model': { label: '记忆合并模型' },
  'memories.dedicated_tools': { label: '记忆专用工具' },
  'memories.disable_on_external_context': { label: '外部上下文禁用记忆' },
  'memories.extract_model': { label: '记忆抽取模型' },
  'memories.generate_memories': { label: '生成记忆' },
  'memories.max_raw_memories_for_consolidation': { label: '合并最大原始记忆数' },
  'memories.max_rollout_age_days': { label: '记忆最大保留天数' },
  'memories.max_rollouts_per_startup': { label: '每次启动最大回放数' },
  'memories.max_unused_days': { label: '未使用记忆最大天数' },
  'memories.min_rate_limit_remaining_percent': { label: '最小速率限制剩余%' },
  'memories.min_rollout_idle_hours': { label: '最小回放空闲小时' },
  'memories.use_memories': { label: '启用记忆' },
  'skills.bundled.enabled': { label: '启用内置 Skills' },
  'skills.include_instructions': { label: 'Skills 包含指令' },
  'skills.config': { label: 'Skills 配置 (JSON)' },

  // tui
  'tui.keymap': { label: '快捷键 (JSON)' },
  'tui.model_availability_nux': { label: '模型可用性引导 (JSON)' },
  'tui.notifications': { label: '通知 (JSON)' },
  'tui.pet': { label: 'TUI 宠物' },
  'tui.pet_anchor': { label: '宠物锚点', hint: 'composer / screen-bottom。' },
  'tui.session_picker_view': { label: '会话选择器视图', hint: 'comfortable / dense。' },
  'tui.status_line': { label: '状态栏内容' },
  'tui.status_line_use_colors': { label: '状态栏使用颜色' },
  'tui.terminal_resize_reflow_max_rows': { label: '终端重排最大行数' },
  'tui.terminal_title': { label: '终端标题' },
  'tui.alternate_screen': { label: '备用屏幕', hint: 'auto / always / never。' },
  'tui.animations': { label: '启用动画' },
  'tui.notification_condition': { label: '通知触发条件', hint: 'unfocused / always。' },
  'tui.notification_method': { label: '通知方式', hint: 'auto / osc9 / bel。' },
  'tui.raw_output_mode': { label: '原始输出模式' },
  'tui.resume_cwd': { label: '恢复当前目录', hint: 'current / session。' },
  'tui.show_tooltips': { label: '显示提示' },
  'tui.theme': { label: 'TUI 主题' },
  'tui.vim_mode_default': { label: '默认 Vim 模式' },

  // tools extra
  'tools.experimental_request_user_input': { label: '实验性用户输入请求 (JSON)' },
  'tools.update_plan': { label: '更新计划 (JSON)' },

  // features extra (多层级 key)
  'features.apps_mcp_path_override': { label: 'Apps MCP 路径覆盖 (JSON)' },
  'features.code_mode.enabled': { label: '启用代码模式' },
  'features.code_mode.direct_only_tool_namespaces': { label: '代码模式仅直连工具命名空间' },
  'features.code_mode.excluded_tool_namespaces': { label: '代码模式排除工具命名空间' },
  'features.code_mode_host.enabled': { label: '启用代码模式宿主' },
  'features.code_mode_host.disable_in_process_fallback': { label: '禁用进程内回退' },
  'features.current_time_reminder.enabled': { label: '启用当前时间提醒' },
  'features.current_time_reminder.clock_source': { label: '时钟源', hint: 'system / external' },
  'features.current_time_reminder.delivery_mode': { label: '提醒交付模式', hint: 'any_inference / after_user_or_tool_output' },
  'features.current_time_reminder.reminder_interval_seconds': { label: '提醒间隔(秒)' },
  'features.current_time_reminder.sleep_tool': { label: '睡眠工具' },
  'features.network_proxy.allow_local_binding': { label: '允许本地绑定' },
  'features.network_proxy.allow_upstream_proxy': { label: '允许上游代理' },
  'features.network_proxy.dangerously_allow_all_unix_sockets': { label: '危险：允许所有 Unix Socket' },
  'features.network_proxy.dangerously_allow_non_loopback_proxy': { label: '危险：允许非环回代理' },
  'features.network_proxy.domains': { label: '代理域名规则 (JSON)' },
  'features.network_proxy.enable_socks5': { label: '启用 SOCKS5' },
  'features.network_proxy.enable_socks5_udp': { label: '启用 SOCKS5 UDP' },
  'features.network_proxy.enabled': { label: '启用网络代理' },
  'features.network_proxy.mode': { label: '代理模式', hint: 'limited / full' },
  'features.network_proxy.proxy_url': { label: 'HTTP 代理 URL' },
  'features.network_proxy.socks_url': { label: 'SOCKS 代理 URL' },
  'features.network_proxy.unix_sockets': { label: 'Unix Socket 列表 (JSON)' },
  'features.non_prefixed_mcp_tool_names.enabled': { label: '启用无前缀 MCP 工具名' },
  'features.non_prefixed_mcp_tool_names.server_names': { label: '无前缀 MCP 服务器列表' },
  'features.rollout_budget.enabled': { label: '启用滚动预算' },
  'features.rollout_budget.limit_tokens': { label: '滚动预算 Token 上限' },
  'features.rollout_budget.prefill_token_weight': { label: '预填充 Token 权重' },
  'features.rollout_budget.reminder_at_remaining_tokens': { label: '剩余 Token 提醒阈值 (JSON)' },
  'features.rollout_budget.sampling_token_weight': { label: '采样 Token 权重' },
  'features.token_budget.enabled': { label: '启用 Token 预算' },
  'features.token_budget.auto_compact_fallback_buffer_tokens': { label: '自动压缩回退缓冲 Token' },
  'features.token_budget.auto_compact_fallback_prompt': { label: '自动压缩回退提示词' },
  'features.token_budget.guidance_message': { label: '预算引导消息' },
  'features.token_budget.reminder_message_template': { label: '预算提醒消息模板' },
  'features.token_budget.reminder_threshold_tokens': { label: '预算提醒阈值 Token' },
};

// 常见 features.* 开关的中文标签
const FEATURE_LABELS: Record<string, { label: string; hint?: string }> = {
  apply_patch_freeform: { label: '自由格式 Apply Patch', hint: '允许 Codex 以自由文本格式生成补丁，不严格遵循 unified diff 语法。适合处理复杂多文件改动；关闭后必须使用标准 diff 格式。' },
  apply_patch_streaming_events: { label: 'Apply Patch 流式事件', hint: '在应用补丁时以流式方式逐步输出事件，便于 UI 实时显示修改进度。关闭后补丁一次性应用完成才返回结果。' },
  apps: { label: 'Apps', hint: '启用内置 Apps 生态，允许 Codex 调用预装的小应用（如文件管理、终端等）。关闭后仅保留核心能力。' },
  auth_elicitation: { label: '认证交互', hint: '当 MCP 服务器或工具需要认证时，通过交互式弹窗向用户索取凭据。关闭后认证失败将直接报错。' },
  browser_use: { label: '浏览器操作', hint: '允许 Codex 控制内置浏览器执行网页自动化（点击、输入、截图等）。适合需要与网页交互的任务；关闭后无法操作网页。' },
  browser_use_external: { label: '外部浏览器操作', hint: '允许 Codex 通过 CDP 协议控制用户已打开的外部 Chrome/Edge 浏览器，复用已登录的会话。适合需要操作已登录站点的场景。' },
  browser_use_full_cdp_access: { label: '浏览器完整 CDP 访问', hint: '授予 Codex 完整的 Chrome DevTools Protocol 权限，可执行任意浏览器调试命令。安全风险较高，仅在可信环境下启用。' },
  chronicle: { label: 'Chronicle', hint: '启用 Chronicle 子系统记录 Agent 决策时间线，便于事后审计与回放。会增加少量磁盘 IO 开销。' },
  code_mode_buffered_exec: { label: '代码模式缓冲执行', hint: '在代码模式下缓冲命令输出再批量返回，减少频繁刷新。适合长任务；关闭后实时输出每一行。' },
  code_mode_only: { label: '仅代码模式', hint: '强制只允许通过代码执行工具完成任务，禁用自然语言对话。适合纯自动化脚本场景。' },
  codex_git_commit: { label: 'Codex Git 提交', hint: '允许 Codex 自动创建 Git 提交（含生成 commit message）。适合让 Agent 直接完成提交；关闭后仅修改文件不提交。' },
  codex_hooks: { label: 'Codex Hooks', hint: '启用 Codex 专属的 Hook 钩子机制，在工具调用前后执行自定义脚本。与通用 hooks 配合使用。' },
  collab: { label: '协作', hint: '启用多人协作模式，多个用户可同时查看和介入同一 Agent 会话。需要网络连接。' },
  collaboration_modes: { label: '协作模式', hint: '支持多种协作模式（如 review、pair-programming），允许切换 Agent 与人类的协作方式。' },
  computer_use: { label: '计算机操作', hint: '允许 Codex 通过模拟点击、键盘输入等方式操作桌面 GUI 应用。适合需要与图形软件交互的自动化；关闭后仅支持命令行和 API。' },
  concurrent_reasoning_summaries: { label: '并发推理摘要', hint: '在多个推理分支并发执行时为每个分支生成摘要，便于对比。会增加 token 消耗。' },
  connectors: { label: '连接器', hint: '启用 Connector 子系统连接外部数据源（数据库、API 等），让 Agent 可直接查询外部数据。' },
  default_mode_request_user_input: { label: '默认模式请求用户输入', hint: '在默认模式下允许 Agent 主动向用户提问以澄清需求。关闭后 Agent 会基于自身判断继续。' },
  deferred_executor: { label: '延迟执行器', hint: '将命令延迟到批次末尾统一执行，减少沙箱上下文切换开销。适合批量命令场景。' },
  deferred_tool_world_state: { label: '延迟工具世界状态', hint: '延迟同步工具执行后的文件系统状态，提升性能。可能导致 Agent 短暂看到旧状态。' },
  elevated_windows_sandbox: { label: '提权 Windows 沙箱', hint: '在 Windows 上以管理员权限运行沙箱，可执行需要提权的操作（如安装软件）。安全风险较高。' },
  enable_experimental_windows_sandbox: { label: '启用实验性 Windows 沙箱', hint: '启用仍在实验阶段的 Windows 沙箱实现，可能存在稳定性问题。仅在测试时启用。' },
  enable_fanout: { label: '启用扇出', hint: '允许将一个任务拆分成多个子任务并行扇出到不同 Agent，加速大规模任务。会增加 token 消耗。' },
  enable_mcp_apps: { label: '启用 MCP Apps', hint: '允许通过 MCP 协议接入预打包的应用，扩展 Agent 能力（如访问特定 SaaS 服务）。' },
  enable_request_compression: { label: '启用请求压缩', hint: '对发送给上游模型的请求体进行 gzip 压缩，减少网络流量。适合网络带宽受限场景；关闭后使用原始大小。' },
  exec_permission_approvals: { label: '执行权限审批', hint: '在执行高危命令前弹出审批确认框，要求用户确认。建议在共享或生产环境启用。' },
  executed_tool_call_metadata: { label: '已执行工具调用元数据', hint: '记录每个工具调用的元数据（耗时、返回码、参数等），便于审计和调试。会增加少量内存占用。' },
  executor_capability_discovery: { label: '执行器能力发现', hint: '运行时自动探测可用执行器的能力（支持的命令、工具等），让 Agent 选择更合适的执行方式。' },
  experimental_use_unified_exec_tool: { label: '实验性统一执行工具', hint: '使用实验性的统一执行工具替代原有多个独立工具，简化工具调用流程。稳定性未保证。' },
  experimental_windows_sandbox: { label: '实验性 Windows 沙箱', hint: '实验性 Windows 沙箱实现，用于测试新特性。不建议在生产环境使用。' },
  external_agent_memory_import: { label: '外部 Agent 记忆导入', hint: '允许从其他 Agent 导入记忆数据，便于迁移历史上下文。可能存在格式兼容问题。' },
  external_migration: { label: '外部迁移', hint: '启用从外部系统迁移配置和数据的功能，适合从其他工具切换到 Codex 时使用。' },
  fast_mode: { label: '快速模式', hint: '牺牲部分推理深度换取更快的响应速度。适合简单问答；关闭后使用标准推理流程。' },
  goals: { label: '目标', hint: '启用目标管理子系统，允许 Agent 设置、追踪和完成多步目标。适合长期复杂任务。' },
  guardian_approval: { label: '守护者审批', hint: '由守护 Agent 在执行前审批敏感操作，提供二次确认。适合安全敏感场景。' },
  guardianv2: { label: '守护者 v2', hint: '守护者审批机制的 v2 版本，改进了审批策略和性能。与 guardian_approval 互斥。' },
  hooks: { label: 'Hooks', hint: '启用通用 Hook 机制，在工具调用、消息收发等事件触发自定义脚本。与 codex_hooks 配合使用。' },
  image_detail_original: { label: '图片原始细节', hint: '在向模型传递图片时保留原始分辨率和细节。会增加 token 消耗；关闭后自动压缩图片。' },
  image_generation: { label: '图片生成', hint: '允许 Codex 调用图片生成模型创建图像。需要上游模型支持；关闭后无法生成图片。' },
  imagegenext: { label: 'ImageGen 扩展', hint: '图片生成能力的扩展版本，支持更多参数（尺寸、风格、批量等）。依赖 image_generation 启用。' },
  in_app_browser: { label: '应用内浏览器', hint: '在 Codex 应用内嵌入浏览器窗口，便于查看网页内容而无需切换外部应用。' },
  in_app_updates: { label: '应用内更新', hint: '允许在应用内检查并安装 Codex 版本更新。关闭后需手动下载新版本。' },
  item_ids: { label: '条目 ID', hint: '为会话中的每个消息条目分配唯一 ID，便于精确引用历史消息。' },
  js_repl: { label: 'JS REPL', hint: '启用 JavaScript 交互式解释器，允许 Agent 执行 JS 代码进行计算或验证。' },
  js_repl_tools_only: { label: 'JS REPL 仅工具', hint: '限制 JS REPL 只能作为工具被 Agent 调用，不允许用户直接使用。' },
  local_thread_store_compression: { label: '本地线程存储压缩', hint: '对本地会话线程存储进行压缩，减少磁盘占用。会增加 CPU 开销。' },
  mcp_2026_07_28: { label: 'MCP 2026-07-28', hint: '启用 2026 年 7 月 28 日发布的 MCP 协议版本特性。可能存在兼容性问题。' },
  memories: { label: '记忆', hint: '启用长期记忆子系统，允许 Agent 跨会话记住用户偏好和历史决策。关闭后每次会话从零开始。' },
  memory_tool: { label: '记忆工具', hint: '为 Agent 提供主动读写记忆的工具，配合 memories 使用。关闭后 Agent 无法主动管理记忆。' },
  mentions_v2: { label: '提及 v2', hint: '提及（@）功能的 v2 版本，改进了解析和补全逻辑。与旧版可能存在行为差异。' },
  multi_agent: { label: '多 Agent', hint: '允许 Codex 启动多个子 Agent 并行处理子任务后汇总结果。适合大型复杂任务；关闭后所有工作由单个 Agent 串行完成。' },
  multi_agent_mode: { label: '多 Agent 模式', hint: '启用多 Agent 协作模式 UI 和调度逻辑，需配合 multi_agent 使用。' },
  personality: { label: '人格', hint: '允许为 Agent 配置个性化人格（语气、风格等）。影响回答风格但不影响能力。' },
  plugin_hooks: { label: '插件 Hooks', hint: '允许插件注册自定义 Hook 钩子，扩展 Codex 的事件处理能力。' },
  plugin_sharing: { label: '插件共享', hint: '允许在团队内共享已安装的插件配置。需要网络连接。' },
  plugins: { label: '插件', hint: '启用插件系统，允许加载第三方扩展。关闭后仅保留内置功能。' },
  prevent_idle_sleep: { label: '防止空闲休眠', hint: '在 Agent 运行期间阻止系统进入休眠状态，避免长任务被中断。' },
  realtime_conversation: { label: '实时对话', hint: '启用实时语音/文字对话模式，支持流式双向通信。需要麦克风权限或网络连接。' },
  recommended_plugins: { label: '推荐插件', hint: '在插件市场显示基于当前使用习惯的推荐插件。会收集匿名使用数据。' },
  remote_compaction_v2: { label: '远程压缩 v2', hint: '在服务端进行会话压缩的 v2 版本，减少客户端 token 消耗。需要服务端支持。' },
  remote_control: { label: '远程控制', hint: '允许通过远程连接控制 Codex 实例，便于跨设备协同。存在安全风险，仅在可信网络启用。' },
  remote_models: { label: '远程模型', hint: '允许使用远程服务端提供的模型，扩展可用模型列表。需要网络连接。' },
  remote_plugin: { label: '远程插件', hint: '允许从远程服务器加载插件，便于团队共享。需要网络连接。' },
  request_permissions: { label: '请求权限', hint: '允许 Agent 在需要时主动向用户请求额外权限（如访问特定目录）。关闭后 Agent 仅使用已有权限。' },
  request_permissions_tool: { label: '请求权限工具', hint: '为 Agent 提供请求权限的工具，配合 request_permissions 使用。' },
  request_rule: { label: '请求规则', hint: '启用请求规则引擎，根据预设规则自动审批或拒绝 Agent 的请求。减少人工确认次数。' },
  resize_all_images: { label: '调整所有图片尺寸', hint: '自动调整所有传入图片的尺寸到模型推荐分辨率，减少 token 消耗。关闭后保留原始尺寸。' },
  respect_system_proxy: { label: '遵循系统代理', hint: '自动读取系统代理设置（HTTP_PROXY 等）发送请求。关闭后使用直连。' },
  responses_websockets: { label: 'Responses WebSocket', hint: '通过 WebSocket 传输 Responses API 数据，降低延迟。需要服务端支持。' },
  responses_websockets_v2: { label: 'Responses WebSocket v2', hint: 'WebSocket 传输的 v2 版本，改进了重连和心跳机制。与 v1 互斥。' },
  runtime_metrics: { label: '运行时指标', hint: '收集并上报运行时性能指标（token 速率、延迟等）。用于性能优化分析。' },
  search_tool: { label: '搜索工具', hint: '为 Agent 提供本地文件搜索工具，便于在大型项目中快速定位文件。' },
  secret_auth_storage: { label: '密钥认证存储', hint: '使用系统密钥库（Keychain/Credential Manager）安全存储认证密钥。关闭后使用明文文件存储。' },
  shell_snapshot: { label: 'Shell 快照', hint: '在每次 Shell 执行前快照当前环境状态，便于回滚。会增加磁盘占用。' },
  shell_tool: { label: 'Shell 工具', hint: '允许 Codex 在沙箱中执行本地 Shell 命令（如 ls、git、npm 等）。关闭后 Codex 仅能给出建议，无法实际执行。' },
  shell_zsh_fork: { label: 'Shell zsh fork', hint: '使用 zsh fork 方式执行命令，提升执行隔离性。仅在 zsh 环境下生效。' },
  skill_env_var_dependency_prompt: { label: 'Skill 环境变量依赖提示', hint: '当 Skill 依赖的环境变量缺失时主动提示用户配置。避免 Skill 静默失败。' },
  skill_mcp_dependency_install: { label: 'Skill MCP 依赖安装', hint: '自动安装 Skill 所需的 MCP 服务器依赖。需要网络连接。' },
  skill_search: { label: 'Skill 搜索', hint: '允许 Agent 搜索可用 Skills 库，发现适合当前任务的 Skill。' },
  sqlite: { label: 'SQLite', hint: '启用 SQLite 作为本地数据存储后端，用于会话历史、记忆等。关闭后使用文件存储。' },
  standalone_web_search: { label: '独立网页搜索', hint: '将网页搜索作为独立工具暴露给 Agent，而非内嵌在回答流程中。Agent 可主动决定何时搜索。' },
  steer: { label: 'Steer', hint: '允许在推理过程中动态调整 Agent 的方向和策略，便于中途纠偏。' },
  telepathy: { label: 'Telepathy', hint: '启用 Telepathy 子系统，允许 Agent 之间进行点对点通信。适合多 Agent 协作。' },
  terminal_resize_reflow: { label: '终端重排', hint: '在终端尺寸改变时自动重排历史输出，避免内容错位。适合动态调整窗口大小。' },
  terminal_visualization_instructions: { label: '终端可视化指令', hint: '在终端中渲染可视化指令（图表、进度条等），提升可读性。需要兼容的终端。' },
  tool_call_mcp_elicitation: { label: '工具调用 MCP 交互', hint: '当 MCP 工具调用需要额外信息时通过交互方式向用户询问。配合 auth_elicitation 使用。' },
  tool_search: { label: '工具搜索', hint: '允许 Agent 搜索可用工具列表，在工具众多时快速找到合适的。' },
  tool_search_always_defer_mcp_tools: { label: '工具搜索总是延迟 MCP 工具', hint: '在工具搜索时总是延迟加载 MCP 工具，加快初始搜索速度。MCP 工具会在首次调用时加载。' },
  tool_suggest: { label: '工具建议', hint: '根据当前任务上下文向 Agent 推荐合适的工具，减少工具选择错误。' },
  tui_app_server: { label: 'TUI 应用服务器', hint: '在 TUI 模式下启动内嵌应用服务器，支持在终端内运行轻量应用。' },
  unavailable_dummy_tools: { label: '不可用占位工具', hint: '为不可用的工具显示占位条目，便于用户了解存在但未启用的工具。' },
  undo: { label: '撤销', hint: '允许撤销 Agent 的上一步操作（如文件修改、命令执行）。提供容错能力。' },
  unified_exec: { label: '统一执行', hint: '使用统一执行器替代多个独立执行工具，简化执行流程。与 experimental_use_unified_exec_tool 类似但更稳定。' },
  unified_exec_zsh_fork: { label: '统一执行 zsh fork', hint: '统一执行器使用 zsh fork 方式，提升隔离性。仅在 zsh 环境下生效。' },
  use_agent_identity: { label: '使用 Agent 身份', hint: '在 Git 提交等操作中使用 Agent 专属身份而非用户身份，便于区分人类和 Agent 的操作。' },
  use_legacy_landlock: { label: '使用旧版 Landlock', hint: '使用旧版 Linux Landlock 沙箱实现。仅在内核版本较旧时启用。' },
  use_linux_sandbox_bwrap: { label: '使用 Linux bwrap 沙箱', hint: '使用 bwrap 作为 Linux 沙箱实现，提供文件系统隔离。需要系统安装 bwrap。' },
  web_search: { label: '网页搜索', hint: '允许 Codex 在回答问题时主动检索互联网，获取最新资讯、文档或代码示例。关闭后只能依赖训练数据。' },
  web_search_cached: { label: '网页搜索(缓存)', hint: '使用缓存版的网页搜索，减少重复请求。结果可能略旧。' },
  web_search_request: { label: '网页搜索请求', hint: '暴露网页搜索请求工具，允许 Agent 直接发起搜索请求并获取原始结果。' },
  workspace_dependencies: { label: '工作区依赖', hint: '自动分析工作区的依赖关系，在执行命令前提示缺失的依赖。' },
  workspace_owner_usage_nudge: { label: '工作区所有者使用提示', hint: '向工作区所有者显示使用提示和统计，便于了解团队使用情况。' },
};

function labelAndHintFor(key: string): { label: string; hint?: string } {
  if (CODEX_LABELS[key]) return CODEX_LABELS[key];
  const featureMatch = key.match(/^features\.([a-z0-9_]+)$/);
  if (featureMatch && FEATURE_LABELS[featureMatch[1]]) return FEATURE_LABELS[featureMatch[1]];
  return { label: humanizeKey(key) };
}

const STATIC_SPECS = [...ROOT_SPECS, ...FEATURE_SPECS, ...FEATURE_EXTRA_SPECS, ...COMPLEX_ROOT_SPECS];

const JSON_PARENT_KEYS = new Set(
  STATIC_SPECS.filter((spec) => spec.kind === 'json').map((spec) => spec.key),
);

function humanizeKey(key: string): string {
  return key
    .replace(/\.<(?:id|name|path)>/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.]/g, ' ')
    .replace(/^./, (value) => value.toUpperCase());
}

function inferKind(value: CodexValue): CodexSettingKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? 'stringList' : 'json';
  if (value && typeof value === 'object') return 'json';
  return 'string';
}

function groupForUnknown(key: string): CodexSettingGroup {
  if (key.startsWith('features.')) return 'features';
  if (key.startsWith('tui.')) return 'tui';
  if (key.startsWith('agents.')) return 'agents';
  if (key.startsWith('model') || key === 'personality') return 'model';
  if (key.startsWith('sandbox') || key.startsWith('permissions') || key.includes('approval')) return 'permissions';
  if (key.startsWith('tools.') || key.startsWith('tool_')) return 'tools';
  if (key.startsWith('mcp_') || key.startsWith('mcp_servers') || key.startsWith('model_providers')) return 'integrations';
  if (key.includes('environment') || key.startsWith('shell_')) return 'environment';
  return 'advanced';
}

function allSpecs(settings: Record<string, CodexValue>): CodexSettingSpec[] {
  const known = new Set(STATIC_SPECS.map((spec) => spec.key));
  const dynamic = Object.keys(settings)
    .filter((key) => {
      if (known.has(key)) return false;
      const value = settings[key];
      const hasStaticChild = [...known].some((knownKey) => knownKey.startsWith(`${key}.`));
      if (
        hasStaticChild &&
        !JSON_PARENT_KEYS.has(key) &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        return false;
      }
      for (const parent of JSON_PARENT_KEYS) {
        if (key.startsWith(`${parent}.`)) return false;
      }
      return true;
    })
    .map((key) => ({ key, kind: inferKind(settings[key]), group: groupForUnknown(key) }));
  return [...STATIC_SPECS, ...dynamic];
}

function KeyBadge({ keyName }: { keyName: string }) {
  return (
    <code
      style={{
        marginLeft: 'var(--spacer-6)',
        padding: '1px 5px',
        fontSize: '10px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: 'var(--text-tertiary)',
        background: 'var(--bg-overlay-l1)',
        borderRadius: 'var(--radius-4)',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {keyName}
    </code>
  );
}

function SettingRow({ label, hint, keyName, children }: { label: string; hint?: string; keyName: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacer-16)',
        padding: 'var(--spacer-8) 0',
        borderBottom: '1px solid var(--border-neutral-l1)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
          {label}
          <KeyBadge keyName={keyName} />
        </div>
        {hint && <div style={{ marginTop: 2, color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)', lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div style={{ flex: '0 1 380px', minWidth: 200, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

function SwitchRow({ items }: { items: Array<{ key: string; label: string; hint?: string; keyName: string; checked: boolean; onChange: (next: boolean) => void }> }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: 'var(--spacer-8) 0',
      }}
    >
      {items.map((item, idx) => (
        <div
          key={item.key}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--spacer-10)',
            minWidth: 0,
            padding: 'var(--spacer-8) 0',
            borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--border-neutral-l1)',
          }}
        >
          <Switch checked={item.checked} onChange={item.onChange} aria-label={item.label} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
              {item.label}
              <KeyBadge keyName={item.keyName} />
            </div>
            {item.hint && (
              <div style={{ marginTop: 2, color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)', lineHeight: 1.4 }}>
                {item.hint}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JsonValueEditor({ value, onCommit, placeholder, t }: { value: CodexValue; onCommit: (value: CodexValue) => void; placeholder: string; t: Translate }) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(serialized);
    setInvalid(false);
  }, [serialized]);
  return (
    <div style={{ width: '100%' }}>
      <textarea
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={() => {
          if (!draft.trim()) { onCommit(undefined); return; }
          try { onCommit(JSON.parse(draft)); setInvalid(false); } catch { setInvalid(true); }
        }}
        spellCheck={false}
        placeholder={placeholder}
        style={{
          display: 'block', width: '100%', minHeight: 76, resize: 'vertical', boxSizing: 'border-box',
          padding: 'var(--spacer-8) var(--spacer-10)', border: `1px solid ${invalid ? 'var(--status-error-default)' : 'var(--border-neutral-l1)'}`,
          borderRadius: 'var(--radius-8)', background: 'var(--bg-base-default)', color: 'var(--text-default)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 'var(--body-xs-font-size)', lineHeight: 1.5, outline: 'none',
        }}
      />
      {invalid && <div style={{ marginTop: 4, color: 'var(--status-error-default)', fontSize: 'var(--body-xs-font-size)' }}>{t('applications.codexSettings.invalidFieldJson')}</div>}
    </div>
  );
}

function StringListEditor({ value, onCommit, placeholder }: { value: CodexValue; onCommit: (value: CodexValue) => void; placeholder: string }) {
  const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const serialized = items.join('\n');
  const [draft, setDraft] = useState(serialized);
  useEffect(() => setDraft(serialized), [serialized]);
  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.split('\n').map((item) => item.trim()).filter(Boolean);
        onCommit(next.length ? next : undefined);
      }}
      placeholder={placeholder}
      style={{ display: 'block', width: '100%', minHeight: 66, resize: 'vertical', boxSizing: 'border-box', padding: 'var(--spacer-8) var(--spacer-10)', border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)', background: 'var(--bg-base-default)', color: 'var(--text-default)', fontFamily: 'inherit', fontSize: 'var(--body-sm-font-size)', lineHeight: 1.5, outline: 'none' }}
    />
  );
}

function DraftScalarInput({ value, kind, onCommit, placeholder, label }: { value: CodexValue; kind: 'string' | 'number' | 'integer'; onCommit: (value: CodexValue) => void; placeholder: string; label: string }) {
  const serialized = value === undefined || value === null ? '' : String(value);
  const [draft, setDraft] = useState(serialized);
  useEffect(() => setDraft(serialized), [serialized]);
  return (
    <Input
      type={kind === 'string' ? 'text' : 'number'}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!draft.trim()) { onCommit(undefined); return; }
        if (kind === 'string') { onCommit(draft); return; }
        const parsed = kind === 'integer' ? Number.parseInt(draft, 10) : Number.parseFloat(draft);
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
      placeholder={placeholder}
      aria-label={label}
    />
  );
}

function controlFor(spec: CodexSettingSpec, settings: Record<string, CodexValue>, onUpdate: (key: string, value: CodexValue) => void, t: Translate) {
  const value = settings[spec.key];
  const label = humanizeKey(spec.key);
  const placeholder = t('applications.codexSettings.unset');
  if (spec.kind === 'boolean') {
    return <Switch checked={value === true} onChange={(next) => onUpdate(spec.key, next)} aria-label={label} />;
  }
  if (spec.kind === 'enum') {
    return <Dropdown options={[{ value: '', label: placeholder }, ...(spec.options ?? []).map((option) => ({ value: option, label: option }))]} value={typeof value === 'string' && spec.options?.includes(value) ? value : ''} onChange={(next) => onUpdate(spec.key, next || undefined)} size="sm" style={{ width: '100%' }} />;
  }
  if (spec.kind === 'enumOrJson') {
    if (value !== null && typeof value === 'object') {
      return <JsonValueEditor value={value} onCommit={(next) => onUpdate(spec.key, next)} placeholder={t('applications.codexSettings.jsonPlaceholder')} t={t} />;
    }
    return <Dropdown options={[{ value: '', label: placeholder }, ...(spec.options ?? []).map((option) => ({ value: option, label: option }))]} value={typeof value === 'string' && spec.options?.includes(value) ? value : ''} onChange={(next) => onUpdate(spec.key, next || undefined)} size="sm" style={{ width: '100%' }} />;
  }
  if (spec.kind === 'stringList') {
    return <StringListEditor value={value} onCommit={(next) => onUpdate(spec.key, next)} placeholder={t('applications.codexSettings.listPlaceholder')} />;
  }
  if (spec.kind === 'json') {
    return <JsonValueEditor value={value} onCommit={(next) => onUpdate(spec.key, next)} placeholder={t('applications.codexSettings.jsonPlaceholder')} t={t} />;
  }
  return <DraftScalarInput value={value} kind={spec.kind} onCommit={(next) => onUpdate(spec.key, next)} placeholder={placeholder} label={label} />;
}

export interface CodexSettingsEditorProps {
  settings: Record<string, CodexValue>;
  onSettingChange: (key: string, value: CodexValue) => Promise<void> | void;
  t: Translate;
  /** 是否由 Melody Hub 托管（非自定义模型）。为 true 时隐藏 model 组中的模型细节字段。 */
  managed?: boolean;
}

// 当 Melody Hub 托管时隐藏的 model 组字段：这些由代理自动处理，无需用户配置。
const MANAGED_HIDDEN_MODEL_KEYS = new Set([
  'model',
  'model_provider',
  'model_context_window',
  'model_catalog_json',
  'model_instructions_file',
  'review_model',
  'plan_mode_reasoning_effort',
  'oss_provider',
]);

export function CodexSettingsEditor({ settings, onSettingChange, t, managed = false }: CodexSettingsEditorProps) {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<CodexSettingGroup, boolean>>({
    model: true,
    permissions: true,
    tools: true,
    features: true,
    agents: false,
    integrations: false,
    tui: false,
    environment: false,
    advanced: false,
  });
  const specs = useMemo(() => allSpecs(settings), [settings]);
  const filteredSpecs = useMemo(() => {
    const visible = managed
      ? specs.filter((spec) => !MANAGED_HIDDEN_MODEL_KEYS.has(spec.key))
      : specs;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visible;
    return visible.filter((spec) => {
      const { label, hint } = labelAndHintFor(spec.key);
      return (
        spec.key.toLowerCase().includes(normalized) ||
        humanizeKey(spec.key).toLowerCase().includes(normalized) ||
        label.toLowerCase().includes(normalized) ||
        (hint ? hint.toLowerCase().includes(normalized) : false)
      );
    });
  }, [query, specs, managed]);
  const updateSetting = (key: string, value: CodexValue) => { void onSettingChange(key, value); };

  return (
    <Card padding="0" style={{ overflow: 'hidden', marginTop: 'var(--spacer-16)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--spacer-12)', padding: 'var(--spacer-16) var(--spacer-20)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacer-10)' }}>
          <SlidersHorizontal size={17} style={{ color: 'var(--icon-secondary)', marginTop: 2 }} />
          <div>
            <CardTitle style={{ margin: 0 }}>{t('applications.codexSettings.title')}</CardTitle>
            <CardDesc>{t('applications.codexSettings.hint')}</CardDesc>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
          <button type="button" onClick={() => setOpenGroups(Object.fromEntries(GROUPS.map((group) => [group, true])) as Record<CodexSettingGroup, boolean>)} title={t('applications.codexSettings.expandAll')} aria-label={t('applications.codexSettings.expandAll')} style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}><Maximize2 size={14} /></button>
          <button type="button" onClick={() => setOpenGroups(Object.fromEntries(GROUPS.map((group) => [group, false])) as Record<CodexSettingGroup, boolean>)} title={t('applications.codexSettings.collapseAll')} aria-label={t('applications.codexSettings.collapseAll')} style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}><Minimize2 size={14} /></button>
        </div>
      </div>
      <div style={{ padding: 'var(--spacer-12) var(--spacer-20) 0' }}>
        <Input icon={<ListFilter size={14} />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('applications.codexSettings.searchPlaceholder')} aria-label={t('applications.codexSettings.searchPlaceholder')} />
      </div>
      <div style={{ padding: 'var(--spacer-8) var(--spacer-20) var(--spacer-16)' }}>
        {GROUPS.map((group) => {
          const groupSpecs = filteredSpecs.filter((spec) => spec.group === group);
          if (!groupSpecs.length) return null;
          const opened = openGroups[group];
          return (
            <section key={group} style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
              <button type="button" onClick={() => setOpenGroups((current) => ({ ...current, [group]: !current[group] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: 'none', background: 'transparent', padding: 'var(--spacer-14) 0', color: 'var(--text-default)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--font-weight-strong)', textAlign: 'left' }}>
                <span>{t(`applications.codexSettings.group.${group}`)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)', fontWeight: 'var(--font-weight-normal)' }}>{groupSpecs.length}<ChevronDown size={14} style={{ transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 160ms ease' }} /></span>
              </button>
              {opened && (
                <div>
                  {(() => {
                    const boolSpecs = groupSpecs.filter((spec) => spec.kind === 'boolean');
                    const otherSpecs = groupSpecs.filter((spec) => spec.kind !== 'boolean');
                    return (
                      <>
                        {otherSpecs.map((spec) => {
                          const { label, hint } = labelAndHintFor(spec.key);
                          return (
                            <SettingRow key={spec.key} label={label} hint={hint} keyName={spec.key}>
                              {controlFor(spec, settings, updateSetting, t)}
                            </SettingRow>
                          );
                        })}
                        {boolSpecs.length > 0 && (
                          <SwitchRow
                            items={boolSpecs.map((spec) => {
                              const { label, hint } = labelAndHintFor(spec.key);
                              return {
                                key: spec.key,
                                keyName: spec.key,
                                label,
                                hint,
                                checked: settings[spec.key] === true,
                                onChange: (next) => updateSetting(spec.key, next),
                              };
                            })}
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </section>
          );
        })}
        {!filteredSpecs.length && <div style={{ padding: 'var(--spacer-20) 0', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: 'var(--body-sm-font-size)' }}>{t('applications.codexSettings.noResults')}</div>}
      </div>
    </Card>
  );
}

export default CodexSettingsEditor;

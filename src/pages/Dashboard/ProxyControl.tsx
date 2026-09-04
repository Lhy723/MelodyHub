import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useSettingsStore } from '../../store/settingsStore';
import { desktopApi } from '../../lib/desktopApi';
import { toast, Counter } from '../../components/ui';
import { useT, t as tFn } from '../../i18n';
import { useCopyToClipboard } from '../../components/interior/copy-button';
import { useAsyncAction } from '../../components/interior/loading-button';
import { useIconMorph, MorphGlyph } from '../../components/interior/icon-morph';
import { Loader2, Cpu } from 'lucide-react';
import './dashboard.css';

interface ProxyStatus {
  running: boolean;
  host: string;
  port: number;
  uptimeSecs: number;
}

const formatUptime = (secs: number): { hours: number; mins: number; secs: number } => {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { hours, mins, secs: s };
};

const DURATION_FAST = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };

// 复制行图标：Copy→✓ 路径变形，行级持有避免串扰。
function CopyMorphIcon({ copied }: { copied: boolean }) {
  const icon = useIconMorph({ preset: 'copy-check', active: copied });
  return <MorphGlyph slots={icon.slots} rotate={icon.rotate} transition={icon.transition} mode={icon.mode} size={14} />;
}

export const ProxyControl: React.FC = () => {
  const t = useT();
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  // interior 复制行为：clipboard fallback + 错误态 + 自动复位（修掉手写版无 fallback 与 setTimeout 泄漏）。
  const endpointCopy = useCopyToClipboard({ onCopy: () => toast(tFn('proxy.endpointCopied'), 'success') });
  const tokenCopy = useCopyToClipboard({ onCopy: () => toast(tFn('proxy.tokenCopied'), 'success') });
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  useEffect(() => {
    if (endpointCopy.status === 'idle') setCopiedIdx(null);
  }, [endpointCopy.status]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(Date.now());
  const statusAtRef = useRef<number>(0);

  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  // 启停开关改用 interior loading-button 铬（dashboard.css），进行态由 useAsyncAction 拥有（防重入 + 自动复位）。
  const toggleAction = useAsyncAction({
    action: async () => {
      try {
        if (running) {
          await desktopApi.stopProxy();
          toast(tFn('proxy.stoppedAgent'), 'info');
        } else {
          await desktopApi.startProxy(settings.host, settings.port);
          toast(tFn('proxy.startedAgent'), 'success');
        }
        await desktopApi
          .getProxyStatus()
          .then(setStatus)
          .catch(() => setStatus(null));
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        throw e;
      }
    },
  });

  const poll = useCallback(() => {
    desktopApi
      .getProxyStatus()
      .then((s) => {
        statusAtRef.current = Date.now();
        setStatus(s);
      })
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const baseUrl = `http://${settings.host}:${settings.port}`;
  const endpoints = [
    { label: 'OpenAI', path: '/v1/chat/completions', url: `${baseUrl}/v1/chat/completions` },
    { label: 'Anthropic', path: '/v1/messages', url: `${baseUrl}/v1/messages` },
    { label: 'Responses', path: '/v1/responses', url: `${baseUrl}/v1/responses` },
  ];
  const authToken = settings.authToken;
  const running = status?.running ?? false;
  const showUptime = running && status !== null;
  // 启停图标走 interior play-pause 路径变形（受控：running=true 显示暂停杠）。
  const toggleIcon = useIconMorph({ preset: 'play-pause', active: running });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const copyEndpoint = (index: number) => {
    setCopiedIdx(index);
    void endpointCopy.copy(endpoints[index].url);
  };

  const copyToken = () => {
    if (!authToken) return;
    void tokenCopy.copy(authToken);
  };

  const totalUptime = showUptime ? status!.uptimeSecs + Math.max(0, Math.floor((now - statusAtRef.current) / 1000)) : 0;
  const uptimeParts = formatUptime(totalUptime);
  const counterProps = {
    fontSize: 11,
    gap: 0,
    horizontalPadding: 0,
    gradientHeight: 0,
    gradientFrom: 'transparent',
    gradientTo: 'transparent',
    textColor: 'var(--text-tertiary)',
    fontWeight: 'inherit' as const,
  };

  // Combine endpoints + token into a 4-item list for 2x2 grid.
  const gridItems = [
    ...endpoints.map((ep, idx) => ({
      kind: 'endpoint' as const,
      key: `ep-${idx}`,
      label: ep.label,
      value: ep.url,
      copied: endpointCopy.copied && copiedIdx === idx,
      onCopy: () => void copyEndpoint(idx),
    })),
    {
      kind: 'token' as const,
      key: 'token',
      label: tFn('proxy.token'),
      value: authToken,
      copied: tokenCopy.copied,
      onCopy: () => void copyToken(),
    },
  ];

  return (
    // interior 卡片语言：扁平白底 + 1px 发丝线 + radius-12 + shadow-sm，不再整卡随状态变色。
    <div
      style={{
        background: 'var(--bg-base-default)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--spacer-20) var(--spacer-20) var(--spacer-16)',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      {/* ── Header: icon + title + status dot/text, toggle button on the right ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-20)',
          marginBottom: 'var(--spacer-20)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-10)',
            }}
          >
            {/* 48px 图标块：静态 token 底，CPU 呼吸动画已删（状态点足够表达运行态）。 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-12)',
                background: 'var(--bg-overlay-l1)',
                border: '1px solid var(--border-neutral-l1)',
                flexShrink: 0,
              }}
            >
              <Cpu
                size={22}
                style={{
                  color: running ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                  transition: 'color 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-8)',
                  fontSize: 'var(--heading-xs-font-size)',
                  fontWeight: 'var(--font-weight-strong)',
                  color: 'var(--text-default)',
                }}
              >
                {t('proxy.label')}
                {/* running/stopped 用状态色点 + 文字表达（复用 rb-status-dot 变体），不整卡变色。 */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={running ? 'running' : 'stopped'}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={DURATION_FAST}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-6)',
                      fontSize: 'var(--body-sm-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: running ? 'var(--status-success-default)' : 'var(--text-tertiary)',
                    }}
                  >
                    <span
                      className={running ? 'rb-status-dot--running' : 'rb-status-dot--stopped'}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 'var(--radius-full)',
                        display: 'inline-block',
                      }}
                    />
                    {running ? t('proxy.running') : t('proxy.stopped')}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div
                style={{
                  fontSize: 'var(--body-sm-font-size)',
                  color: 'var(--text-tertiary)',
                  marginTop: 'var(--spacer-2)',
                  minHeight: '16px',
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {showUptime ? (
                    <motion.span
                      key="uptime"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={DURATION_FAST}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                    >
                      {t('proxy.uptime')}
                      {uptimeParts.hours > 0 && (
                        <>
                          <Counter value={uptimeParts.hours} {...counterProps} />
                          <span>{t('proxy.uptimeHours')}</span>
                        </>
                      )}
                      <Counter value={uptimeParts.mins} {...counterProps} />
                      <span>{t('proxy.uptimeMins')}</span>
                      {uptimeParts.hours === 0 && (
                        <>
                          <Counter value={uptimeParts.secs} {...counterProps} />
                          <span>{t('proxy.uptimeSecs')}</span>
                        </>
                      )}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={DURATION_FAST}
                    >
                      {t('proxy.endpointHint')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle button — interior loading-button 铬（dashboard.css），StarBorder 流光描边已删 */}
        <motion.button
          className={`mh-proxy-toggle${running ? ' mh-proxy-toggle--running' : ''}`}
          onClick={toggleAction.run}
          disabled={toggleAction.pending}
          whileTap={!reduced && !toggleAction.pending ? { scale: 0.97 } : undefined}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
          style={{ flexShrink: 0 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {toggleAction.pending ? (
              <motion.span
                key="loading"
                initial={{ rotate: 0, opacity: 0 }}
                animate={{ rotate: reduced ? 0 : 360, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  rotate: { duration: 0.6, repeat: Infinity, ease: 'linear' },
                  opacity: { duration: 0.15 },
                }}
                style={{ display: 'flex' }}
              >
                <Loader2 size={16} />
              </motion.span>
            ) : (
              // 启停图标走 interior play-pause 路径变形：三角形与双杠直接插值。
              <span key="morph" style={{ display: 'flex' }}>
                <svg
                  viewBox="0 0 24 24"
                  width={14}
                  height={14}
                  fill="currentColor"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  {toggleIcon.slots.map((slot) => (
                    <motion.path
                      key={slot.key}
                      initial={false}
                      animate={{ d: slot.d, opacity: slot.visible ? 1 : 0 }}
                      transition={toggleIcon.transition}
                    />
                  ))}
                </svg>
              </span>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {!toggleAction.pending && (
              <motion.span
                key={running ? 'stop-text' : 'start-text'}
                initial={{ opacity: 0, x: running ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: running ? 8 : -8 }}
                transition={DURATION_FAST}
              >
                {running ? t('proxy.stop') : t('proxy.start')}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── 2x2 grid: OpenAI / Anthropic / Responses / 令牌 ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--spacer-8)',
        }}
      >
        {gridItems.map((item) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-10)',
              padding: 'var(--spacer-10) var(--spacer-10) var(--spacer-10) var(--spacer-12)',
              borderRadius: 'var(--radius-10)',
              background: 'var(--bg-overlay-l1)',
              border: '1px solid var(--border-neutral-l1)',
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 'var(--body-xs-font-size)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                minWidth: 76,
              }}
            >
              {item.label}
            </span>
            {item.kind === 'endpoint' || (item.kind === 'token' && item.value) ? (
              <>
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--body-sm-font-size)',
                    fontFamily: 'var(--font-family-mono)',
                    color: 'var(--text-default)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.kind === 'token' && item.value.length > 32
                    ? `${item.value.slice(0, 16)}...${item.value.slice(-8)}`
                    : item.value}
                </code>
                <button
                  className={`mh-proxy-copy${item.copied ? ' is-copied' : ''}`}
                  onClick={item.onCopy}
                  aria-label={item.kind === 'token' ? '复制令牌' : '复制地址'}
                >
                  <CopyMorphIcon copied={item.copied} />
                </button>
              </>
            ) : (
              <span
                style={{
                  flex: 1,
                  fontSize: 'var(--body-sm-font-size)',
                  color: 'var(--text-tertiary)',
                  fontStyle: 'italic',
                }}
              >
                {t('proxy.tokenUnset')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

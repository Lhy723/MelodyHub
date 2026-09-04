import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettingsStore } from '../../store/settingsStore';
import { desktopApi } from '../../lib/desktopApi';
import { toast, Counter, StarBorder } from '../../components/ui';
import { useT, t as tFn } from '../../i18n';
import { useCopyToClipboard } from '../../components/interior/copy-button';
import { useAsyncAction } from '../../components/interior/loading-button';
import { useIconMorph, MorphGlyph } from '../../components/interior/icon-morph';
import { Loader2, Cpu } from 'lucide-react';

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

const CARD_THEME = {
  '--text-default': 'rgba(255,255,255,0.92)',
  '--text-secondary': 'rgba(255,255,255,0.7)',
  '--text-tertiary': 'rgba(255,255,255,0.5)',
  '--text-disabled': 'rgba(255,255,255,0.25)',
  '--icon-tertiary': 'rgba(255,255,255,0.4)',
  '--icon-disabled': 'rgba(255,255,255,0.15)',
  '--status-success-default': '#4ade80',
  '--status-error-default': '#f87171',
  '--status-success-surface-l1': 'rgba(74,222,128,0.12)',
  '--status-error-surface-l1': 'rgba(248,113,113,0.12)',
  '--status-success-hover': '#22c55e',
  '--status-error-hover': '#ef4444',
  '--text-onbrand': '#ffffff',
} as unknown as React.CSSProperties;

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

// 复制行图标：Copy→✓ 路径变形，行级持有避免串扰。
function CopyMorphIcon({ copied }: { copied: boolean }) {
  const icon = useIconMorph({ preset: 'copy-check', active: copied });
  return <MorphGlyph slots={icon.slots} rotate={icon.rotate} transition={icon.transition} mode={icon.mode} size={14} />;
}
const DURATION_SLOW = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };
const DURATION_FAST = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };

export const ProxyControl: React.FC = () => {
  const t = useT();
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

  // 启停开关保留玻璃拟态铬，进行态改由 useAsyncAction 拥有（防重入 + 自动复位，替代手写 toggling state）。
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
  // 启停图标走 interior play-pause 路径变形（受控：running=true 显示暂停杠）；按钮铬与加载态保持原样。
  const toggleIcon = useIconMorph({ preset: 'play-pause', active: running });
  // 两行复制按钮的 Copy→✓ 同样走路径变形（行级组件持有各自状态，避免多行共用一个 hook 互相串扰）。

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
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-16)',
        overflow: 'hidden',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      {/* 静态深色底：WebGL Prism 动画已删除，换成静态渐变（左上绿光 + 右上蓝光）。 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          background:
            'radial-gradient(120% 90% at 12% 0%, rgba(74,222,128,0.14) 0%, rgba(74,222,128,0) 42%), radial-gradient(120% 100% at 88% 8%, rgba(96,165,250,0.16) 0%, rgba(96,165,250,0) 46%), linear-gradient(180deg, #101418 0%, #0a0d11 100%)',
          opacity: running ? 1 : 0.75,
          transition: 'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 32%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--radius-16)',
        }}
      >
        <div
          style={{
            padding: 'var(--spacer-20) var(--spacer-20) var(--spacer-16)',
            ...CARD_THEME,
          }}
        >
          {/* ── Header: icon + title + status, with toggle button on the right ── */}
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
                <motion.div
                  initial={false}
                  animate={{
                    background: running ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.10)',
                    borderColor: running ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.14)',
                  }}
                  transition={DURATION_FAST}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: 'var(--radius-12)',
                    backdropFilter: 'blur(12px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(12px) saturate(140%)',
                    border: '1px solid',
                    flexShrink: 0,
                  }}
                >
                  <motion.div
                    animate={running ? { scale: [1, 1.06, 1], opacity: [0.9, 1, 0.9] } : { scale: 1, opacity: 1 }}
                    transition={running ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Cpu
                      size={22}
                      style={{
                        color: running ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                        transition: 'color 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </motion.div>
                </motion.div>

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
                    <motion.span
                      layout
                      initial={false}
                      animate={{
                        background: running ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.10)',
                        borderColor: running ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.14)',
                        color: running ? 'var(--status-success-default)' : 'var(--text-tertiary)',
                      }}
                      transition={SPRING}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-4)',
                        height: 22,
                        padding: '0 var(--spacer-8)',
                        borderRadius: 'var(--radius-6)',
                        fontSize: 'var(--body-xs-font-size)',
                        fontWeight: 'var(--font-weight-medium)',
                        backdropFilter: 'blur(12px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
                        border: '1px solid',
                      }}
                    >
                      <motion.span
                        initial={false}
                        animate={
                          running
                            ? {
                                scale: [1, 1.5, 1],
                                opacity: [1, 0.5, 1],
                                background: 'var(--status-success-default)',
                                boxShadow: '0 0 0 0 rgba(74,222,128,0.5)',
                              }
                            : {
                                scale: 1,
                                opacity: 1,
                                background: 'var(--text-disabled)',
                                boxShadow: '0 0 0 0 rgba(255,255,255,0)',
                              }
                        }
                        transition={
                          running
                            ? {
                                scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                                opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                                background: { duration: 0.4 },
                                boxShadow: { duration: 0.4 },
                              }
                            : { duration: 0.3 }
                        }
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--radius-full)',
                          display: 'inline-block',
                        }}
                      />
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={running ? 'running' : 'stopped'}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={DURATION_FAST}
                        >
                          {running ? t('proxy.running') : t('proxy.stopped')}
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>
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

            {/* Toggle button — with StarBorder glow when stopped */}
            <StarBorder
              color={running ? 'rgba(248,113,113,0.40)' : '#4ADE80'}
              speed="5s"
              thickness={2}
            >
              <motion.button
              onClick={toggleAction.run}
              disabled={toggleAction.pending}
              initial={false}
              animate={{
                background: running
                  ? toggleAction.pending
                    ? 'rgba(248,113,113,0.20)'
                    : 'rgba(248,113,113,0.30)'
                  : toggleAction.pending
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(74,222,128,0.30)',
                borderColor: running ? 'rgba(248,113,113,0.30)' : 'rgba(74,222,128,0.30)',
                scale: toggleAction.pending ? 0.96 : 1,
              }}
              whileHover={
                toggleAction.pending
                  ? {}
                  : {
                      background: running ? 'rgba(248,113,113,0.42)' : 'rgba(74,222,128,0.42)',
                      scale: 1.03,
                    }
              }
              whileTap={toggleAction.pending ? {} : { scale: 0.97 }}
              transition={SPRING}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-8)',
                height: 44,
                padding: '0 var(--spacer-24)',
                borderRadius: 'var(--radius-10)',
                border: '1px solid',
                cursor: toggleAction.pending ? 'not-allowed' : 'pointer',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: 'var(--font-weight-strong)',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(14px) saturate(160%)',
                WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                color: 'var(--text-onbrand)',
                flexShrink: 0,
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {toggleAction.pending ? (
                  <motion.span
                    key="loading"
                    initial={{ rotate: 0, opacity: 0 }}
                    animate={{ rotate: 360, opacity: 1 }}
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
                  // 启停图标改走 interior 路径变形：运行中 ↔ 已停止之间三角形与双杠直接插值，不再整图标缩放旋转替换。
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
            </StarBorder>
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
              <motion.div
                key={item.key}
                initial={false}
                animate={{
                  background: running ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
                  borderColor: running ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)',
                }}
                transition={DURATION_FAST}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-10)',
                  padding: 'var(--spacer-10) var(--spacer-10) var(--spacer-10) var(--spacer-12)',
                  borderRadius: 'var(--radius-10)',
                  backdropFilter: 'blur(14px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(150%)',
                  border: '1px solid',
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
                    <motion.code
                      initial={false}
                      animate={{
                        color: running ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
                      }}
                      transition={DURATION_SLOW}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 'var(--body-sm-font-size)',
                        fontFamily: 'var(--font-family-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.kind === 'token' && item.value.length > 32
                        ? `${item.value.slice(0, 16)}...${item.value.slice(-8)}`
                        : item.value}
                    </motion.code>
                    <button
                      onClick={item.onCopy}
                      aria-label={item.kind === 'token' ? '复制令牌' : '复制地址'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 'var(--radius-8)',
                        border: 'none',
                        background: 'transparent',
                        color: item.copied ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition:
                          'color var(--transition-fast, 0.12s ease), background var(--transition-fast, 0.12s ease)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                        if (!item.copied) e.currentTarget.style.color = 'rgba(255,255,255,0.92)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        if (!item.copied) e.currentTarget.style.color = 'var(--icon-tertiary)';
                      }}
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
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

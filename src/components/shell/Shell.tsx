import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GradualBlur, ToastContainer } from '../ui';
import { isMac, useWindowFilled, WindowControls } from './WindowControls';
import { useT } from '../../i18n';

export const Shell: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const activeKey = pathSegments[0] || 'dashboard';
  const rootPath = pathSegments[0] ? `/${pathSegments[0]}` : '/';
  const pageTitles: Record<string, string> = {
    '/dashboard': t('shell.dashboard'),
    '/providers': t('shell.providers'),
    '/models': t('shell.models'),
    '/requests': t('shell.requests'),
    '/applications': t('shell.applicationSettings'),
    '/settings': t('shell.settings'),
  };
  const pageTitle = pageTitles[location.pathname] || pageTitles[rootPath] || 'Melody Hub';
  const mainRef = useRef<HTMLElement>(null);
  const windowFilled = useWindowFilled();

  // Scroll to top on route change
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div
      className="ds-shell"
      style={{
        display: 'flex',
        width: '100%',
        height: '100vh',
        background: 'var(--bg-base-default)',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--body-base-font-size)',
        lineHeight: 'var(--body-base-line-height)',
        ['--sidebar-width' as string]: '220px', // 唯一字面量源；Sidebar 与内容区均引用该 var。
        position: 'relative',
        // macOS transparent window needs rounded corners; disable when maximized/fullscreen.
        // Windows keeps sharp corners in all states.
        borderRadius: isMac && !windowFilled ? 10 : 0,
        overflow: 'hidden',
      }}
    >
      {/* interior 基调：背景交给纯 --bg-base-default，不再叠加噪点纹理/品牌径向光装饰层。 */}

      <Sidebar activeKey={activeKey} onNavigate={navigate} />
      <div
        className="ds-shell__content"
        style={{
          flex: 'none',
          marginLeft: 'var(--sidebar-width, 220px)',
          width: 'calc(100% - var(--sidebar-width, 220px))',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          background: 'transparent' /* 透出壳层 --bg-base-default 纯色底 */,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <main
          ref={mainRef}
          className="ds-shell__main"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollbarGutter: 'stable',
          }}
          key={location.pathname}
        >
          {/* Visual layer: sticky header with blur.
              pointer-events: none so mouse events pass through to the drag
              overlay above. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              height: '6rem',
              pointerEvents: 'none',
            }}
          >
            {/* Gradual blur background */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
              }}
              aria-hidden
            >
              <GradualBlur
                target="parent"
                position="top"
                height="6rem"
                strength={2}
                divCount={6}
                curve="bezier"
                opacity={1}
                zIndex={0}
              />
            </div>

            {/* Page title */}
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                padding: 'var(--spacer-24) var(--spacer-24) var(--spacer-16)',
              }}
            >
              <h1
                style={{
                  fontFamily: 'var(--font-family-heading)',
                  fontSize: 'var(--heading-md-font-size)',
                  fontWeight: 'var(--font-weight-strong)',
                  lineHeight: 'var(--heading-md-line-height)',
                  color: 'var(--text-default)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              >
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Page content */}
          <div style={{ padding: '0 var(--spacer-24) var(--spacer-24)' }}>
            <Outlet />
          </div>
        </main>

        {/* Interaction layer: transparent drag overlay outside the scrollable
            main. Positioned absolutely to cover the same 6rem area as the
            sticky header. Since it is not inside an overflow:auto container,
            WebKit hit-testing works reliably. The visual layer below has
            pointer-events: none so all mouse events land here. */}
        <div
          data-tauri-drag-region
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6rem',
            zIndex: 11,
          }}
        />

        {/* Window control buttons (Windows/Linux only).
            Positioned at the top-right, above the drag overlay so
            minimize / maximize / close are always clickable. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 12,
            height: 32,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <WindowControls />
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

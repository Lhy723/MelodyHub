import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/shell/Shell';
import { useSettingsStore } from './store/settingsStore';
import { applyAccentColor } from './lib/colorUtils';
import { useT } from './i18n';

const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const ModelConfig = lazy(() => import('./pages/ModelConfig/ModelConfig').then((m) => ({ default: m.ModelConfig })));
const ModelDetailPage = lazy(() =>
  import('./pages/ModelConfig/ModelDetailPage').then((m) => ({ default: m.ModelDetailPage })),
);
const Providers = lazy(() => import('./pages/Providers/Providers').then((m) => ({ default: m.Providers })));
const AddProviderPage = lazy(() =>
  import('./pages/Providers/AddProviderPage').then((m) => ({ default: m.AddProviderPage })),
);
const EditProviderPage = lazy(() =>
  import('./pages/Providers/EditProviderPage').then((m) => ({ default: m.EditProviderPage })),
);
const ProviderDetailPage = lazy(() =>
  import('./pages/Providers/ProviderDetailPage').then((m) => ({ default: m.ProviderDetailPage })),
);
const RequestsPage = lazy(() =>
  import('./pages/Requests/index').then((m) => ({ default: m.RequestsPage })),
);
const Settings = lazy(() => import('./pages/Settings/Settings').then((m) => ({ default: m.Settings })));
const ApplicationSettings = lazy(() =>
  import('./pages/ApplicationSettings/ApplicationSettings').then((m) => ({ default: m.ApplicationSettings })),
);

function PageLoading() {
  const t = useT();

  return (
    <div className="app-page-loading" role="status" aria-live="polite">
      <span className="app-page-loading__spinner" aria-hidden="true" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

function resolveTheme(theme: string): string {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const accentColor = useSettingsStore((s) => s.settings.accentColor);
  const loaded = useSettingsStore((s) => s.loaded);
  const [, setResolvedTheme] = useState(() => resolveTheme(theme));

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);

    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      applyAccentColor(accentColor, next === 'dark');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, accentColor]);

  useEffect(() => {
    if (loaded) {
      const isDark = resolveTheme(theme) === 'dark';
      applyAccentColor(accentColor, isDark);
    }
  }, [accentColor, loaded, theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<PageLoading />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/models"
            element={
              <Suspense fallback={<PageLoading />}>
                <ModelConfig />
              </Suspense>
            }
          />
          <Route
            path="/models/:modelName"
            element={
              <Suspense fallback={<PageLoading />}>
                <ModelDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/requests"
            element={<RequestsPage />}
          />
          <Route
            path="/providers"
            element={
              <Suspense fallback={<PageLoading />}>
                <Providers />
              </Suspense>
            }
          />
          <Route
            path="/providers/new"
            element={
              <Suspense fallback={<PageLoading />}>
                <AddProviderPage />
              </Suspense>
            }
          />
          <Route
            path="/providers/:providerId"
            element={
              <Suspense fallback={<PageLoading />}>
                <ProviderDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/providers/:providerId/edit"
            element={
              <Suspense fallback={<PageLoading />}>
                <EditProviderPage />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<PageLoading />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="/applications"
            element={
              <Suspense fallback={<PageLoading />}>
                <ApplicationSettings />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;

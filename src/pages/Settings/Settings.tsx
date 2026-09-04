import { AnimatedContent } from '../../components/ui';
import { SettingsForm } from './SettingsForm';

export const Settings: React.FC = () => {
  return (
    <div
      style={{
        background: 'var(--bg-base-default)',
        minHeight: 'calc(100vh - var(--header-height, 0px))',
        // 负 margin 与父容器（Shell 内容区）的 var(--spacer-24) padding 耦合：
        // 父级每边 24px 内距被三边拉回，让页面底色铺满内容视口，改父级时需同步。
        margin: '-24px -24px -24px',
        // 28px 水平内距视觉上更接近 24，收敛为 token 并与负 margin 保持同节奏。
        padding: 'var(--spacer-24) var(--spacer-24) var(--spacer-48)',
        boxSizing: 'border-box',
      }}
    >
      <AnimatedContent distance={6}>
        <SettingsForm />
      </AnimatedContent>
    </div>
  );
};

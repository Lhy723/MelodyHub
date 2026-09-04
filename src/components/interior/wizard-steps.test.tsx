import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WizardSteps } from './wizard-steps';

const steps = [
  { id: 'a', label: '第一步', content: <p>内容 A</p> },
  { id: 'b', label: '第二步', content: <p>内容 B</p> },
  { id: 'c', label: '第三步', content: <p>内容 C</p> },
];

describe('WizardSteps', () => {
  it('首步渲染内容 + 下一步前进', () => {
    render(<WizardSteps steps={steps} nextLabel="下一步" finishLabel="完成" />);
    expect(screen.getByText('内容 A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('内容 B')).toBeTruthy();
  });

  it('canNext=false 时前进按钮禁用', () => {
    render(<WizardSteps steps={steps} canNext={false} nextLabel="下一步" finishLabel="完成" />);
    expect((screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('railNavigation=false 时轨道不可点（只做进度展示）', () => {
    render(<WizardSteps steps={steps} railNavigation={false} nextLabel="下一步" finishLabel="完成" />);
    // 轨道上没有任何可点的步骤按钮
    expect(screen.queryByRole('button', { name: /Step 2 of 3/ })).toBeNull();
    // 下一步按钮仍可前进
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('内容 B')).toBeTruthy();
  });

  it('受控 index + 方向回報', () => {
    const onIndexChange = vi.fn();
    function Harness() {
      const [index, setIndex] = React.useState(0);
      return (
        <WizardSteps
          steps={steps}
          index={index}
          onIndexChange={(i, d) => {
            onIndexChange(i, d);
            setIndex(i);
          }}
          nextLabel="下一步"
          finishLabel="完成"
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(onIndexChange).toHaveBeenCalledWith(1, 1);
    expect(screen.getByText('内容 B')).toBeTruthy();
  });

  it('最后一步点完成触发 onComplete', () => {
    const onComplete = vi.fn();
    render(
      <WizardSteps steps={steps} defaultIndex={2} onComplete={onComplete} nextLabel="下一步" finishLabel="完成" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('bare 模式去掉视口卡片铬', () => {
    const { container } = render(<WizardSteps steps={steps} bare height="auto" />);
    expect(container.querySelector('.mh-wizard-steps.is-bare')).toBeTruthy();
  });
});

import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Plus, Trash2 } from 'lucide-react';
import { useIconMorph, MorphGlyph } from '../../../components/interior/icon-morph';
import { FloatingLabelInput } from '../../../components/interior/floating-label';

interface ProviderMappingsTabProps {
  mappings: Record<string, string>;
  onChange: (mappings: Record<string, string>) => void;
}

export const ProviderMappingsTab: React.FC<ProviderMappingsTabProps> = ({ mappings, onChange }) => {
  const [expanded, setExpanded] = useState(true);
  const expandIcon = useIconMorph({ preset: 'chevron', active: expanded });
  const entries = Object.entries(mappings);

  const updateEntry = (idx: number, key: string, value: string) => {
    const newEntries = [...entries];
    newEntries[idx] = [key, value];
    onChange(Object.fromEntries(newEntries.filter(([k, v]) => k || v)));
  };

  const removeEntry = (idx: number) => {
    const newEntries = entries.filter((_, i) => i !== idx);
    onChange(Object.fromEntries(newEntries));
  };

  const addEntry = () => {
    onChange({ ...mappings, '': '' });
  };

  return (
    <div style={{ padding: '24px 0' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '12px 0',
          background: 'none',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border-neutral-l1)' : 'none',
          cursor: 'pointer',
          color: 'var(--text-default)',
          font: 'inherit',
          fontSize: 'var(--body-base-font-size)',
          fontWeight: 500,
        }}
      >
        <MorphGlyph slots={expandIcon.slots} rotate={expandIcon.rotate} transition={expandIcon.transition} mode={expandIcon.mode} size={16} />
        <span>模型映射</span>
        <span
          style={{
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-sm-font-size)',
            fontWeight: 400,
            marginLeft: 8,
          }}
        >
          将客户端请求的模型名映射到上游实际模型名
        </span>
        {entries.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
            {entries.length} 条规则
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(([key, value], idx) => (
            <div key={idx} className="mh-mapping-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FloatingLabelInput
                  label="逻辑模型名"
                  value={key}
                  onChange={(v) => updateEntry(idx, v, value)}
                  hint="支持 * 通配符"
                />
              </div>
              <span style={{ color: 'var(--text-tertiary)', marginTop: 32 }}>→</span>
              <div style={{ flex: 1 }}>
                <FloatingLabelInput
                  label="上游模型名"
                  value={value}
                  onChange={(v) => updateEntry(idx, key, v)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                style={{
                  width: 32,
                  height: 32,
                  marginTop: 24,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'none',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={Plus} onClick={addEntry} style={{ marginTop: 4 }}>
            添加映射规则
          </Button>
        </div>
      )}
    </div>
  );
};

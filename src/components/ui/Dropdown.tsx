import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { t as i18n } from '../../i18n';

// ═══════════════════════════════════════════════════════════════
// Dropdown — custom styled select replacement
// ═══════════════════════════════════════════════════════════════
// Replaces native <select> for lists where styling control matters
// (long option lists, grouped options, themed scrollbars). Supports:
//   - Optional grouped options (rendered with non-selectable headers)
//   - Optional search/filter input
//   - Keyboard nav: ArrowUp/Down, Enter, Escape, Home/End
//   - Click-outside-to-close
//   - Max-height with themed scrollbar (ds-scroll class)
// ═══════════════════════════════════════════════════════════════

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional group header; options sharing a group render under it. */
  group?: string;
  /** Disabled options render dimmed, are skipped by keyboard nav and cannot be selected. */
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show a search box at the top of the dropdown. */
  searchable?: boolean;
  /** Placeholder shown inside the optional search box. */
  searchPlaceholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** Control the trigger button height: 'sm' (32px) or 'md' (36px). */
  size?: 'sm' | 'md';
  /** Custom render for the selected value's display label. */
  renderValue?: (opt: DropdownOption | undefined) => string;
  /** Custom render for each option's content (e.g. logo + label). */
  renderOption?: (opt: DropdownOption) => React.ReactNode;
  /** Custom render for the trigger's leading content (e.g. logo). */
  renderTriggerLeading?: (opt: DropdownOption | undefined) => React.ReactNode;
  /** Max visible items before scrolling (controls max-height). */
  maxItems?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = i18n('common.selectPlaceholder'),
  searchable = false,
  searchPlaceholder = '搜索…',
  disabled = false,
  style,
  className,
  size = 'md',
  renderValue,
  renderOption,
  renderTriggerLeading,
  maxItems = 8,
}) => {
  const [open, setOpen] = useState(false);
  const [renderPopup, setRenderPopup] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popupRect, setPopupRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  // Ported from interior dropdown: distinguish keyboard vs pointer navigation
  // (only keyboard nav auto-scrolls), plus a typeahead buffer.
  const viaKey = useRef(false);
  const typeBuffer = useRef('');
  const typeTimer = useRef<number | null>(null);

  const selected = options.find((o) => o.value === value);

  // Filter options by query (matches label or group).
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const normalizedQuery = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(normalizedQuery) || (o.group && o.group.toLowerCase().includes(normalizedQuery)),
    );
  }, [options, query]);

  // Build a flat list of *selectable* options (excluding group headers)
  // for keyboard navigation indexing.
  const flatSelectable = filtered;

  const openDropdown = useCallback((withMotion: boolean) => {
    setMotionEnabled(withMotion);
    setRenderPopup(true);
    setOpen(true);
  }, []);

  const closeDropdown = useCallback((withMotion: boolean) => {
    setMotionEnabled(withMotion);
    setOpen(false);
    setQuery('');

    if (!withMotion) {
      setRenderPopup(false);
      setPopupRect(null);
    }
  }, []);

  // Close on outside click (also accounts for portal popup).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapRef.current?.contains(target);
      const inPopup = popupRef.current?.contains(target);
      if (!inWrapper && !inPopup) {
        closeDropdown(true);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, closeDropdown]);

  // Close when the window loses focus (e.g. Tauri window blur, alt-tab).
  // Ported from interior dropdown.
  useEffect(() => {
    if (!open) return;
    const onBlur = () => closeDropdown(false);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [open, closeDropdown]);

  // Clear the typeahead buffer timer on unmount.
  useEffect(
    () => () => {
      if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
    },
    [],
  );

  // Measure trigger position and reposition on scroll/resize while rendered,
  // including while an exit transition is completing.
  const updatePosition = useCallback(() => {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPopupRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (renderPopup) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
    setPopupRect(null);
    return;
  }, [renderPopup, updatePosition]);

  // Step to the next/previous *enabled* option, wrapping around.
  // Ported from interior dropdown.
  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      const n = flatSelectable.length;
      if (n === 0) return -1;
      let i = from;
      for (let k = 0; k < n; k++) {
        i = (i + dir + n) % n;
        if (!flatSelectable[i].disabled) return i;
      }
      return from;
    },
    [flatSelectable],
  );

  // Prefix typeahead over the filtered options (skips disabled).
  // Ported from interior dropdown; ignored while typing in the search box.
  const typeahead = useCallback(
    (char: string) => {
      if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
      typeBuffer.current += char.toLowerCase();
      typeTimer.current = window.setTimeout(() => {
        typeBuffer.current = '';
      }, 600);
      const q = typeBuffer.current;
      const n = flatSelectable.length;
      if (n === 0) return;
      const from = activeIndex < 0 ? 0 : activeIndex;
      const start = q.length > 1 ? from : from + 1;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        const it = flatSelectable[i];
        if (!it.disabled && it.label.toLowerCase().startsWith(q)) {
          viaKey.current = true;
          setActiveIndex(i);
          return;
        }
      }
    },
    [flatSelectable, activeIndex],
  );

  // Reset active index when opening / when filter changes.
  // Lands on the selected option, or the first enabled one.
  useEffect(() => {
    if (open) {
      let idx = options.findIndex((o) => o.value === value);
      if (idx < 0 || options[idx].disabled) {
        idx = options.findIndex((o) => !o.disabled);
      }
      setActiveIndex(idx);
      setQuery('');
    }
  }, [open, options, value]);

  // Scroll active item into view — only for keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0 || !viaKey.current) return;
    viaKey.current = false;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const selectIndex = useCallback(
    (index: number) => {
      const item = flatSelectable[index];
      if (!item || item.disabled) return;
      onChange(item.value);
      closeDropdown(false);
    },
    [flatSelectable, onChange, closeDropdown],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDropdown(false);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          viaKey.current = true;
          setActiveIndex((i) => step(i, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          viaKey.current = true;
          setActiveIndex((i) => step(i, -1));
          break;
        case 'Home':
          e.preventDefault();
          viaKey.current = true;
          setActiveIndex(step(-1, 1));
          break;
        case 'End':
          e.preventDefault();
          viaKey.current = true;
          setActiveIndex(step(flatSelectable.length, -1));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          selectIndex(activeIndex);
          break;
        case 'Escape':
          e.preventDefault();
          closeDropdown(false);
          break;
        default: {
          // Single-character typeahead (skipped while typing in the search box).
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            typeahead(e.key);
          }
        }
      }
    },
    [open, activeIndex, flatSelectable, step, typeahead, selectIndex, openDropdown, closeDropdown],
  );

  // Render grouped: preserve option order, insert group headers.
  const renderList = () => {
    const items: React.ReactNode[] = [];
    let lastGroup: string | null = null;
    flatSelectable.forEach((opt, i) => {
      if (opt.group && opt.group !== lastGroup) {
        lastGroup = opt.group;
        items.push(
          <div
            key={`grp-${opt.group}`}
            style={{
              padding: 'var(--spacer-8) var(--spacer-12) var(--spacer-4)',
              fontSize: 'var(--body-xs-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'default',
              userSelect: 'none',
            }}
          >
            {opt.group}
          </div>,
        );
      }
      const isActive = i === activeIndex && !opt.disabled;
      const isSelected = opt.value === value;
      const isDisabled = !!opt.disabled;
      items.push(
        <div
          key={opt.value}
          data-idx={i}
          id={`${listboxId}-option-${i}`}
          role="option"
          aria-selected={isSelected}
          aria-disabled={isDisabled || undefined}
          onClick={() => {
            if (isDisabled) return;
            onChange(opt.value);
            closeDropdown(true);
          }}
          onMouseEnter={() => {
            if (isDisabled) return;
            viaKey.current = false;
            setActiveIndex(i);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--spacer-8)',
            padding: 'var(--spacer-8) var(--spacer-12)',
            borderRadius: 'var(--radius-6)',
            fontSize: 'var(--body-base-font-size)',
            lineHeight: 'var(--body-base-line-height)',
            color: isDisabled ? 'var(--text-disabled)' : isSelected ? 'var(--text-brand)' : 'var(--text-default)',
            background: isActive ? 'var(--bg-overlay-l1)' : isSelected ? 'var(--bg-brand-popup)' : 'transparent',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            opacity: isDisabled ? 0.55 : 1,
            transition: 'background var(--transition-fast)',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-8)',
              overflow: 'hidden',
              flex: 1,
              minWidth: 0,
            }}
          >
            {renderOption ? renderOption(opt) : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
          </span>
          {isSelected && <Check size={14} style={{ color: 'var(--text-brand)', flexShrink: 0 }} />}
        </div>,
      );
    });
    return items;
  };

  const displayLabel = selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder;
  const maxH = maxItems * 36 + (searchable ? 40 : 0) + 16;
  const triggerHeight = size === 'sm' ? 32 : 36;

  return (
    <div
      ref={wrapRef}
      className={`ds-dropdown${className ? ` ${className}` : ''}`}
      style={{ position: 'relative', width: '100%', ...style }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            closeDropdown(true);
          } else {
            openDropdown(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        style={{
          width: '100%',
          height: triggerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacer-8)',
          padding: '0 var(--spacer-12)',
          borderRadius: 'var(--radius-8)',
          border: '1px solid var(--border-neutral-l1)',
          background: 'var(--bg-base-default)',
          color: selected ? 'var(--text-default)' : 'var(--text-tertiary)',
          fontSize: 'var(--body-base-font-size)',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          // 打开时用 1px inset 描边（与 interior tabs/sortable-table 同手法），
          // 不占用 outline，保留全局 ：focus-visible 键盘焦点环。
          boxShadow: open ? 'inset 0 0 0 1px var(--bg-brand)' : 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
          }}
        >
          {renderTriggerLeading ? renderTriggerLeading(selected) : null}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown
          className="ds-dropdown__chevron"
          size={16}
          style={{
            color: 'var(--icon-secondary)',
            flexShrink: 0,
            transition: 'transform var(--transition-normal)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Popup via portal (avoids parent scrollbar issues) */}
      {renderPopup &&
        popupRect &&
        createPortal(
          <div
            className="ds-dropdown__popup"
            data-open={open}
            data-motion={motionEnabled}
            ref={popupRef}
            role="listbox"
            id={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
            onTransitionEnd={(event) => {
              if (event.target !== event.currentTarget || event.propertyName !== 'opacity' || open) return;
              setRenderPopup(false);
              setPopupRect(null);
            }}
            style={{
              position: 'fixed',
              top: popupRect.top,
              left: popupRect.left,
              width: popupRect.width,
              zIndex: 99999,
              maxHeight: maxH,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--radius-8)',
              border: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-base-default)',
              boxShadow: 'var(--shadow-floating)',
              overflow: 'hidden',
            }}
          >
            {/* Search */}
            {searchable && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-6)',
                  padding: 'var(--spacer-8) var(--spacer-12)',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  flexShrink: 0,
                }}
              >
                <Search size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--text-default)',
                    fontSize: 'var(--body-base-font-size)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {/* Options (scrollable) */}
            <div
              ref={listRef}
              className="ds-scroll"
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: 'var(--spacer-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-2)',
                flex: 1,
                minHeight: 0,
              }}
            >
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--spacer-16) var(--spacer-12)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--body-sm-font-size)',
                  }}
                >
                  无匹配结果
                </div>
              ) : (
                renderList()
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

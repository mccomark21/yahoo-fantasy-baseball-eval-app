import { type KeyboardEvent, type RefObject, useRef } from 'react';
import type { ViewMode } from '@/lib/view-orchestration';

const TABS: { value: ViewMode; label: string }[] = [
  { value: 'hitters',   label: 'Hitters'      },
  { value: 'pitchers',  label: 'SP Rankings'  },
  { value: 'relievers', label: 'RP Rankings'  },
  { value: 'injured',   label: 'Injured'      },
  { value: 'prospects', label: 'Prospects'    },
];

interface NavTabsProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  contentRef?: RefObject<HTMLElement | null>;
}

export function NavTabs({ value, onChange, contentRef }: NavTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function switchTo(mode: ViewMode, focusContent = true) {
    onChange(mode);
    if (focusContent) {
      requestAnimationFrame(() => contentRef?.current?.focus());
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (idx + 1) % TABS.length;
      tabRefs.current[next]?.focus();
      switchTo(TABS[next].value, false);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (idx - 1 + TABS.length) % TABS.length;
      tabRefs.current[prev]?.focus();
      switchTo(TABS[prev].value, false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      switchTo(TABS[idx].value, true);
    }
  }

  return (
    <nav aria-label="View navigation" className="self-start">
      <div role="tablist" className="flex flex-row items-center">
        {TABS.map((tab, idx) => {
          const isActive = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(el) => { tabRefs.current[idx] = el; }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (tab.value !== value) switchTo(tab.value);
              }}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={[
                'h-9 px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-sm',
                isActive
                  ? 'text-white border-b-2 border-mlb-red'
                  : 'text-white/70 hover:bg-white/10 hover:text-white/90',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

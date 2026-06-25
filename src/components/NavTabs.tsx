import { type KeyboardEvent, type RefObject, useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown, Check } from 'lucide-react';
import type { ViewMode } from '@/lib/view-orchestration';
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-model';

interface NavTabsProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  contentRef?: RefObject<HTMLElement | null>;
}

const triggerClass = (isActive: boolean) =>
  [
    'inline-flex items-center gap-1 h-11 md:h-9 px-3.5 text-sm font-semibold whitespace-nowrap',
    'transition-colors duration-100 flex-shrink-0 rounded-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
    isActive
      ? 'text-white border-b-2 border-mlb-red'
      : 'text-white/70 hover:bg-white/10 hover:text-white/90',
  ].join(' ');

/**
 * Navigation consolidated into three primary groups (Hitters / Pitchers /
 * Prospects) inside the navy identity band. Single-view groups act as plain
 * tabs; multi-view groups open a dropdown of their sub-views. The active group
 * carries the MLB-red underline. New views plug into NAV_GROUPS and a group
 * gains its dropdown automatically — no flat-strip overflow on mobile.
 */
export function NavTabs({ value, onChange, contentRef }: NavTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectView(next: ViewMode) {
    if (next !== value) onChange(next);
    requestAnimationFrame(() => contentRef?.current?.focus());
  }

  // Roving focus across the top-level groups. Selection (or opening a group's
  // menu) is handled per item: native button activation for single-view groups,
  // Base UI's menu keyboard handling for multi-view groups.
  function handleTopKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const len = NAV_GROUPS.length;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % len;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + len) % len;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = len - 1;
    if (next !== null) {
      e.preventDefault();
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <nav aria-label="Player category" className="w-full">
      <div className="flex flex-row items-center overflow-x-auto scrollbar-hide">
        {NAV_GROUPS.map((group, idx) => {
          const isActive = group.views.some((v) => v.value === value);

          // Single-view group → plain tab button.
          if (group.views.length <= 1) {
            return (
              <button
                key={group.id}
                ref={(el) => { tabRefs.current[idx] = el; }}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectView(group.views[0].value)}
                onKeyDown={(e) => handleTopKeyDown(e, idx)}
                className={triggerClass(isActive)}
              >
                {group.label}
              </button>
            );
          }

          // Multi-view group → dropdown of sub-views.
          return (
            <GroupMenu
              key={group.id}
              group={group}
              value={value}
              isActive={isActive}
              tabIndex={isActive ? 0 : -1}
              triggerRef={(el) => { tabRefs.current[idx] = el; }}
              onKeyDown={(e) => handleTopKeyDown(e, idx)}
              onSelect={selectView}
            />
          );
        })}
      </div>
    </nav>
  );
}

interface GroupMenuProps {
  group: NavGroup;
  value: ViewMode;
  isActive: boolean;
  tabIndex: number;
  triggerRef: (el: HTMLButtonElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (next: ViewMode) => void;
}

function GroupMenu({ group, value, isActive, tabIndex, triggerRef, onKeyDown, onSelect }: GroupMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        aria-current={isActive ? 'page' : undefined}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        className={`group/nav-trigger ${triggerClass(isActive)}`}
      >
        {group.label}
        <ChevronDown
          className="size-3.5 opacity-70 transition-transform duration-150 motion-reduce:transition-none group-data-[popup-open]/nav-trigger:rotate-180"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={8} className="isolate z-50">
          <Menu.Popup
            className={[
              'min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1',
              'text-popover-foreground shadow-float ring-1 ring-foreground/5 outline-none duration-100',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
              'data-[side=bottom]:slide-in-from-top-1 motion-reduce:animate-none',
            ].join(' ')}
          >
            <Menu.RadioGroup
              value={value}
              onValueChange={(next) => onSelect(next as ViewMode)}
            >
              {group.views.map((view) => (
                <Menu.RadioItem
                  key={view.value}
                  value={view.value}
                  className={[
                    'relative flex min-h-11 md:min-h-9 cursor-default select-none items-center gap-2',
                    'rounded-sm py-2 pl-2.5 pr-8 text-sm outline-none',
                    'text-foreground data-checked:font-medium data-checked:text-navy-mid',
                    'hover:bg-surface focus:bg-surface data-highlighted:bg-surface',
                  ].join(' ')}
                >
                  {view.label}
                  <Menu.RadioItemIndicator className="absolute right-2 flex size-4 items-center justify-center text-navy-mid">
                    <Check className="size-4" aria-hidden="true" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

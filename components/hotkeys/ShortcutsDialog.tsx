'use client';

import { Fragment, useMemo } from 'react';
import { Dialog, Kbd } from '@/components/ui';
import { formatChordString } from '@/lib/hotkeys/match';
import { resolveBindings } from '@/lib/hotkeys/registry';
import type { Binding, Platform, ResolvedBinding } from '@/lib/hotkeys/types';
import styles from './shortcuts.module.css';

/**
 * The `?` overlay, generated from the registry against the scope stack that is live right now.
 *
 * Two properties follow from generating it rather than writing it. It cannot go stale — the
 * dialog this replaces claimed to document the workspace while listing ⌘K and Escape and nothing
 * else. And it is window-dependent for free: on the agenda it lists the agenda's keys, and while a
 * confirmation dialog is up it lists almost nothing, which is the honest answer, because a modal
 * scope has stopped everything underneath from firing.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  stack,
  platform,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stack: string[];
  platform: Platform;
}) {
  const sections = useMemo(() => groupForDisplay(resolveBindings(stack)), [stack]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="What these keys do on the screen you are looking at."
      size="md"
    >
      {sections.length === 0 ? (
        <p className={styles.empty}>No shortcuts are active here.</p>
      ) : (
        sections.map((section) => (
          <section className={styles.scope} key={section.scopeId}>
            <h3 className={styles.scopeTitle}>{section.scopeTitle}</h3>
            {section.groups.map((group) => (
              <div className={styles.group} key={group.name}>
                <h4 className={styles.groupTitle}>{group.name}</h4>
                <dl className={styles.rows}>
                  {group.bindings.map((binding) => (
                    <div className={styles.row} key={binding.id}>
                      <dt className={styles.label}>{binding.label}</dt>
                      <dd className={styles.keys}>
                        <Caps binding={binding} platform={platform} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        ))
      )}
      <p className={styles.footnote}>
        Shortcuts stand down while you are typing in a field, so <Kbd>A</Kbd> in a search box
        searches rather than accepting anything.
      </p>
    </Dialog>
  );
}

/**
 * Key caps for one binding. `display` wins where a literal rendering would be noise — nine rows
 * for a 1–9 score range, or two rows for one action with a synonym key. Connector words in a
 * display list ("then", "or") are drawn as plain text so they do not read as keys.
 */
function Caps({ binding, platform }: { binding: Binding; platform: Platform }) {
  const caps = binding.display ?? formatChordString(binding.chords[0] ?? '', platform);
  return (
    <>
      {caps.map((cap, index) => (
        <Fragment key={`${cap}-${index}`}>
          {CONNECTORS.has(cap) ? (
            <span className={styles.connector}>{cap}</span>
          ) : (
            <Kbd>{cap}</Kbd>
          )}
        </Fragment>
      ))}
    </>
  );
}

const CONNECTORS = new Set(['then', 'or', '–']);

interface DisplaySection {
  scopeId: string;
  scopeTitle: string;
  groups: Array<{ name: string; bindings: Binding[] }>;
}

/**
 * Scope order is preserved from resolution (innermost first), so the screen you are on is at the
 * top and the always-available keys sink to the bottom.
 */
function groupForDisplay(resolved: ResolvedBinding[]): DisplaySection[] {
  const sections: DisplaySection[] = [];

  for (const { scope, binding } of resolved) {
    if (binding.hidden) continue;
    let section = sections.find((entry) => entry.scopeId === scope.id);
    if (!section) {
      section = { scopeId: scope.id, scopeTitle: scope.title, groups: [] };
      sections.push(section);
    }
    let group = section.groups.find((entry) => entry.name === binding.group);
    if (!group) {
      group = { name: binding.group, bindings: [] };
      section.groups.push(group);
    }
    group.bindings.push(binding);
  }

  return sections.filter((section) => section.groups.length > 0);
}

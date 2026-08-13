import Link from 'next/link';
import { LayoutGrid, List } from 'lucide-react';
import { publicStyles as styles } from '../PublicChrome';
import { speakerViewHref, type SpeakerView } from './view';

type Search = Record<string, string | string[] | undefined>;

const VIEWS: Array<{
  id: SpeakerView;
  label: string;
  icon: typeof List;
}> = [
  { id: 'list', label: 'Roll', icon: List },
  { id: 'gallery', label: 'Portraits', icon: LayoutGrid },
];

export function SpeakerViewToggle({
  slug,
  active,
  search,
}: {
  slug: string;
  active: SpeakerView;
  search: Search;
}) {
  return (
    <nav className={styles.viewToggle} aria-label="Orator view">
      {VIEWS.map((view) => {
        const Icon = view.icon;
        return (
          <Link
            key={view.id}
            href={speakerViewHref(slug, view.id, search)}
            className={styles.viewToggleLink}
            data-active={view.id === active}
            aria-current={view.id === active ? 'page' : undefined}
            scroll={false}
          >
            <Icon size={15} aria-hidden />
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}

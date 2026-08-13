export type SpeakerView = 'list' | 'gallery';

type Search = Record<string, string | string[] | undefined>;

export function speakerViewFromSearch(search: Search): SpeakerView {
  const value = search.view;
  const selected = Array.isArray(value) ? value.at(-1) : value;
  return selected === 'gallery' ? 'gallery' : 'list';
}

export function speakerViewHref(slug: string, view: SpeakerView, search: Search = {}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (key === 'view' || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  if (view === 'gallery') params.set('view', 'gallery');

  const query = params.toString();
  return `/${slug}/speakers${query ? `?${query}` : ''}`;
}

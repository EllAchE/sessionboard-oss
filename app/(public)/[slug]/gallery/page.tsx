import { redirect } from 'next/navigation';
import { speakerViewHref } from '../speakers/view';

export const dynamic = 'force-dynamic';

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

export default async function PublicGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  redirect(speakerViewHref(slug, 'gallery', search));
}

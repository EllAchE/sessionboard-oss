import { notFound, redirect } from 'next/navigation';

export default function RomanHeadshotsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  redirect('/first-settlement/speakers?view=gallery');
}

import { NextResponse } from 'next/server';
import { REPORTS, buildReport, type ReportId } from '@/lib/services/dashboard';
import { currentEventContext } from '@/lib/services/events';
import { httpStatus, toPublicError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/** `B-8`. A CSV attachment rather than a rendered table: reports leave the product. */
export async function GET(_request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const known = REPORTS.find((entry) => entry.id === report);
  if (!known) return NextResponse.json({ error: 'Unknown report' }, { status: 404 });

  try {
    const ctx = await currentEventContext();
    const csv = await buildReport(ctx, known.id as ReportId);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${known.id}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(toPublicError(error), { status: httpStatus(error) });
  }
}

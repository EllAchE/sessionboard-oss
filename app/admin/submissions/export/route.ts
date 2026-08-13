import { NextResponse } from 'next/server';
import { httpStatus, invalid, toPublicError } from '../../../../lib/errors';
import { buildReviewResultsExport } from '../../../../lib/services/review';
import { decideContext } from '../context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const roundId = new URL(request.url).searchParams.get('round');
    if (!roundId) throw invalid('Choose a council round to export');
    const ctx = await decideContext();
    const result = await buildReviewResultsExport(ctx, roundId);
    return new Response(result.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${result.filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(toPublicError(error), { status: httpStatus(error) });
  }
}

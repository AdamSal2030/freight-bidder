import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = 500;
  const offset = (page - 1) * pageSize;

  const db = createServerClient();
  let query = db
    .from('loads')
    .select('*', { count: 'exact' })
    .order('scraped_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, page, pageSize });
}

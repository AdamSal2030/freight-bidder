import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const db = createServerClient();
  let query = db
    .from('loads')
    .select('*')
    .order('scraped_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

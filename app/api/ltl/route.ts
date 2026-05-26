import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// POST /api/ltl — save LTL quote request; daemon picks it up and fills WWEX rate
export async function POST(req: Request) {
  const body = await req.json();
  const { origin, destination, weight_lbs, freight_class, markup_pct = 25, notes = '' } = body;

  const db = createServerClient();
  const { data, error } = await db
    .from('ltl_quotes')
    .insert({
      origin,
      destination,
      weight_lbs,
      freight_class,
      markup_pct,
      notes,
      status: 'pending',        // daemon sets this to 'completed' once it fetches WWEX rate
      wwex_rate: null,
      customer_rate: null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// GET /api/ltl — list quotes
export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from('ltl_quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/ltl — update markup or customer_rate
export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, markup_pct, customer_rate, notes } = body;

  const db = createServerClient();
  const updates: Record<string, unknown> = {};
  if (markup_pct !== undefined) {
    updates.markup_pct = markup_pct;
    // Recalculate customer rate if we have wwex_rate
    const { data: existing } = await db.from('ltl_quotes').select('wwex_rate').eq('id', id).single();
    if (existing?.wwex_rate) {
      updates.customer_rate = Math.ceil(existing.wwex_rate * (1 + markup_pct / 100));
    }
  }
  if (customer_rate !== undefined) updates.customer_rate = customer_rate;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await db.from('ltl_quotes').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

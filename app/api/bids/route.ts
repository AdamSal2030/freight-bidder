import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { estimateCarrierRate, getMarginPct, calculateBid } from '@/lib/claude';
import type { Load } from '@/lib/types';

// GET /api/bids — list bids with joined load data
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const db = createServerClient();
  let query = db
    .from('bids')
    .select('*, load:loads(*)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/bids — create AI estimate + bid record for a load
export async function POST(req: Request) {
  const body = await req.json();
  const { load_id } = body as { load_id: string };

  const db = createServerClient();

  // Fetch load details
  const { data: load, error: loadErr } = await db
    .from('loads')
    .select('*')
    .eq('load_id', load_id)
    .single();

  if (loadErr || !load) {
    return NextResponse.json({ error: 'Load not found' }, { status: 404 });
  }

  const l = load as Load;

  // Check if we already have a bid in a non-terminal state
  const { data: existing } = await db
    .from('bids')
    .select('id, status')
    .eq('load_id', load_id)
    .not('status', 'in', '("skipped","error")')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Bid already exists', bid_id: existing.id }, { status: 409 });
  }

  // Mark load as estimating
  await db.from('loads').update({ status: 'estimating' }).eq('load_id', load_id);

  try {
    const estimate = await estimateCarrierRate(l);

    if (!estimate.carrier_rate || estimate.carrier_rate <= 0 || !estimate.distance_miles) {
      await db.from('loads').update({ status: 'new' }).eq('load_id', load_id);
      return NextResponse.json(
        { error: 'AI returned an invalid rate ($0). Load data may be incomplete — try again.' },
        { status: 422 }
      );
    }

    const marginPct = await getMarginPct(estimate.distance_miles);
    const suggestedBid = calculateBid(estimate.carrier_rate, marginPct);

    const { data: bid, error: bidErr } = await db
      .from('bids')
      .insert({
        load_id,
        distance_miles: estimate.distance_miles,
        trailer_type: estimate.trailer_type,
        requires_permits: estimate.requires_permits,
        requires_pilot_cars: estimate.requires_pilot_cars,
        carrier_rate: estimate.carrier_rate,
        margin_pct: marginPct,
        suggested_bid: suggestedBid,
        final_bid: suggestedBid,
        reasoning: estimate.reasoning,
        status: 'pending_approval',
      })
      .select()
      .single();

    if (bidErr) throw new Error(bidErr.message);

    await db.from('loads').update({ status: 'pending_approval' }).eq('load_id', load_id);
    return NextResponse.json(bid, { status: 201 });
  } catch (err) {
    await db.from('loads').update({ status: 'new' }).eq('load_id', load_id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/bids — reset a bid so the load can be re-estimated
export async function DELETE(req: Request) {
  const { bid_id, load_id } = await req.json() as { bid_id: string; load_id: string };
  const db = createServerClient();

  await db.from('bids').delete().eq('id', bid_id);
  await db.from('loads').update({ status: 'new' }).eq('load_id', load_id);

  return NextResponse.json({ ok: true });
}

// PATCH /api/bids — update final_bid or status (approve/skip)
export async function PATCH(req: Request) {
  const body = await req.json();
  const { bid_id, final_bid, status } = body as {
    bid_id: string;
    final_bid?: number;
    status?: string;
  };

  const db = createServerClient();
  const updates: Record<string, unknown> = {};
  if (final_bid !== undefined) updates.final_bid = final_bid;
  if (status) updates.status = status;

  const { data, error } = await db
    .from('bids')
    .update(updates)
    .eq('id', bid_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync load status
  if (status === 'approved') {
    await db.from('loads').update({ status: 'approved' }).eq('load_id', data.load_id);
  } else if (status === 'skipped') {
    await db.from('loads').update({ status: 'skipped' }).eq('load_id', data.load_id);
  }

  return NextResponse.json(data);
}

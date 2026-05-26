'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Package, Clock, CheckCircle } from 'lucide-react';
import type { LtlQuote } from '@/lib/types';

const FREIGHT_CLASSES = [
  '50', '55', '60', '65', '70', '77.5', '85', '92.5',
  '100', '110', '125', '150', '175', '200', '250', '300', '400', '500',
];

const DEFAULT_MARKUP = 25;

export default function LtlPage() {
  const [quotes, setQuotes] = useState<LtlQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    weight_lbs: '',
    freight_class: '70',
    markup_pct: String(DEFAULT_MARKUP),
    notes: '',
  });

  async function fetchQuotes() {
    setLoading(true);
    const res = await fetch('/api/ltl').then(r => r.json());
    setQuotes(Array.isArray(res) ? res : []);
    setLoading(false);
  }

  useEffect(() => { fetchQuotes(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/ltl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          weight_lbs: Number(form.weight_lbs),
          freight_class: form.freight_class,
          markup_pct: Number(form.markup_pct),
          notes: form.notes,
        }),
      });
      if (res.ok) {
        const q = await res.json();
        setQuotes(prev => [q, ...prev]);
        setForm({ origin: '', destination: '', weight_lbs: '', freight_class: '70', markup_pct: String(DEFAULT_MARKUP), notes: '' });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMarkup(quoteId: string, markup_pct: number) {
    const res = await fetch('/api/ltl', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: quoteId, markup_pct }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuotes(prev => prev.map(q => q.id === quoteId ? updated : q));
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">LTL Quotes</h1>
          <p className="text-gray-400 mt-1 text-sm">Get WWEX rates, mark up, quote your customer</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchQuotes}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 rounded-lg text-sm font-bold transition-colors"
          >
            <Plus size={14} /> New Quote
          </button>
        </div>
      </div>

      {/* New quote form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">New LTL Quote Request</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Origin (City, ST)</label>
              <input
                value={form.origin}
                onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                placeholder="Chicago, IL"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Destination (City, ST)</label>
              <input
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="Dallas, TX"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Weight (lbs)</label>
              <input
                type="number"
                value={form.weight_lbs}
                onChange={e => setForm(f => ({ ...f, weight_lbs: e.target.value }))}
                placeholder="500"
                required
                min="1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Freight Class</label>
              <select
                value={form.freight_class}
                onChange={e => setForm(f => ({ ...f, freight_class: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 text-sm"
              >
                {FREIGHT_CLASSES.map(c => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Your Markup %</label>
              <input
                type="number"
                value={form.markup_pct}
                onChange={e => setForm(f => ({ ...f, markup_pct: e.target.value }))}
                min="1"
                max="200"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Customer name, PO, etc."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                {submitting ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : 'Request Quote'}
              </button>
            </div>
          </form>
          <p className="text-xs text-gray-500 mt-3">
            💡 The daemon will fetch the WWEX rate in the background. Refresh the page to see results.
          </p>
        </div>
      )}

      {loading && <div className="text-center py-20 text-gray-500">Loading quotes…</div>}

      {!loading && quotes.length === 0 && (
        <div className="text-center py-20">
          <Package size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No LTL quotes yet.</p>
          <p className="text-sm text-gray-600">Click "New Quote" to request a WWEX rate.</p>
        </div>
      )}

      <div className="space-y-3">
        {quotes.map(q => (
          <QuoteCard key={q.id} quote={q} onUpdateMarkup={updateMarkup} />
        ))}
      </div>
    </div>
  );
}

function QuoteCard({
  quote,
  onUpdateMarkup,
}: {
  quote: LtlQuote;
  onUpdateMarkup: (id: string, markup: number) => void;
}) {
  const [markup, setMarkup] = useState(String(quote.markup_pct ?? DEFAULT_MARKUP));
  const [saving, setSaving] = useState(false);
  const isPending = !quote.wwex_rate;

  async function handleMarkupSave() {
    setSaving(true);
    await onUpdateMarkup(quote.id, Number(markup));
    setSaving(false);
  }

  const customerRate = quote.wwex_rate
    ? Math.ceil(quote.wwex_rate * (1 + Number(markup) / 100))
    : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-white">{quote.origin} → {quote.destination}</p>
            {isPending ? (
              <span className="text-[10px] bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Clock size={9} /> Fetching WWEX rate…
              </span>
            ) : (
              <span className="text-[10px] bg-green-900 text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle size={9} /> Complete
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {quote.weight_lbs?.toLocaleString()} lbs · Class {quote.freight_class}
            {quote.notes ? ` · ${quote.notes}` : ''}
          </p>
        </div>

        {/* Rate display */}
        <div className="text-right shrink-0">
          {isPending ? (
            <p className="text-gray-500 text-sm">Waiting for daemon…</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-0.5">WWEX Rate</p>
              <p className="text-sm font-medium text-gray-300">${quote.wwex_rate?.toLocaleString()}</p>
            </>
          )}
        </div>
      </div>

      {/* Markup + customer rate */}
      {!isPending && quote.wwex_rate && (
        <div className="mt-4 pt-4 border-t border-gray-800 flex items-end gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Markup %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
                min="0"
                max="300"
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-500"
              />
              <button
                onClick={handleMarkupSave}
                disabled={saving}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors"
              >
                {saving ? '…' : 'Apply'}
              </button>
            </div>
          </div>
          <div className="flex-1 text-right">
            <p className="text-xs text-gray-400 mb-0.5">Quote Your Customer</p>
            <p className="text-2xl font-bold text-yellow-400">
              ${customerRate?.toLocaleString() ?? '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Margin: ${((customerRate ?? 0) - quote.wwex_rate).toLocaleString()}
              &nbsp;({markup}%)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_MARKUP = 25;

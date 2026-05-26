'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp,
  Truck, AlertTriangle, MapPin, Weight, Ruler, Clock
} from 'lucide-react';
import type { Load, Bid } from '@/lib/types';

type BidWithLoad = Bid & { load: Load };

interface LoadWithBid extends Load {
  bid?: Bid;
}

export default function LoadsPage() {
  const [loads, setLoads] = useState<LoadWithBid[]>([]);
  const [bids, setBids] = useState<Record<string, Bid>>({});
  const [loading, setLoading] = useState(true);
  const [estimating, setEstimating] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>('all');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all loads via pagination (500 per page)
      let allLoads: Load[] = [];
      let page = 1;
      let total = Infinity;
      while (allLoads.length < total) {
        const res = await fetch(`/api/loads?page=${page}`).then(r => r.json());
        const pageData: Load[] = res.data ?? [];
        total = res.total ?? 0;
        allLoads = [...allLoads, ...pageData];
        if (pageData.length === 0) break;
        page++;
      }

      const bidsRes = await fetch('/api/bids').then(r => r.json());
      const bidsArr: BidWithLoad[] = Array.isArray(bidsRes) ? bidsRes : [];
      const bidMap: Record<string, Bid> = {};
      bidsArr.forEach(b => { bidMap[b.load_id] = b; });
      setBids(bidMap);
      setLoads(allLoads);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredLoads = loads.filter(l => {
    if (filter === 'all') return true;
    const bid = bids[l.load_id];
    if (filter === 'no_bid') return !bid;
    if (filter === 'pending') return bid?.status === 'pending_approval';
    if (filter === 'submitted') return bid?.status === 'submitted';
    return true;
  });

  async function handleEstimate(loadId: string) {
    setEstimating(prev => new Set(prev).add(loadId));
    setErrors(prev => { const s = { ...prev }; delete s[loadId]; return s; });
    try {
      const res = await fetch('/api/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_id: loadId }),
      });
      const data = await res.json();
      if (res.ok) {
        setBids(prev => ({ ...prev, [loadId]: data }));
        setEditAmounts(prev => ({ ...prev, [data.id]: String(data.final_bid) }));
        setExpanded(prev => new Set(prev).add(loadId));
      } else {
        setErrors(prev => ({ ...prev, [loadId]: data.error ?? 'Estimation failed' }));
        setExpanded(prev => new Set(prev).add(loadId));
      }
    } finally {
      setEstimating(prev => { const s = new Set(prev); s.delete(loadId); return s; });
    }
  }

  async function handleApproveBid(bid: Bid, loadId: string) {
    const finalBid = Number(editAmounts[bid.id] ?? bid.final_bid);
    // First update the amount if changed
    const res = await fetch('/api/bids', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_id: bid.id, final_bid: finalBid, status: 'approved' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setBids(prev => ({ ...prev, [loadId]: updated }));
    }
  }

  async function handleSkip(bid: Bid, loadId: string) {
    const res = await fetch('/api/bids', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_id: bid.id, status: 'skipped' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setBids(prev => ({ ...prev, [loadId]: updated }));
    }
  }

  async function handleRetry(bid: Bid, loadId: string) {
    // Delete bad bid, reset load to 'new', then re-estimate
    await fetch('/api/bids', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_id: bid.id, load_id: loadId }),
    });
    setBids(prev => { const s = { ...prev }; delete s[loadId]; return s; });
    await handleEstimate(loadId);
  }

  function toggleExpand(loadId: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(loadId) ? s.delete(loadId) : s.add(loadId);
      return s;
    });
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Veritread Loads</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {loads.length} loads scraped · {Object.values(bids).filter(b => b.status === 'pending_approval').length} pending your approval
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'all', label: 'All Loads' },
          { key: 'no_bid', label: 'Needs Estimate' },
          { key: 'pending', label: 'Pending Approval' },
          { key: 'submitted', label: 'Submitted' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-yellow-400 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-500">Loading loads…</div>
      )}

      {!loading && filteredLoads.length === 0 && (
        <div className="text-center py-20">
          <Truck size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400">No loads found. Run the daemon to scrape Veritread.</p>
          <code className="text-xs text-gray-600 mt-2 block">cd ~/veritread_bidder && python3 daemon/main.py --scrape-only</code>
        </div>
      )}

      <div className="space-y-3">
        {filteredLoads.map(load => {
          const bid = bids[load.load_id];
          const isExpanded = expanded.has(load.load_id);
          const isEstimating = estimating.has(load.load_id);
          const editVal = bid ? (editAmounts[bid.id] ?? String(bid.final_bid)) : '';
          const estimateError = errors[load.load_id];
          const isBadBid = bid && (!bid.carrier_rate || bid.carrier_rate <= 0);

          return (
            <div key={load.load_id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Card header */}
              <div
                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => toggleExpand(load.load_id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white truncate">{load.equipment_name}</p>
                    <span className="text-xs text-gray-500 shrink-0">#{load.load_number}</span>
                    {bid && <BidStatusBadge status={bid.status} />}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {load.origin} → {load.destination}
                    </span>
                    {load.time_remaining && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {load.time_remaining}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bid amount or action */}
                <div className="flex items-center gap-3 shrink-0">
                  {bid ? (
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">${bid.final_bid?.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">carrier: ${bid.carrier_rate?.toLocaleString()}</p>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); handleEstimate(load.load_id); }}
                      disabled={isEstimating}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {isEstimating ? (
                        <><RefreshCw size={13} className="animate-spin" /> Estimating…</>
                      ) : (
                        '🤖 Get Rate'
                      )}
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-800 p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <DetailItem icon={<Ruler size={13} />} label="Length" value={load.length || '—'} />
                    <DetailItem icon={<Ruler size={13} />} label="Width" value={load.width || '—'} />
                    <DetailItem icon={<Ruler size={13} />} label="Height" value={load.height || '—'} />
                    <DetailItem icon={<Weight size={13} />} label="Weight" value={load.weight || '—'} />
                  </div>

                  {bid && (
                    <>
                      {/* Rate breakdown */}
                      <div className="bg-gray-800/60 rounded-xl p-4 mb-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">AI Rate Analysis</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <RateItem label="Distance" value={`~${bid.distance_miles?.toLocaleString()} mi`} />
                          <RateItem label="Trailer" value={bid.trailer_type} />
                          <RateItem label="Carrier Cost" value={`$${bid.carrier_rate?.toLocaleString()}`} />
                          <RateItem label="Margin" value={`${bid.margin_pct}%`} />
                        </div>
                        {(bid.requires_permits || bid.requires_pilot_cars) && (
                          <div className="flex gap-2 mb-2">
                            {bid.requires_permits && (
                              <span className="text-xs bg-orange-900/50 text-orange-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle size={10} /> Permits required
                              </span>
                            )}
                            {bid.requires_pilot_cars && (
                              <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle size={10} /> Pilot cars needed
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 italic">{bid.reasoning}</p>
                      </div>

                      {/* Bid controls */}
                      {bid.status === 'pending_approval' && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-400 mb-1 block">Your Bid Amount ($)</label>
                            <input
                              type="number"
                              value={editVal}
                              onChange={e => setEditAmounts(prev => ({ ...prev, [bid.id]: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-lg font-bold focus:outline-none focus:border-yellow-500"
                              step="50"
                            />
                          </div>
                          <div className="flex gap-2 pt-5">
                            <button
                              onClick={() => handleSkip(bid, load.load_id)}
                              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                              <XCircle size={15} /> Skip
                            </button>
                            <button
                              onClick={() => handleApproveBid(bid, load.load_id)}
                              className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                            >
                              <CheckCircle size={15} /> Approve & Bid
                            </button>
                          </div>
                        </div>
                      )}

                      {bid.status === 'approved' && (
                        <div className="flex items-center gap-2 text-blue-300 text-sm">
                          <CheckCircle size={16} /> Approved — daemon will submit ${bid.final_bid?.toLocaleString()} on next run
                        </div>
                      )}

                      {bid.status === 'submitted' && (
                        <div className="flex items-center gap-2 text-green-300 text-sm">
                          <CheckCircle size={16} /> Bid of ${bid.final_bid?.toLocaleString()} submitted to Veritread
                        </div>
                      )}

                      {bid.status === 'skipped' && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <XCircle size={16} /> Skipped
                        </div>
                      )}

                      {bid.status === 'error' && (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-2 text-red-400 text-sm">
                            <AlertTriangle size={15} /> Bid submission failed
                          </span>
                          <button
                            onClick={() => handleRetry(bid, load.load_id)}
                            disabled={isEstimating}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                          >
                            <RefreshCw size={11} className={isEstimating ? 'animate-spin' : ''} />
                            Re-estimate & Retry
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Error state with retry */}
                  {estimateError && (
                    <div className="flex items-start gap-3 bg-red-900/30 border border-red-800 rounded-xl p-4">
                      <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-red-300 mb-2">{estimateError}</p>
                        <button
                          onClick={() => handleEstimate(load.load_id)}
                          disabled={isEstimating}
                          className="px-4 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw size={12} className={isEstimating ? 'animate-spin' : ''} />
                          {isEstimating ? 'Retrying…' : 'Retry Estimate'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bad bid (carrier_rate = 0) with retry */}
                  {isBadBid && (
                    <div className="flex items-start gap-3 bg-orange-900/30 border border-orange-800 rounded-xl p-4">
                      <AlertTriangle size={16} className="text-orange-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-orange-300 mb-2">AI returned a $0 rate — load data may be incomplete. Click retry to try again.</p>
                        <button
                          onClick={() => handleRetry(bid, load.load_id)}
                          disabled={isEstimating}
                          className="px-4 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw size={12} className={isEstimating ? 'animate-spin' : ''} />
                          {isEstimating ? 'Retrying…' : 'Retry Estimate'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!bid && !estimateError && (
                    <button
                      onClick={() => handleEstimate(load.load_id)}
                      disabled={isEstimating}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                    >
                      {isEstimating
                        ? <><RefreshCw size={14} className="animate-spin" /> Estimating carrier rate…</>
                        : '🤖 Research Rate & Suggest Bid'
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BidStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_approval: 'bg-yellow-900 text-yellow-300',
    approved: 'bg-blue-900 text-blue-300',
    submitted: 'bg-green-900 text-green-300',
    error: 'bg-red-900 text-red-300',
    skipped: 'bg-gray-800 text-gray-500',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">{icon} {label}</div>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function RateItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, Truck, DollarSign, AlertCircle, ArrowRight } from 'lucide-react';
import type { Bid, LtlQuote } from '@/lib/types';

interface Stats {
  totalLoads: number;
  pendingApproval: number;
  submittedToday: number;
  totalBidValue: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalLoads: 0,
    pendingApproval: 0,
    submittedToday: 0,
    totalBidValue: 0,
  });
  const [recentBids, setRecentBids] = useState<Bid[]>([]);
  const [recentLtl, setRecentLtl] = useState<LtlQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [bidsRes, ltlRes, loadsRes] = await Promise.all([
          fetch('/api/bids').then(r => r.json()),
          fetch('/api/ltl').then(r => r.json()),
          fetch('/api/loads').then(r => r.json()),
        ]);

        const bids: Bid[] = Array.isArray(bidsRes) ? bidsRes : [];
        const quotes: LtlQuote[] = Array.isArray(ltlRes) ? ltlRes : [];
        const loads = Array.isArray(loadsRes) ? loadsRes : [];

        const today = new Date().toDateString();
        const submittedToday = bids.filter(
          b => b.status === 'submitted' && new Date(b.submitted_at ?? '').toDateString() === today
        ).length;

        const totalBidValue = bids
          .filter(b => b.status === 'submitted')
          .reduce((sum, b) => sum + (b.final_bid ?? 0), 0);

        setStats({
          totalLoads: loads.length,
          pendingApproval: bids.filter(b => b.status === 'pending_approval').length,
          submittedToday,
          totalBidValue,
        });

        setRecentBids(bids.slice(0, 5));
        setRecentLtl(quotes.slice(0, 5));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">AI-powered bidding for Veritread · LTL quoting via WWEX</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Truck size={20} className="text-blue-400" />}
          label="Total Loads"
          value={loading ? '…' : stats.totalLoads.toString()}
          bg="bg-blue-950/40"
          border="border-blue-800/40"
        />
        <StatCard
          icon={<Clock size={20} className="text-yellow-400" />}
          label="Pending Approval"
          value={loading ? '…' : stats.pendingApproval.toString()}
          bg="bg-yellow-950/40"
          border="border-yellow-800/40"
          href="/loads?status=pending_approval"
        />
        <StatCard
          icon={<CheckCircle size={20} className="text-green-400" />}
          label="Submitted Today"
          value={loading ? '…' : stats.submittedToday.toString()}
          bg="bg-green-950/40"
          border="border-green-800/40"
        />
        <StatCard
          icon={<DollarSign size={20} className="text-purple-400" />}
          label="Total Bid Value"
          value={loading ? '…' : `$${(stats.totalBidValue / 1000).toFixed(1)}k`}
          bg="bg-purple-950/40"
          border="border-purple-800/40"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Bids */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold text-white">Recent Bids</h2>
            <Link href="/loads" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {recentBids.length === 0 && (
              <p className="text-gray-500 text-sm p-5">No bids yet. Run the daemon to scrape loads.</p>
            )}
            {recentBids.map(bid => (
              <div key={bid.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white truncate max-w-[200px]">
                    {bid.load?.equipment_name ?? bid.load_id}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {bid.load?.origin} → {bid.load?.destination}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-bold text-white">${bid.final_bid?.toLocaleString()}</p>
                  <StatusBadge status={bid.status} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent LTL Quotes */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold text-white">Recent LTL Quotes</h2>
            <Link href="/ltl" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {recentLtl.length === 0 && (
              <p className="text-gray-500 text-sm p-5">No LTL quotes yet.</p>
            )}
            {recentLtl.map(q => (
              <div key={q.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{q.origin} → {q.destination}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{q.weight_lbs?.toLocaleString()} lbs · Class {q.freight_class}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-bold text-green-400">
                    {q.customer_rate ? `$${q.customer_rate.toLocaleString()}` : '—'}
                  </p>
                  <p className="text-xs text-gray-500">WWEX: ${q.wwex_rate?.toLocaleString() ?? '…'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, bg, border, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  border: string;
  href?: string;
}) {
  const content = (
    <div className={`${bg} ${border} border rounded-xl p-5 flex items-center gap-4`}>
      <div className={`${bg} rounded-lg p-2`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_approval: 'bg-yellow-900 text-yellow-300',
    approved: 'bg-blue-900 text-blue-300',
    submitted: 'bg-green-900 text-green-300',
    error: 'bg-red-900 text-red-300',
    skipped: 'bg-gray-800 text-gray-400',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-gray-800 text-gray-400'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

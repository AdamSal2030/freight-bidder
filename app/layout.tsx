import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { Truck, LayoutDashboard, PackageSearch, Package } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Freight Bidder — Hatchway',
  description: 'AI-powered Veritread bidding + WWEX LTL quoting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full z-10">
            <div className="p-5 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Truck className="text-yellow-400" size={24} />
                <div>
                  <p className="font-bold text-white text-sm">Freight Bidder</p>
                  <p className="text-xs text-gray-400">Hatchway</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              <NavItem href="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />
              <NavItem href="/loads" icon={<PackageSearch size={18} />} label="Veritread Loads" />
              <NavItem href="/ltl" icon={<Package size={18} />} label="LTL Quotes" />
            </nav>

            <div className="p-4 border-t border-gray-800">
              <p className="text-xs text-gray-500">Powered by Claude Haiku</p>
            </div>
          </aside>

          {/* Main content offset by sidebar */}
          <main className="flex-1 ml-60 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
    >
      {icon}
      {label}
    </Link>
  );
}

#!/usr/bin/env python3
"""
Freight Bidder Daemon
=====================
Runs three jobs in sequence:
  1. Scrape Veritread loads → Supabase
  2. Submit approved bids → Veritread
  3. Fetch WWEX rates for pending LTL quotes

Usage:
  python3 main.py                   # run all three jobs once
  python3 main.py --headed          # show browser windows
  python3 main.py --scrape-only     # only scrape loads (no bids)
  python3 main.py --bids-only       # only submit approved bids
  python3 main.py --wwex-only       # only fetch WWEX rates
  python3 main.py --loop 5          # repeat every 5 minutes
"""
from __future__ import annotations

import asyncio
import argparse
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Load .env from daemon directory
load_dotenv(Path(__file__).parent / ".env")

from veritread import VeritreadBot
from wwex import WwexBot


async def run_once(scrape: bool, bids: bool, wwex: bool, headed: bool):
    print(f"\n{'═'*55}")
    print(f"  Freight Bidder Daemon  —  {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*55}")

    # ── 1. Scrape Veritread ───────────────────────────────────────
    if scrape:
        print("\n[1/3] Scraping Veritread loads…")
        bot = VeritreadBot(headed=headed)
        try:
            await bot.start()
            await bot.login()
            new = await bot.scrape_loads(max_pages=3)
            print(f"  ✅ {new} new loads saved to Supabase")
        except Exception as e:
            print(f"  ❌ Scrape error: {e}")
        finally:
            await bot.close()

    # ── 2. Submit approved bids ───────────────────────────────────
    if bids:
        print("\n[2/3] Submitting approved bids…")
        bot = VeritreadBot(headed=headed)
        try:
            await bot.start()
            await bot.login()
            submitted = await bot.submit_approved_bids()
            print(f"  ✅ {submitted} bids submitted")
        except Exception as e:
            print(f"  ❌ Bid submission error: {e}")
        finally:
            await bot.close()

    # ── 3. WWEX LTL quotes ────────────────────────────────────────
    if wwex:
        print("\n[3/3] Fetching WWEX rates for pending LTL quotes…")
        bot = WwexBot(headed=headed)
        try:
            await bot.start()
            await bot.login()
            done = await bot.process_pending_quotes()
            print(f"  ✅ {done} LTL quotes priced")
        except Exception as e:
            print(f"  ❌ WWEX error: {e}")
        finally:
            await bot.close()

    print(f"\n{'═'*55}")
    print("  Done.")
    print(f"{'═'*55}\n")


def main():
    parser = argparse.ArgumentParser(description="Freight Bidder Daemon")
    parser.add_argument("--headed",      action="store_true", help="Show browser windows")
    parser.add_argument("--scrape-only", action="store_true", help="Only scrape Veritread")
    parser.add_argument("--bids-only",   action="store_true", help="Only submit approved bids")
    parser.add_argument("--wwex-only",   action="store_true", help="Only fetch WWEX rates")
    parser.add_argument("--loop",        type=int, metavar="MIN", help="Repeat every N minutes")
    args = parser.parse_args()

    # Determine which jobs to run
    explicit = args.scrape_only or args.bids_only or args.wwex_only
    scrape = args.scrape_only or not explicit
    bids   = args.bids_only   or not explicit
    wwex   = args.wwex_only   or not explicit

    # Validate env
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    if scrape or bids:
        required += ["VERITREAD_EMAIL", "VERITREAD_PASSWORD"]
    if wwex:
        required += ["WWEX_EMAIL", "WWEX_PASSWORD"]

    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"❌ Missing env vars: {', '.join(missing)}")
        print("   Edit daemon/.env and fill them in.")
        sys.exit(1)

    if args.loop:
        interval = args.loop * 60
        print(f"🔄 Loop mode: running every {args.loop} minutes. Ctrl+C to stop.\n")
        while True:
            asyncio.run(run_once(scrape, bids, wwex, args.headed))
            print(f"  Next run in {args.loop} minutes…")
            time.sleep(interval)
    else:
        asyncio.run(run_once(scrape, bids, wwex, args.headed))


if __name__ == "__main__":
    main()

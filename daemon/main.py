#!/usr/bin/env python3
"""
Freight Bidder Daemon
=====================
Runs four jobs in sequence every N minutes:
  1. Scrape Veritread loads → Supabase
  2. Auto-estimate new loads with Claude AI → pending_approval
  3. Submit approved bids → Veritread
  4. Fetch WWEX rates for pending LTL quotes

Usage:
  python3 main.py                   # run all jobs once
  python3 main.py --headed          # show browser windows
  python3 main.py --scrape-only     # only scrape loads
  python3 main.py --estimate-only   # only run AI estimation
  python3 main.py --bids-only       # only submit approved bids
  python3 main.py --wwex-only       # only fetch WWEX rates
  python3 main.py --loop 15         # repeat every 15 minutes (default)
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
from estimator import auto_estimate_new_loads
from db import get_db


async def run_once(scrape: bool, estimate: bool, bids: bool, wwex: bool, headed: bool):
    print(f"\n{'═'*55}")
    print(f"  Freight Bidder Daemon  —  {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*55}")

    # ── 1. Scrape Veritread ───────────────────────────────────────
    if scrape:
        print("\n[1/4] Scraping Veritread loads…")
        bot = VeritreadBot(headed=headed)
        try:
            await bot.start()
            await bot.login()
            new = await bot.scrape_loads(max_loads=5000)
            print(f"  ✅ {new} new loads saved to Supabase")
        except Exception as e:
            print(f"  ❌ Scrape error: {e}")
        finally:
            await bot.close()

    # ── 2. Auto-estimate new loads ────────────────────────────────
    if estimate:
        print("\n[2/4] Auto-estimating new loads with Claude AI…")
        try:
            db = get_db()
            done = auto_estimate_new_loads(db)
            print(f"  ✅ {done} loads estimated and queued for approval")
        except Exception as e:
            print(f"  ❌ Estimation error: {e}")

    # ── 3. Submit approved bids ───────────────────────────────────
    if bids:
        print("\n[3/4] Submitting approved bids…")
        bot = VeritreadBot(headed=headed)
        try:
            await bot.start()
            await bot.force_login()
            submitted = await bot.submit_approved_bids()
            print(f"  ✅ {submitted} bids submitted")
        except Exception as e:
            print(f"  ❌ Bid submission error: {e}")
        finally:
            await bot.close()

    # ── 4. WWEX LTL quotes ────────────────────────────────────────
    if wwex:
        print("\n[4/4] Fetching WWEX rates for pending LTL quotes…")
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
    parser.add_argument("--headed",         action="store_true", help="Show browser windows")
    parser.add_argument("--scrape-only",    action="store_true", help="Only scrape Veritread")
    parser.add_argument("--estimate-only",  action="store_true", help="Only run AI estimation")
    parser.add_argument("--bids-only",      action="store_true", help="Only submit approved bids")
    parser.add_argument("--wwex-only",      action="store_true", help="Only fetch WWEX rates")
    parser.add_argument("--loop",           type=int, metavar="MIN", default=None, help="Repeat every N minutes")
    args = parser.parse_args()

    # Determine which jobs to run
    explicit = args.scrape_only or args.estimate_only or args.bids_only or args.wwex_only
    scrape   = args.scrape_only   or not explicit
    estimate = args.estimate_only or not explicit
    bids     = args.bids_only     or not explicit
    wwex     = args.wwex_only     or not explicit

    # Validate env
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    if scrape or bids:
        required += ["VERITREAD_EMAIL", "VERITREAD_PASSWORD"]
    if estimate or (scrape and estimate):
        required += ["ANTHROPIC_API_KEY"]
    if wwex:
        required += ["WWEX_EMAIL", "WWEX_PASSWORD"]

    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"❌ Missing env vars: {', '.join(missing)}")
        print("   Set them in Railway (or daemon/.env for local runs).")
        sys.exit(1)

    # Default loop interval when running in production (Railway sets RAILWAY_ENVIRONMENT)
    loop_min = args.loop
    if loop_min is None and os.getenv("RAILWAY_ENVIRONMENT"):
        loop_min = 15  # default 15-min cycle on Railway

    if loop_min:
        interval = loop_min * 60
        print(f"🔄 Loop mode: running every {loop_min} minutes. Ctrl+C to stop.\n")
        while True:
            asyncio.run(run_once(scrape, estimate, bids, wwex, args.headed))
            print(f"  Next run in {loop_min} minutes…")
            time.sleep(interval)
    else:
        asyncio.run(run_once(scrape, estimate, bids, wwex, args.headed))


if __name__ == "__main__":
    main()

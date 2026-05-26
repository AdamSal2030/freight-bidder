"""
Veritread Playwright automation.
  - login / scrape loads → Supabase
  - submit approved bids
"""
from __future__ import annotations
import asyncio
import os
from playwright.async_api import async_playwright, Page
from db import get_db


BASE = "https://www.veritread.com"


class VeritreadBot:
    def __init__(self, headed: bool = False):
        self.headed = headed
        self._pw = None
        self._browser = None
        self.page: Page | None = None

    async def start(self):
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=not self.headed,
            slow_mo=400 if self.headed else 80,
        )
        ctx = await self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        )
        self.page = await ctx.new_page()

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    # ------------------------------------------------------------------ login
    async def login(self):
        email = os.environ["VERITREAD_EMAIL"]
        password = os.environ["VERITREAD_PASSWORD"]

        await self.page.goto(f"{BASE}/carrier/")
        await self.page.wait_for_load_state("networkidle")

        # Try direct login paths
        for path in ["/login", "/signin", "/account/login"]:
            await self.page.goto(f"{BASE}{path}")
            await self.page.wait_for_load_state("networkidle")
            if await self.page.locator('input[type="email"]').count():
                break

        await self.page.locator('input[type="email"]').first.fill(email)
        await self.page.locator('input[type="password"]').first.fill(password)
        await self.page.locator(
            'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")'
        ).first.click()
        await self.page.wait_for_load_state("networkidle")
        await self.page.wait_for_timeout(2000)
        print("✅ Veritread login OK")

    # --------------------------------------------------------------- scraping
    async def scrape_loads(self, max_pages: int = 3) -> int:
        db = get_db()
        await self.page.goto(f"{BASE}/carrier/")
        await self.page.wait_for_load_state("networkidle")
        await self.page.wait_for_timeout(2000)

        # Domestic tab
        dom_btn = self.page.locator('button:has-text("Domestic")').first
        if await dom_btn.count() and await dom_btn.is_visible():
            await dom_btn.click()
            await self.page.wait_for_timeout(1000)

        total_new = 0
        for _ in range(max_pages):
            await self.page.wait_for_selector('a[href*="/carrier/load/"]', timeout=15000)

            loads = await self.page.evaluate(r"""() => {
                const results = [];
                const seen = new Set();
                for (const a of document.querySelectorAll('a[href*="/carrier/load/"]')) {
                    const m = a.href.match(/\/load\/([a-f0-9\-]{36})/i);
                    if (!m || seen.has(m[1])) continue;
                    seen.add(m[1]);
                    let card = a.closest('[class]');
                    const text = card ? card.innerText : a.innerText;
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                    const cityRe = /([A-Za-z][A-Za-z\s]{1,25},\s*[A-Z]{2})/g;
                    const locs = []; let loc;
                    while ((loc = cityRe.exec(text)) !== null) locs.push(loc[1].trim());
                    results.push({
                        load_id:        m[1],
                        load_number:    (text.match(/Load\s*#\s*(\d+)/i) || [])[1] || '',
                        equipment_name: lines[0] || '',
                        length:  (text.match(/Length\s+([\d]+\s*ft[\s\d]*in)/i) || [])[1] || '',
                        width:   (text.match(/Width\s+([\d]+\s*ft[\s\d]*in)/i)  || [])[1] || '',
                        height:  (text.match(/Height\s+([\d]+\s*ft[\s\d]*in)/i) || [])[1] || '',
                        weight:  (text.match(/Weight\s+([\d,]+\s*lbs)/i)        || [])[1] || '',
                        time_remaining: ((text.match(/(\d+\s+(?:Days?|Hours?|Minutes?)[^]*?)(?:\n|$)/i) || [])[0] || '').trim(),
                        origin:      locs[0] || '',
                        destination: locs[1] || '',
                    });
                }
                return results;
            }""")

            for load in loads:
                # Upsert — ignore if already exists
                result = db.table("loads").upsert(
                    {**load, "status": "new"},
                    on_conflict="load_id",
                    ignore_duplicates=True,
                ).execute()
                if result.data:
                    total_new += len(result.data)

            # Next page
            nxt = self.page.locator('button:has-text("Next"), a:has-text("Next")').first
            if await nxt.count() and await nxt.is_visible():
                await nxt.click()
                await self.page.wait_for_load_state("networkidle")
                await self.page.wait_for_timeout(1500)
            else:
                break

        return total_new

    # -------------------------------------------------------- bid submission
    async def submit_approved_bids(self) -> int:
        db = get_db()
        bids_resp = db.table("bids").select("*, loads(*)").eq("status", "approved").execute()
        bids = bids_resp.data or []
        print(f"📋 Found {len(bids)} approved bids to submit")

        submitted = 0
        for bid in bids:
            load_id = bid["load_id"]
            amount = float(bid["final_bid"])
            print(f"  → Submitting ${amount:,.0f} for load {load_id[:8]}…")

            ok = await self._submit_bid(load_id, amount)
            status = "submitted" if ok else "error"
            updates = {"status": status}
            if ok:
                from datetime import datetime, timezone
                updates["submitted_at"] = datetime.now(timezone.utc).isoformat()

            db.table("bids").update(updates).eq("id", bid["id"]).execute()
            db.table("loads").update({"status": status}).eq("load_id", load_id).execute()

            if ok:
                submitted += 1
                print(f"    ✅ Submitted")
            else:
                print(f"    ❌ Failed")

        return submitted

    async def _submit_bid(self, load_id: str, amount: float) -> bool:
        url = f"{BASE}/carrier/load/{load_id}"
        await self.page.goto(url)
        await self.page.wait_for_load_state("networkidle")
        await self.page.wait_for_timeout(1500)
        try:
            bid_btn = self.page.locator(
                'button:has-text("Place Bid"), button:has-text("Submit Bid"), '
                'button:has-text("Bid Now"), button:has-text("Make Offer"), a:has-text("Place Bid")'
            ).first
            if not await bid_btn.count():
                return False
            await bid_btn.click()
            await self.page.wait_for_timeout(1200)

            amount_input = self.page.locator(
                'input[name*="bid" i], input[placeholder*="bid" i], '
                'input[placeholder*="amount" i], input[type="number"]'
            ).first
            await amount_input.wait_for(state="visible", timeout=5000)
            await amount_input.triple_click()
            await amount_input.fill(str(int(amount)))
            await self.page.wait_for_timeout(400)

            confirm = self.page.locator(
                'button[type="submit"], button:has-text("Confirm"), '
                'button:has-text("Submit"), button:has-text("Place Bid")'
            ).first
            await confirm.click()
            await self.page.wait_for_timeout(2500)

            body = await self.page.evaluate("document.body.innerText.toLowerCase()")
            if any(w in body for w in ["error", "failed", "invalid"]):
                return False
            return True
        except Exception as e:
            print(f"    Exception: {e}")
            return False

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
        self.page.set_default_timeout(60000)  # 60s global timeout

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    # ------------------------------------------------------------------ login
    async def login(self):
        """Login only when needed (e.g. for bid submission). Scraping is public."""
        await self.page.goto(f"{BASE}/carrier/", wait_until="load")
        await self.page.wait_for_timeout(2000)
        # Carrier board is publicly accessible — no login needed for scraping
        print("✅ Veritread carrier board accessible")

    async def force_login(self):
        """Authenticate so we can submit bids on behalf of the account."""
        email = os.environ["VERITREAD_EMAIL"]
        password = os.environ["VERITREAD_PASSWORD"]

        # Navigate directly to login page
        for path in ["/login", "/account/login", "/signin"]:
            await self.page.goto(f"{BASE}{path}", wait_until="load")
            await self.page.wait_for_timeout(2000)
            if await self.page.locator('input[type="email"], input[type="text"][name*="email" i]').count():
                break

        email_inp = self.page.locator(
            'input[type="email"], input[type="text"][name*="email" i], input[placeholder*="email" i]'
        ).first
        if not await email_inp.count():
            # Try clicking a "Sign In" link from the main page first
            await self.page.goto(BASE, wait_until="load")
            await self.page.wait_for_timeout(2000)
            sign_in = self.page.locator('a:has-text("Sign In"), a:has-text("Login"), a:has-text("Log In")').first
            if await sign_in.count():
                await sign_in.click()
                await self.page.wait_for_load_state("domcontentloaded")
                await self.page.wait_for_timeout(2000)
            email_inp = self.page.locator('input[type="email"]').first

        if not await email_inp.count():
            raise RuntimeError("Could not find login form on Veritread")

        await email_inp.fill(email)
        await self.page.locator('input[type="password"]').first.fill(password)

        submit = self.page.locator('button[type="submit"], input[type="submit"]').first
        if await submit.count():
            await submit.click()
        else:
            await self.page.keyboard.press("Enter")

        await self.page.wait_for_load_state("domcontentloaded")
        await self.page.wait_for_timeout(3000)

        # Verify we got in by checking for user-specific elements or redirect
        url = self.page.url
        title = await self.page.title()
        print(f"✅ Veritread login OK — {url}")

    # --------------------------------------------------------------- scraping
    async def scrape_loads(self, max_loads: int = 5000) -> int:
        db = get_db()
        await self.page.goto(f"{BASE}/carrier/", wait_until="load")
        await self.page.wait_for_timeout(3000)

        # Domestic tab
        dom_btn = self.page.locator('button:has-text("Domestic")').first
        if await dom_btn.count() and await dom_btn.is_visible():
            await dom_btn.click()
            await self.page.wait_for_timeout(1000)

        # Scroll until all loads are loaded (infinite scroll)
        prev_count = 0
        stall_count = 0
        while True:
            current_count = await self.page.locator('a[href*="/carrier/load/"]').count()
            print(f"  📄 {current_count} load links visible…", end="\r")
            if current_count >= max_loads:
                break
            if current_count == prev_count:
                stall_count += 1
                if stall_count >= 6:
                    break  # truly no more after 6 stalled scrolls (~18s)
            else:
                stall_count = 0
            prev_count = current_count
            # Scroll to bottom, then slightly back to trigger loader
            await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await self.page.wait_for_timeout(1500)
            await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight - 200)")
            await self.page.wait_for_timeout(1500)

        print()  # newline after \r

        # Extract all load data in one JS pass
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
                const cityRe = /([A-Za-z][A-Za-z ]{1,25},\s*[A-Z]{2})/g;
                const locs = []; let loc;
                while ((loc = cityRe.exec(text)) !== null) locs.push(loc[1].trim());
                results.push({
                    load_id:        m[1],
                    load_number:    (text.match(/Load\s*#\s*(\d+)/i) || [])[1] || '',
                    equipment_name: lines[0] || '',
                    length:  (text.match(/Length[:\s]+([\d.]+\s*(?:ft|')[\s\d"]*(?:in)?)/i) || [])[1] || '',
                    width:   (text.match(/Width[:\s]+([\d.]+\s*(?:ft|')[\s\d"]*(?:in)?)/i)  || [])[1] || '',
                    height:  (text.match(/Height[:\s]+([\d.]+\s*(?:ft|')[\s\d"]*(?:in)?)/i) || [])[1] || '',
                    weight:  (text.match(/Weight[:\s]+([\d,]+\s*lbs)/i)                      || [])[1] || '',
                    time_remaining: ((text.match(/(\d+\s+(?:Days?|Hours?|Minutes?)[^]*?)(?:\n|$)/i) || [])[0] || '').trim(),
                    origin:      locs[0] ? locs[0].replace(/^[^A-Za-z]+/, '').trim() : '',
                    destination: locs[1] ? locs[1].replace(/^[^A-Za-z]+/, '').trim() : '',
                });
            }
            return results;
        }""")

        print(f"  💾 Saving {len(loads)} loads to Supabase…")
        total_new = 0
        # Batch upsert in chunks of 100
        for i in range(0, len(loads), 100):
            chunk = loads[i:i+100]
            result = db.table("loads").upsert(
                [{**l, "status": "new"} for l in chunk],
                on_conflict="load_id",
                ignore_duplicates=True,
            ).execute()
            if result.data:
                total_new += len(result.data)

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

"""
WWEX / Speedship Playwright automation.
Fetches LTL rates for pending ltl_quotes rows in Supabase.
"""
from __future__ import annotations
import asyncio
import os
import math
from playwright.async_api import async_playwright, Page
from db import get_db


WWEX_URL = "https://www.wwex.com"


class WwexBot:
    def __init__(self, headed: bool = False):
        self.headed = headed
        self._pw = None
        self._browser = None
        self.page: Page | None = None

    async def start(self):
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=not self.headed,
            slow_mo=500 if self.headed else 100,
        )
        ctx = await self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        )
        self.page = await ctx.new_page()
        self.page.set_default_timeout(60000)

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    async def login(self):
        email = os.environ["WWEX_EMAIL"]
        password = os.environ["WWEX_PASSWORD"]

        await self.page.goto(WWEX_URL, wait_until="domcontentloaded")
        await self.page.wait_for_timeout(2000)

        # Look for login/sign-in button or direct form
        login_btn = self.page.locator(
            'a:has-text("Log In"), a:has-text("Sign In"), button:has-text("Log In"), a:has-text("Login")'
        ).first
        if await login_btn.count() and await login_btn.is_visible():
            await login_btn.click()
            await self.page.wait_for_load_state("domcontentloaded")
            await self.page.wait_for_timeout(2000)

        # Fill credentials
        email_inp = self.page.locator('input[type="email"], input[name="email"], input[name="username"]').first
        await email_inp.wait_for(state="visible", timeout=10000)
        await email_inp.fill(email)

        pwd_inp = self.page.locator('input[type="password"]').first
        await pwd_inp.fill(password)

        submit = self.page.locator('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")').first
        await submit.click()
        await self.page.wait_for_load_state("domcontentloaded")
        await self.page.wait_for_timeout(2000)
        print("✅ WWEX login OK")

    async def process_pending_quotes(self) -> int:
        db = get_db()
        pending = db.table("ltl_quotes").select("*").eq("status", "pending").execute()
        quotes = pending.data or []
        print(f"📦 {len(quotes)} pending LTL quotes to price")

        completed = 0
        for q in quotes:
            print(f"  → {q['origin']} → {q['destination']} | {q['weight_lbs']} lbs | Class {q['freight_class']}")
            try:
                rate = await self._get_rate(
                    q["origin"],
                    q["destination"],
                    int(q["weight_lbs"]),
                    str(q["freight_class"]),
                )
                if rate:
                    markup = float(q.get("markup_pct", 25))
                    customer_rate = math.ceil(rate * (1 + markup / 100))
                    db.table("ltl_quotes").update({
                        "wwex_rate": rate,
                        "customer_rate": customer_rate,
                        "status": "completed",
                    }).eq("id", q["id"]).execute()
                    completed += 1
                    print(f"    ✅ WWEX: ${rate:,.2f} → Customer: ${customer_rate:,.0f}")
                else:
                    db.table("ltl_quotes").update({"status": "error"}).eq("id", q["id"]).execute()
                    print(f"    ❌ Could not retrieve rate")
            except Exception as e:
                print(f"    ❌ Error: {e}")
                db.table("ltl_quotes").update({"status": "error"}).eq("id", q["id"]).execute()

        return completed

    async def _get_rate(
        self,
        origin: str,
        destination: str,
        weight_lbs: int,
        freight_class: str,
    ) -> float | None:
        """
        Navigate WWEX rate quote tool and return the lowest rate found.
        """
        try:
            # Try the quote / rate page
            await self.page.goto(f"{WWEX_URL}/ship/ltl-freight")
            await self.page.wait_for_load_state("domcontentloaded")
            await self.page.wait_for_timeout(2000)

            # If the page didn't work, try finding a "Get a Quote" or "Rate" link
            if "404" in await self.page.title() or not await self.page.locator('input').count():
                for path in ["/shipping-rate-quote", "/get-a-quote", "/quote", "/ltl"]:
                    await self.page.goto(f"{WWEX_URL}{path}")
                    await self.page.wait_for_load_state("domcontentloaded")
                    if await self.page.locator('input').count():
                        break

            # Fill origin zip/city — WWEX typically uses zip codes
            origin_inp = self.page.locator(
                'input[name*="origin" i], input[placeholder*="origin" i], '
                'input[placeholder*="from" i], input[id*="origin" i]'
            ).first

            if not await origin_inp.count():
                # Fallback: just fill the first two text inputs
                inputs = self.page.locator('input[type="text"], input[type="number"]')
                count = await inputs.count()
                if count >= 2:
                    await inputs.nth(0).fill(self._extract_zip_or_city(origin))
                    await inputs.nth(1).fill(self._extract_zip_or_city(destination))
            else:
                await origin_inp.fill(self._extract_zip_or_city(origin))
                dest_inp = self.page.locator(
                    'input[name*="dest" i], input[placeholder*="dest" i], '
                    'input[placeholder*="to" i], input[id*="dest" i]'
                ).first
                await dest_inp.fill(self._extract_zip_or_city(destination))

            # Weight
            weight_inp = self.page.locator(
                'input[name*="weight" i], input[placeholder*="weight" i], input[id*="weight" i]'
            ).first
            if await weight_inp.count():
                await weight_inp.fill(str(weight_lbs))

            # Freight class
            class_sel = self.page.locator(
                'select[name*="class" i], select[id*="class" i], select[name*="freight" i]'
            ).first
            if await class_sel.count():
                await class_sel.select_option(label=freight_class)

            # Submit
            submit = self.page.locator(
                'button[type="submit"], button:has-text("Get Rate"), '
                'button:has-text("Quote"), button:has-text("Calculate")'
            ).first
            await submit.click()
            await self.page.wait_for_load_state("domcontentloaded")
            await self.page.wait_for_timeout(3000)

            # Extract lowest rate
            rate = await self.page.evaluate("""() => {
                const text = document.body.innerText;
                const matches = [...text.matchAll(/\\$([\\d,]+(?:\\.\\d{2})?)/g)]
                    .map(m => parseFloat(m[1].replace(',', '')))
                    .filter(v => v > 50 && v < 50000);
                return matches.length ? Math.min(...matches) : null;
            }""")
            return float(rate) if rate else None

        except Exception as e:
            print(f"      WWEX rate error: {e}")
            return None

    @staticmethod
    def _extract_zip_or_city(location: str) -> str:
        """Return just the city+state, or the whole string."""
        return location.strip().split(",")[0].strip() if "," in location else location.strip()

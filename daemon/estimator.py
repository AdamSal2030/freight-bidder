"""
Auto-estimates carrier rates for new loads using Claude Haiku.
Mirrors the logic in lib/claude.ts but runs in the Python daemon.
"""
from __future__ import annotations
import os
import json
import math
import anthropic

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def margin_pct(distance_miles: int) -> float:
    if distance_miles < 250:
        return 20.0
    if distance_miles < 500:
        return 18.0
    return 18.0  # user-set minimum


def calculate_bid(carrier_rate: float, margin: float) -> float:
    raw = carrier_rate * (1 + margin / 100)
    return math.ceil(raw / 50) * 50  # round up to nearest $50


def estimate_load(load: dict) -> dict | None:
    """
    Call Claude Haiku to estimate carrier rate for a single load.
    Returns a dict with bid fields, or None if estimation fails / returns $0.
    """
    prompt = f"""You are a senior heavy haul freight pricing specialist.

Analyze this shipment and return ONLY a JSON object — no markdown, no prose.

Shipment:
  Equipment  : {load.get('equipment_name', 'Unknown')}
  Origin     : {load.get('origin', 'Unknown')}
  Destination: {load.get('destination', 'Unknown')}
  Length     : {load.get('length', 'Unknown')}
  Width      : {load.get('width', 'Unknown')}
  Height     : {load.get('height', 'Unknown')}
  Weight     : {load.get('weight', 'Unknown')}

Tasks:
1. Estimate driving miles (realistic US highway route).
2. Choose trailer: Flatbed / Step Deck / RGN / Lowboy / Double-Drop / Stretch RGN / Multi-Axle.
3. Estimate all-in carrier cost (linehaul + fuel surcharge ~25% + permits if oversize + pilot cars if needed).
4. Oversize flags: width >8'6" OR height >13'6" needs permits; width >14' or height >15' needs pilots.

Market context (2026): Heavy haul spot $3.50–$8.00/loaded mile. Standard flatbed $2.80–$3.80/mile.

Return exactly this JSON:
{{
  "distance_miles": <integer>,
  "carrier_rate": <float, must be > 0>,
  "rate_per_mile": <float>,
  "trailer_type": "<string>",
  "requires_permits": <true|false>,
  "requires_pilot_cars": <true|false>,
  "reasoning": "<1-2 sentences on key rate drivers>"
}}"""

    try:
        msg = get_client().messages.create(
            model="claude-haiku-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        # Strip any markdown fences
        raw = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)

        carrier_rate = float(data.get("carrier_rate", 0))
        distance_miles = int(data.get("distance_miles", 0))

        if carrier_rate <= 0 or distance_miles <= 0:
            return None  # Bad estimate — skip

        margin = margin_pct(distance_miles)
        suggested_bid = calculate_bid(carrier_rate, margin)

        return {
            "distance_miles": distance_miles,
            "trailer_type": data.get("trailer_type", "Unknown"),
            "requires_permits": bool(data.get("requires_permits", False)),
            "requires_pilot_cars": bool(data.get("requires_pilot_cars", False)),
            "carrier_rate": carrier_rate,
            "margin_pct": margin,
            "suggested_bid": suggested_bid,
            "final_bid": suggested_bid,
            "reasoning": data.get("reasoning", ""),
            "status": "pending_approval",
        }

    except Exception as e:
        print(f"      Estimate error: {e}")
        return None


def auto_estimate_new_loads(db) -> int:
    """
    Fetch all loads with status='new', run Claude on each, save bid records.
    Returns count of loads successfully estimated.
    """
    result = db.table("loads").select("*").eq("status", "new").execute()
    new_loads = result.data or []
    print(f"🤖 {len(new_loads)} new loads to estimate…")

    estimated = 0
    for load in new_loads:
        load_id = load["load_id"]
        # Skip loads missing origin or destination
        if not load.get("origin") or not load.get("destination"):
            print(f"  ⚠  Skipping {load_id[:8]} — missing origin/destination")
            db.table("loads").update({"status": "estimating_error"}).eq("load_id", load_id).execute()
            continue

        # Mark as estimating
        db.table("loads").update({"status": "estimating"}).eq("load_id", load_id).execute()

        print(f"  → {load.get('origin')} → {load.get('destination')} | {load.get('equipment_name', '')[:30]}", end=" ")
        estimate = estimate_load(load)

        if estimate:
            try:
                db.table("bids").insert({**estimate, "load_id": load_id}).execute()
                db.table("loads").update({"status": "pending_approval"}).eq("load_id", load_id).execute()
                print(f"✅ ${estimate['suggested_bid']:,.0f} ({estimate['trailer_type']})")
                estimated += 1
            except Exception as e:
                print(f"❌ DB error: {e}")
                db.table("loads").update({"status": "new"}).eq("load_id", load_id).execute()
        else:
            print("❌ bad estimate")
            db.table("loads").update({"status": "new"}).eq("load_id", load_id).execute()

    return estimated

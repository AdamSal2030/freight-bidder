import Anthropic from '@anthropic-ai/sdk';
import type { EstimateResponse } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Cost-effective model for rate estimation
const MODEL = 'claude-haiku-4-5';

export async function estimateCarrierRate(load: {
  equipment_name: string;
  origin: string;
  destination: string;
  length: string;
  width: string;
  height: string;
  weight: string;
}): Promise<EstimateResponse> {
  const prompt = `You are a senior heavy haul freight pricing specialist.

Analyze this shipment and return ONLY a JSON object — no markdown, no prose.

Shipment:
  Equipment  : ${load.equipment_name}
  Origin     : ${load.origin}
  Destination: ${load.destination}
  Length     : ${load.length}
  Width      : ${load.width}
  Height     : ${load.height}
  Weight     : ${load.weight}

Tasks:
1. Estimate driving miles (realistic US highway route).
2. Choose trailer: Flatbed / Step Deck / RGN / Lowboy / Double-Drop / Stretch RGN / Multi-Axle.
3. Estimate all-in carrier cost (linehaul + fuel surcharge ~25% + permits if oversize + pilot cars if needed + tolls).
4. Oversize flags: width >8'6" OR height >13'6" needs permits; width >14' or height >15' needs pilots.

Market context (2026): Heavy haul spot $3.50–$8.00/loaded mile. Standard flatbed $2.80–$3.80/mile.

Return exactly this JSON:
{
  "distance_miles": <integer>,
  "carrier_rate": <float>,
  "rate_per_mile": <float>,
  "trailer_type": "<string>",
  "requires_permits": <true|false>,
  "requires_pilot_cars": <true|false>,
  "reasoning": "<1-2 sentences on key rate drivers>"
}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (msg.content[0] as { text: string }).text
    .trim()
    .replace(/```[a-z]*/g, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(raw) as EstimateResponse;
}

export async function getMarginPct(distanceMiles: number): Promise<number> {
  if (distanceMiles < 250) return 20;
  if (distanceMiles < 500) return 18;
  return 15;
}

export function calculateBid(carrierRate: number, marginPct: number): number {
  const raw = carrierRate * (1 + marginPct / 100);
  return Math.round(raw / 50) * 50; // round to nearest $50
}

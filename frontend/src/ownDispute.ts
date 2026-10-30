import type { DisputeCase } from "./types";

/** How many disputes this browser has added: the next one is J-<count + 1>. */
export const OWN_COUNT_KEY = "triverity.ownDisputes";
// Mirrors MAX_CASE_LABEL_CHARS in backend/app/core/limits.py.
const MAX_LABEL = 60;
const CLAIM_LABEL = 32;
const METRES_PER_DEGREE = 111_320;

type CountStore = Pick<Storage, "getItem" | "setItem">;

// Used when storage is blocked, so IDs still go up within this page.
let lastInMemory = 0;

/**
 * A short ID for a dispute the judge adds: J-01, J-02… The count is kept in the browser, so a
 * new dispute never reuses the ID (and saved results) of an earlier one after a reload.
 */
export function nextOwnDisputeId(storage: CountStore | null): string {
  let stored = 0;
  try {
    stored = Number.parseInt(storage?.getItem(OWN_COUNT_KEY) ?? "", 10) || 0;
  } catch { /* Storage blocked: count in memory only. */ }
  const next = Math.max(stored, lastInMemory) + 1;
  lastInMemory = next;
  try { storage?.setItem(OWN_COUNT_KEY, String(next)); } catch { /* As above. */ }
  return `J-${String(next).padStart(2, "0")}`;
}

/** Straight-line metres from pickup to where the driver stopped, or null when unknown. */
export function metresFromPickup(trip: DisputeCase["trip"]): number | null {
  const { pickup_lat: lat1, pickup_lng: lng1, driver_arrival_lat: lat2, driver_arrival_lng: lng2 } = trip;
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const dy = (lat2 - lat1) * METRES_PER_DEGREE;
  const dx = (lng2 - lng1) * METRES_PER_DEGREE * Math.cos((lat1 * Math.PI) / 180);
  return Math.round(Math.hypot(dx, dy));
}

const known = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

function routeLabel(c: DisputeCase): string | null {
  const { expected_distance_km: ek, actual_distance_km: ak, expected_duration_min: em, actual_duration_min: am } = c.trip;
  const parts: string[] = [];
  if (known(ek) && known(ak) && ek > 0) {
    const pct = Math.round(((ak - ek) / ek) * 100);
    parts.push(pct > 0 ? `Route ${pct}% longer` : pct < 0 ? `Route ${-pct}% shorter` : "Usual route length");
  }
  if (known(em) && known(am)) {
    const diff = Math.round(am - em);
    parts.push(diff > 0 ? `${diff} min slower` : diff < 0 ? `${-diff} min faster` : "same time");
  }
  if (parts.length) return parts.join(", ");
  const { expected, actual } = c.fare;
  if (known(expected) && known(actual) && actual > expected) return `Charged $${(actual - expected).toFixed(2)} more`;
  return null;
}

function noShowLabel(c: DisputeCase): string | null {
  const metres = metresFromPickup(c.trip);
  const wait = c.trip.driver_wait_min;
  if (known(wait) && metres != null) return `${Math.round(wait)}-min wait, ${metres} m from pickup`;
  if (metres != null) return `Driver stopped ${metres} m away`;
  if (known(wait)) return `Driver waited ${Math.round(wait)} min`;
  return null;
}

/** The first words of the rider's claim, cut at a word boundary. */
function claimLabel(claim: string): string {
  const text = claim.replace(/\s+/g, " ").trim();
  if (text.length <= CLAIM_LABEL) return text;
  const cut = text.slice(0, CLAIM_LABEL);
  const space = cut.lastIndexOf(" ");
  return `${(space > CLAIM_LABEL / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** A short name for the queue, like the samples' ("Route 38% longer, 11 min slower"). Display only. */
export function autoLabel(c: DisputeCase): string {
  const label = (c.type === "route_deviation" ? routeLabel(c) : noShowLabel(c)) ?? claimLabel(c.rider_claim);
  return label.slice(0, MAX_LABEL);
}

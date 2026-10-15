import { useState, type FormEvent } from "react";

import type { ChatMessage, DisputeCase, DisputeType } from "./types";

// Mirrors backend/app/core/limits.py, so judges see the limits before the API rejects a field.
const MAX_STATEMENT = 2000;
const MAX_MESSAGES = 50;
const MAX_MESSAGE = 500;
const MAX_KM = 500;
const MAX_MIN = 600;
const MAX_FARE = 1000;

const DEFAULT_PICKUP = { lat: 1.3521, lng: 103.8198 }; // central Singapore
const METRES_PER_DEGREE = 111_320;
const SENDERS = ["rider", "driver", "system"] as const;

interface Fields {
  type: DisputeType;
  riderClaim: string;
  driverStatement: string;
  expectedKm: string;
  actualKm: string;
  expectedMin: string;
  actualMin: string;
  expectedFare: string;
  actualFare: string;
  cancellationFee: string;
  waitMin: string;
  pickupDistanceM: string;
  chat: string;
}

const str = (v: number | null | undefined) => (v == null ? "" : String(v));

function pickupDistance(trip: DisputeCase["trip"]): string {
  const { pickup_lat: lat1, pickup_lng: lng1, driver_arrival_lat: lat2, driver_arrival_lng: lng2 } = trip;
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return "";
  const dy = (lat2 - lat1) * METRES_PER_DEGREE;
  const dx = (lng2 - lng1) * METRES_PER_DEGREE * Math.cos((lat1 * Math.PI) / 180);
  return String(Math.round(Math.hypot(dx, dy)));
}

function fromCase(c?: DisputeCase): Fields {
  return {
    type: c?.type ?? "route_deviation",
    riderClaim: c?.rider_claim ?? "",
    driverStatement: c?.driver_statement ?? "",
    expectedKm: str(c?.trip.expected_distance_km),
    actualKm: str(c?.trip.actual_distance_km),
    expectedMin: str(c?.trip.expected_duration_min),
    actualMin: str(c?.trip.actual_duration_min),
    expectedFare: str(c?.fare.expected),
    actualFare: str(c?.fare.actual),
    cancellationFee: str(c?.fare.cancellation_fee),
    waitMin: str(c?.trip.driver_wait_min),
    pickupDistanceM: c ? pickupDistance(c.trip) : "",
    chat: (c?.chat_logs ?? []).map((m) => `${m.sender}: ${m.message}`).join("\n"),
  };
}

function num(value: string, label: string, max: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} must be a number from 0 to ${max}.`);
  return n;
}

function parseChat(text: string): ChatMessage[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_MESSAGES) throw new Error(`Up to ${MAX_MESSAGES} chat messages.`);
  return lines.map((line, i) => {
    const match = /^(rider|driver|system)\s*:\s*(.+)$/i.exec(line);
    if (!match) throw new Error(`Chat line ${i + 1}: start with "rider:", "driver:" or "system:".`);
    if (match[2].length > MAX_MESSAGE) throw new Error(`Chat line ${i + 1} is over ${MAX_MESSAGE} characters.`);
    return { sender: match[1].toLowerCase() as (typeof SENDERS)[number], message: match[2] };
  });
}

function toCase(f: Fields, template?: DisputeCase): DisputeCase {
  if (!f.riderClaim.trim()) throw new Error("The rider's claim is required.");
  const pickup = {
    lat: template?.trip.pickup_lat ?? DEFAULT_PICKUP.lat,
    lng: template?.trip.pickup_lng ?? DEFAULT_PICKUP.lng,
  };
  const distanceM = num(f.pickupDistanceM, "Driver's distance from pickup", 5000);
  const trip: DisputeCase["trip"] =
    f.type === "route_deviation"
      ? {
          expected_distance_km: num(f.expectedKm, "Expected distance", MAX_KM),
          actual_distance_km: num(f.actualKm, "Actual distance", MAX_KM),
          expected_duration_min: num(f.expectedMin, "Expected duration", MAX_MIN),
          actual_duration_min: num(f.actualMin, "Actual duration", MAX_MIN),
        }
      : {
          driver_wait_min: num(f.waitMin, "Driver wait", MAX_MIN),
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          // Place the driver due north of pickup at the given distance.
          driver_arrival_lat: distanceM == null ? null : pickup.lat + distanceM / METRES_PER_DEGREE,
          driver_arrival_lng: distanceM == null ? null : pickup.lng,
        };
  return {
    dispute_id: `J-${Date.now().toString(36).toUpperCase()}`,
    type: f.type,
    rider_claim: f.riderClaim.trim(),
    driver_statement: f.driverStatement.trim() || null,
    trip,
    fare:
      f.type === "route_deviation"
        ? {
            expected: num(f.expectedFare, "Expected fare", MAX_FARE),
            actual: num(f.actualFare, "Charged fare", MAX_FARE),
            breakdown: [],
          }
        : { cancellation_fee: num(f.cancellationFee, "No-show fee", MAX_FARE), breakdown: [] },
    chat_logs: parseChat(f.chat),
    rider_history: template?.rider_history ?? {},
    driver_history: template?.driver_history ?? {},
  };
}

export function DisputeForm({
  template,
  onSubmit,
  onCancel,
}: {
  template?: DisputeCase;
  onSubmit: (dispute: DisputeCase) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Fields>(() => fromCase(template));
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Fields) => (e: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onSubmit(toCase(fields, template));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const numberInput = (key: keyof Fields, label: string, max: number, unit: string) => (
    <label>
      <span>
        {label} <span className="muted">({unit})</span>
      </span>
      <input type="number" min={0} max={max} step="any" value={fields[key]} onChange={set(key)} />
    </label>
  );

  return (
    <form className="card dispute-form" onSubmit={submit}>
      <div className="card-head">
        <h2>{template ? `New dispute based on ${template.dispute_id}` : "New dispute"}</h2>
      </div>
      <p className="small muted">
        Describe a dispute and the agents will resolve it. Facts you leave blank count as missing data.
      </p>
      <div role="alert" aria-atomic="true">{error && <p className="error">{error}</p>}</div>

      <label>
        <span>Dispute type</span>
        <select value={fields.type} onChange={set("type")}>
          <option value="route_deviation">Route deviation</option>
          <option value="no_show_charge">No-show charge</option>
        </select>
      </label>

      <div className="statements">
        <label>
          <span>Rider's claim</span>
          <textarea rows={4} maxLength={MAX_STATEMENT} value={fields.riderClaim} onChange={set("riderClaim")} required />
        </label>
        <label>
          <span>Driver's statement</span>
          <textarea rows={4} maxLength={MAX_STATEMENT} value={fields.driverStatement} onChange={set("driverStatement")} />
        </label>
      </div>

      <div className="form-grid">
        {fields.type === "route_deviation" ? (
          <>
            {numberInput("expectedKm", "Expected distance", MAX_KM, "km")}
            {numberInput("actualKm", "Actual distance", MAX_KM, "km")}
            {numberInput("expectedMin", "Expected duration", MAX_MIN, "min")}
            {numberInput("actualMin", "Actual duration", MAX_MIN, "min")}
            {numberInput("expectedFare", "Expected fare", MAX_FARE, "$")}
            {numberInput("actualFare", "Charged fare", MAX_FARE, "$")}
          </>
        ) : (
          <>
            {numberInput("cancellationFee", "No-show fee", MAX_FARE, "$")}
            {numberInput("waitMin", "Driver waited", MAX_MIN, "min")}
            {numberInput("pickupDistanceM", "Driver stopped from pickup", 5000, "m")}
          </>
        )}
      </div>

      <label>
        <span>
          Chat log <span className="muted">(one message per line, e.g. "rider: Where are you?")</span>
        </span>
        <textarea rows={5} value={fields.chat} onChange={set("chat")} />
      </label>

      <div className="run-bar">
        <button type="submit" className="run-button">
          Add dispute
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

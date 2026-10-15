import { comparison, money } from "./presentation";
import type { DisputeCase } from "./types";

export function CaseComparison({ dispute }: { dispute: DisputeCase }) {
  const rows = [
    { label: "Distance", unit: "km", expected: dispute.trip.expected_distance_km, actual: dispute.trip.actual_distance_km },
    { label: "Duration", unit: "min", expected: dispute.trip.expected_duration_min, actual: dispute.trip.actual_duration_min },
    { label: "Fare", unit: "$", expected: dispute.fare.expected, actual: dispute.fare.actual },
  ];
  return <div className="comparisons">
    {rows.map(row => {
      const data = comparison(row.expected, row.actual);
      if (!data) return null;
      const format = (value: number | null) => value == null ? "Not provided" : row.unit === "$" ? money(value) : `${value} ${row.unit}`;
      return <div className="comparison" key={row.label}>
        <div className="card-head"><strong>{row.label}</strong>
          {data.percent !== null && <span className="delta">{data.percent > 0 ? "+" : ""}{Math.round(data.percent)}%</span>}
        </div>
        <div className="comparison-row"><span>Expected</span><strong>{format(data.expected)}</strong></div>
        <div className="comparison-track" aria-hidden="true"><div className="expected-bar" style={{ width: `${data.expectedWidth}%` }} /></div>
        <div className="comparison-row"><span>Actual</span><strong>{format(data.actual)}</strong></div>
        <div className="comparison-track" aria-hidden="true"><div className="actual-bar" style={{ width: `${data.actualWidth}%` }} /></div>
      </div>;
    })}
  </div>;
}

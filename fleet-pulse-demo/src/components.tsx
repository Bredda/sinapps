import type { Status } from "./types";

export function StatusDot({ status }: { status: Status }) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />;
}

export function Gauge({ value, status }: { value: number; status: Status }) {
  const clamped = Math.min(100, Math.max(0, value));
  // Arc from -120deg to +120deg (240deg sweep), radius 36, centered at (40, 40).
  const startAngle = -120;
  const sweep = 240;
  const angle = startAngle + (clamped / 100) * sweep;
  const describeArc = (fromDeg: number, toDeg: number) => {
    const r = 36;
    const cx = 40;
    const cy = 40;
    const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(fromDeg));
    const y1 = cy + r * Math.sin(toRad(fromDeg));
    const x2 = cx + r * Math.cos(toRad(toDeg));
    const y2 = cy + r * Math.sin(toRad(toDeg));
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  return (
    <svg viewBox="0 0 80 80" className="gauge" role="img" aria-label={`${Math.round(clamped)}%`}>
      <path d={describeArc(startAngle, startAngle + sweep)} className="gauge-track" />
      <path d={describeArc(startAngle, angle)} className={`gauge-value gauge-value--${status}`} />
      <text x="40" y="44" textAnchor="middle" className="gauge-label">
        {Math.round(clamped)}
        <tspan className="gauge-unit">%</tspan>
      </text>
    </svg>
  );
}

export function Sparkline({ data, status }: { data: number[]; status: Status }) {
  const width = 100;
  const height = 28;
  if (data.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" />;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" preserveAspectRatio="none">
      <polygon points={areaPoints} className={`sparkline-area sparkline-area--${status}`} />
      <polyline points={points} className={`sparkline-line sparkline-line--${status}`} />
    </svg>
  );
}

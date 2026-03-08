import { ResponsiveContainer, AreaChart, Area } from "recharts";

export const SENSORS = [
  { id: "TEMP_01", label: "TEMPERATURE", unit: "°C", base: 24, range: 8, icon: "🌡", color: "#f97316", glow: "#f9731660", alert: 30 },
  { id: "HUM_01", label: "HUMIDITY", unit: "%", base: 58, range: 20, icon: "💧", color: "#06b6d4", glow: "#06b6d460", alert: 75 },
  { id: "PRES_01", label: "PRESSURE", unit: "hPa", base: 1013, range: 10, icon: "⚡", color: "#a855f7", glow: "#a855f760", alert: 1020 },
  { id: "LIGHT_01", label: "LUMINOSITY", unit: "lux", base: 450, range: 300, icon: "☀️", color: "#fbbf24", glow: "#fbbf2460", alert: 700 },
  { id: "SOUND_01", label: "ACOUSTICS", unit: "dB", base: 45, range: 40, icon: "🎤", color: "#ec4899", glow: "#ec489960", alert: 80 },
  { id: "DIST_01", label: "PROXIMITY", unit: "cm", base: 120, range: 100, icon: "📏", color: "#10b981", glow: "#10b98160", alert: 20 },
];

export const GlowCard = ({ sensor, value, history }: any) => {
  const isAlert = value > sensor.alert;
  return (
    <div style={{
      background: `linear-gradient(135deg, #0a0a0f 60%, ${sensor.glow})`,
      border: `1px solid ${isAlert ? "#ff4444" : sensor.color}55`,
      borderRadius: 16,
      padding: "20px 22px",
      position: "relative",
      overflow: "hidden",
      boxShadow: `0 0 24px ${isAlert ? "#ff444433" : sensor.glow}, inset 0 0 40px #00000080`,
      transition: "box-shadow 0.3s",
      cursor: "default",
    }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60,
        background: `linear-gradient(135deg, transparent 50%, ${sensor.color}22 100%)`,
        borderBottomLeftRadius: 40 }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ color: "#666", fontSize: 10, letterSpacing: 3, fontFamily: "'Courier New', monospace", marginBottom: 4 }}>
            {sensor.id}
          </div>
          <div style={{ color: "#aaa", fontSize: 11, letterSpacing: 2, fontFamily: "'Courier New', monospace" }}>
            {sensor.label}
          </div>
        </div>
        <span style={{ fontSize: 22 }}>{sensor.icon}</span>
      </div>

      <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700,
        fontSize: 32, color: isAlert ? "#ff4444" : sensor.color,
        textShadow: `0 0 20px ${isAlert ? "#ff4444" : sensor.color}`,
        letterSpacing: -1, marginBottom: 4 }}>
        {value}<span style={{ fontSize: 14, fontWeight: 400, color: "#666", marginLeft: 4 }}>{sensor.unit}</span>
      </div>

      {isAlert && (
        <div style={{ fontSize: 9, color: "#ff4444", letterSpacing: 2, fontFamily: "'Courier New', monospace",
          animation: "blink 1s infinite", marginBottom: 6 }}>
          ⚠ THRESHOLD BREACH
        </div>
      )}

      <ResponsiveContainer width="100%" height={50}>
        <AreaChart data={history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${sensor.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={sensor.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={sensor.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={sensor.color} strokeWidth={1.5}
            fill={`url(#g-${sensor.id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 9, color: "#444", fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
          MIN {Math.min(...history.map((h: any) => h.v)).toFixed(1)}
        </span>
        <span style={{ fontSize: 9, color: "#444", fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
          MAX {Math.max(...history.map((h: any) => h.v)).toFixed(1)}
        </span>
      </div>
    </div>
  );
};

export const TxLog = ({ logs }: any) => (
  <div style={{ background: "#0a0a0f", border: "1px solid #1a1a2e", borderRadius: 16,
    padding: "18px 20px", height: 220, overflowY: "auto" }}>
    <div style={{ color: "#22c55e", fontSize: 10, letterSpacing: 3,
      fontFamily: "'Courier New', monospace", marginBottom: 12, borderBottom: "1px solid #1a1a2e", paddingBottom: 8 }}>
      ◈ LIVE TELEMETRY LOG
    </div>
    {logs.map((log: any, i: number) => (
      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
        <span style={{ color: "#333", fontSize: 9, fontFamily: "'Courier New', monospace", flexShrink: 0, marginTop: 1 }}>
          {log.time}
        </span>
        <span style={{ color: "#22c55e55", fontSize: 9, fontFamily: "'Courier New', monospace", flexShrink: 0 }}>
          #{log.hash}
        </span>
        <span style={{ color: log.alert ? "#ff4444" : "#666", fontSize: 9,
          fontFamily: "'Courier New', monospace", lineHeight: 1.5 }}>
          {log.msg}
        </span>
      </div>
    ))}
  </div>
);

export const NetworkNode = ({ x, y, active }: any) => (
  <div style={{
    position: "absolute", left: `${x}%`, top: `${y}%`,
    width: 8, height: 8, borderRadius: "50%",
    background: active ? "#22c55e" : "#1a1a2e",
    boxShadow: active ? "0 0 10px #22c55e" : "none",
    transition: "all 0.5s",
  }} />
);

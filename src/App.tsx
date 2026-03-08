import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MatrixRain } from "./components/MatrixRain";
import { SENSORS, GlowCard, TxLog, NetworkNode } from "./components/DashboardComponents";
import { LogOut, Activity, Cpu, MessageSquare, Terminal, Search, Brain, Zap, Sparkles, AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { generateContent, GeminiModel } from "./services/gemini";
import { supabase } from "./services/supabase";
import { ThinkingLevel } from "@google/genai";
import Markdown from "react-markdown";

const generateReading = (base: number, range: number) => +(base + (Math.random() - 0.5) * range).toFixed(2);
const initialHistory = (base: number, range: number) =>
  Array.from({ length: 20 }, (_, i) => ({
    t: i,
    v: generateReading(base, range),
  }));

const UUID = () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [readings, setReadings] = useState(() =>
    Object.fromEntries(SENSORS.map(s => [s.id, generateReading(s.base, s.range)]))
  );
  const [histories, setHistories] = useState(() =>
    Object.fromEntries(SENSORS.map(s => [s.id, initialHistory(s.base, s.range)]))
  );
  const [logs, setLogs] = useState<any[]>([]);
  const [nodes, setNodes] = useState(Array(12).fill(false).map(() => Math.random() > 0.5));
  const [activeTab, setActiveTab] = useState("dashboard");
  const logRef = useRef<any[]>([]);

  // Global Error/Toast State
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  const showToast = (message: string, type: "error" | "success" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"fast" | "pro" | "think">("pro");

  // Hardware Guide State
  const [hwGuide, setHwGuide] = useState("");
  const [isHwLoading, setIsHwLoading] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user.email || session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user.email || session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username || !password) {
      showToast("◈ ERROR: CREDENTIALS REQUIRED.", "error");
      return;
    }

    // Check if Supabase is configured
    const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_URL && 
                                import.meta.env.VITE_SUPABASE_ANON_KEY &&
                                !import.meta.env.VITE_SUPABASE_URL.includes("placeholder");

    try {
      if (isSupabaseConfigured) {
        if (authMode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: username.includes("@") ? username : `${username}@gabiot.local`,
            password: password,
          });
          if (error) throw error;
          setUser(data.user?.email || data.user?.id || null);
          showToast(`◈ WELCOME BACK, ${username.toUpperCase()}.`, "success");
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: username.includes("@") ? username : `${username}@gabiot.local`,
            password: password,
          });
          if (error) throw error;
          
          // If session is present, they are logged in immediately
          if (data.session) {
            setUser(data.user?.email || data.user?.id || null);
            showToast(`◈ NODE REGISTERED & UPLINKED.`, "success");
          } else {
            setAuthMode("login");
            showToast("◈ REGISTRATION SUCCESSFUL. INITIALIZE LOGIN.", "success");
          }
        }
      } else {
        // LOCAL FALLBACK MODE
        const localUsers = JSON.parse(localStorage.getItem("gabiot_users") || "{}");
        
        if (authMode === "login") {
          if (localUsers[username] === password || (username === "admin" && password === "admin")) {
            setUser(username);
            showToast(`◈ WELCOME BACK, ${username.toUpperCase()} (LOCAL).`, "success");
          } else {
            throw new Error("Invalid credentials in local database");
          }
        } else {
          if (localUsers[username]) {
            throw new Error("Node ID already registered locally");
          }
          localUsers[username] = password;
          localStorage.setItem("gabiot_users", JSON.stringify(localUsers));
          setAuthMode("login");
          showToast("◈ LOCAL REGISTRATION SUCCESSFUL. INITIALIZE LOGIN.", "success");
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
      showToast(`◈ ERROR: ${err.message?.toUpperCase() || "AUTH FAILED"}.`, "error");
    }
  };

  const handleGuestLogin = () => {
    setUser("GUEST_USER");
    showToast("◈ GUEST ACCESS GRANTED.", "success");
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      showToast("◈ SESSION TERMINATED.", "success");
    } catch (err) {
      showToast("◈ ERROR: LOGOUT FAILED.", "error");
      setUser(null);
    }
  };

  const handleAiChat = async (overridePrompt?: string) => {
    const prompt = overridePrompt || chatInput;
    if (!prompt.trim() || isAiLoading) return;
    
    const userMsg = { role: "user", content: prompt };
    setChatMessages(prev => [...prev, userMsg]);
    if (!overridePrompt) setChatInput("");
    setIsAiLoading(true);

    try {
      let model = GeminiModel.PRO;
      let thinkingLevel: ThinkingLevel | undefined = undefined;
      
      if (aiMode === "fast") model = GeminiModel.FLASH_LITE;
      if (aiMode === "think") {
        model = GeminiModel.PRO;
        thinkingLevel = ThinkingLevel.HIGH;
      }

      // Prepare sensor context for the AI
      const sensorContext = SENSORS.map(s => `${s.label}: ${readings[s.id]}${s.unit} (Threshold: ${s.alert}${s.unit})`).join("\n");

      const response = await generateContent(prompt, {
        model,
        thinkingLevel,
        systemInstruction: `You are a technical AI assistant for the GabIoT Connect Dashboard. 
        Use professional, cyber-themed language. 
        Help users with IoT and Lafvin Arduino Uno integration.
        
        CURRENT LIVE SENSOR DATA:
        ${sensorContext}
        
        You have access to real-time telemetry. Analyze the data for anomalies, breaches, or trends when asked. 
        If a sensor exceeds its threshold, warn the user with high-priority protocol language.`
      });

      setChatMessages(prev => [...prev, { role: "model", content: response }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "model", content: "◈ ERROR: UPLINK FAILED. " + err.message }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const fetchHwGuide = async () => {
    if (hwGuide || isHwLoading) return;
    setIsHwLoading(true);
    try {
      const prompt = `Provide a comprehensive hardware integration guide for a Lafvin Arduino Uno.
      
      Requirements:
      1. Libraries: Specify exact libraries (e.g., DHT sensor library by Adafruit, BMP280 library).
      2. Sensors: Provide C++ code for:
         - Temperature & Humidity (DHT11/DHT22)
         - Pressure (BMP280/BME280)
         - Light (LDR/Photoresistor)
         - Sound (Microphone module)
         - Proximity (HC-SR04 Ultrasonic)
      3. Error Handling: Include code to detect and report sensor failures (e.g., 'NaN' readings, timeout).
      4. Data Format: Format output as a single JSON string over Serial for easy parsing.
      5. Node.js Backend: Provide a 'serial-bridge.js' script using 'serialport' and '@serialport/parser-readline' to read from USB, parse JSON, and POST to the '/api/sensors/log' endpoint of this dashboard.
      6. Security: Remind the user to use their JWT token in the bridge script.`;

      const response = await generateContent(prompt, {
        model: GeminiModel.PRO,
        thinkingLevel: ThinkingLevel.HIGH,
        systemInstruction: "You are a senior embedded systems engineer and full-stack developer. Provide professional, production-ready code snippets and clear architectural instructions for the Lafvin Arduino Uno ecosystem."
      });
      setHwGuide(response);
    } catch (err: any) {
      setHwGuide("◈ ERROR: FAILED TO RETRIEVE HARDWARE SCHEMATICS.");
      showToast("◈ ERROR: HARDWARE GUIDE DECRYPTION FAILED.", "error");
    } finally {
      setIsHwLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "hardware") fetchHwGuide();
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setReadings(prev => {
        const next: any = {};
        SENSORS.forEach(s => {
          const val = generateReading(s.base, s.range);
          next[s.id] = val;
          
          // Log to Supabase if configured
          supabase.from('telemetry').insert({
            sensor_id: s.id,
            value: val,
            label: s.label,
            unit: s.unit
          }).then(({ error }) => {
            if (error) {
              console.warn("Supabase sync failed:", error.message);
              setSyncError(true);
            } else {
              setSyncError(false);
            }
          });

          // Fallback to local API
          fetch("/api/sensors/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sensor_id: s.id, value: val }),
          })
          .then(res => {
            if (!res.ok) throw new Error("Sync failed");
          })
          .catch(() => {
            // Only set sync error if supabase also failed or if we're not using it
          });
        });

        const newLogs = SENSORS.map(s => ({
          time: timeStr,
          hash: UUID(),
          msg: `${s.label} → ${next[s.id]}${s.unit} [LOGGED]`,
          alert: (s.id === "DIST_01" ? next[s.id] < s.alert : next[s.id] > s.alert),
        }));
        logRef.current = [...newLogs, ...logRef.current].slice(0, 40);
        setLogs([...logRef.current]);
        return next;
      });

      setHistories(prev => {
        const next: any = {};
        SENSORS.forEach(s => {
          const arr = [...prev[s.id], { t: prev[s.id].length, v: generateReading(s.base, s.range) }];
          next[s.id] = arr.slice(-30);
        });
        return next;
      });

      setNodes(Array(12).fill(false).map(() => Math.random() > 0.4));
    }, 2000);
    return () => clearInterval(interval);
  }, [user]);

  const nodePositions = [
    { x: 20, y: 10 }, { x: 100, y: 5 }, { x: 170, y: 20 }, { x: 230, y: 8 }, { x: 290, y: 15 }, { x: 350, y: 5 },
    { x: 50, y: 45 }, { x: 140, y: 50 }, { x: 200, y: 38 }, { x: 270, y: 48 }, { x: 320, y: 42 }, { x: 380, y: 35 },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4 font-mono relative overflow-hidden">
        <MatrixRain />
        <div className="relative z-10 w-full max-w-md bg-[#0a0a0f] border border-[#22c55e33] rounded-2xl p-8 shadow-[0_0_50px_rgba(34,197,94,0.1)]">
          <div className="text-center mb-8">
            <div className="text-[#22c55e] text-3xl font-bold tracking-widest mb-2 drop-shadow-[0_0_10px_#22c55e]">
              ◈ GABIOT<span className="text-[#06b6d4]"> CONNECT</span>
            </div>
            <div className="text-[#333] text-[10px] tracking-[4px]">SECURE ACCESS PROTOCOL</div>
            <div className="mt-2 text-[8px] tracking-[2px] text-[#444]">
              MODE: {import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes("placeholder") ? "SUPABASE_UPLINK" : "LOCAL_DATABASE"}
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-[#666] text-[10px] tracking-widest mb-2">USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#050508] border border-[#1a1a2e] rounded-lg px-4 py-3 text-[#22c55e] focus:outline-none focus:border-[#22c55e] transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-[#666] text-[10px] tracking-widest mb-2">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#050508] border border-[#1a1a2e] rounded-lg px-4 py-3 text-[#22c55e] focus:outline-none focus:border-[#22c55e] transition-colors"
                required
              />
            </div>

            {error && <div className="text-red-500 text-[10px] text-center">{error}</div>}

            <button
              type="submit"
              className="w-full bg-[#22c55e] text-black font-bold py-3 rounded-lg hover:bg-[#16a34a] transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            >
              {authMode === "login" ? "INITIALIZE SESSION" : "REGISTER NODE"}
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1a1a2e]"></div></div>
              <div className="relative flex justify-center text-[8px] uppercase tracking-[2px]"><span className="bg-[#0a0a0f] px-2 text-[#444]">Or bypass security</span></div>
            </div>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full border border-[#22c55e33] hover:border-[#22c55e] text-[#22c55e] font-bold py-3 rounded-lg tracking-[4px] transition-all text-[10px]"
            >
              ◈ GUEST ACCESS
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              className="text-[#444] text-[10px] hover:text-[#22c55e] transition-colors"
            >
              {authMode === "login" ? "CREATE NEW CREDENTIALS" : "BACK TO LOGIN"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono relative overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#0a0a0f; }
        ::-webkit-scrollbar-thumb { background:#22c55e44; border-radius:2px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cardAlertPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
        .tab-btn { background:none; border:none; cursor:pointer; padding:8px 16px; font-family:'Courier New',monospace; font-size:10px; letter-spacing:2px; transition:all 0.2s; outline: none; }
        .tab-btn:hover { color:#22c55e !important; }
        .tab-btn:focus { outline: 1px solid #22c55e; outline-offset: 2px; }
        .stat-pill { background:#0a0a0f; border:1px solid #1a1a2e; border-radius:8px; padding:8px 16px; text-align:center; }
        .tab-content { animation: fadeIn 0.3s ease-out; }
        .loading-skeleton { background: linear-gradient(90deg, #1a1a2e 25%, #2a2a3e 50%, #1a1a2e 75%); background-size: 1000px 100%; animation: shimmer 2s infinite; }
        @media (max-width: 768px) {
          .tab-btn { padding: 6px 12px; font-size: 8px; }
          .stat-pill { padding: 6px 12px; font-size: 9px; }
          .tab-btn:focus { outline-width: 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      
      <MatrixRain />

      {/* scanline */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-b from-transparent via-[#22c55e22] to-transparent animate-[scanline_8s_linear_infinite] z-[1] pointer-events-none" />

      <div className="relative z-[2] max-w-[1100px] mx-auto px-3 sm:px-4 py-4 sm:py-5">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#1a1a2e] pb-4 mb-6">
          <div>
            <div className="text-[#22c55e] text-lg sm:text-xl font-bold tracking-[2px] sm:tracking-[4px] drop-shadow-[0_0_20px_#22c55e] font-['Share_Tech_Mono']">
              ◈ GABIOT<span className="text-[#06b6d4]"> CONNECT</span>
            </div>
            <div className="text-[#333] text-[8px] sm:text-[9px] tracking-[2px] sm:tracking-[3px] mt-0.5">
              IoT · SECURED DATA LAYER · REAL-TIME TELEMETRY
            </div>
          </div>

          <div className="flex gap-3 sm:gap-5 items-center w-full sm:w-auto">
            <div className="stat-pill text-sm">
              <div className="text-[#06b6d4] text-xs sm:text-sm font-bold">{SENSORS.length}</div>
              <div className="text-[#333] text-[7px] sm:text-[8px] tracking-[1px] sm:tracking-[2px]">NODES</div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-2 h-2 rounded-full ${syncError ? "bg-red-500 shadow-[0_0_12px_#ef4444]" : "bg-[#22c55e] shadow-[0_0_12px_#22c55e]"} animate-[pulse_2s_infinite]`} />
              <span className={`${syncError ? "text-red-500" : "text-[#22c55e]"} text-[8px] sm:text-[9px] tracking-[1px] sm:tracking-[2px]`}>
                {syncError ? "SYNC ERROR" : "LIVE"}
              </span>
            </div>
            <button onClick={handleLogout} className="p-1.5 sm:p-2 text-[#444] hover:text-red-500 transition-colors ml-auto">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NETWORK VISUALIZER */}
        <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl px-5 py-4 mb-5 relative h-20 overflow-hidden">
          <div className="text-[#333] text-[9px] tracking-[3px] mb-2">◈ P2P NETWORK TOPOLOGY</div>
          <div className="absolute top-[30px] left-5 right-5 h-[60px]">
            {nodePositions.map((pos, i) => (
              <NetworkNode key={i} x={(pos.x / 400) * 100} y={(pos.y / 60) * 100} active={nodes[i]} />
            ))}
            <svg className="absolute top-0 left-0 w-full h-full opacity-30">
              {nodePositions.slice(0, -1).map((pos, i) => (
                <line key={i} 
                  x1={`${(pos.x / 400) * 100}%`} y1={`${(pos.y / 60) * 100}%`}
                  x2={`${(nodePositions[i + 1].x / 400) * 100}%`} y2={`${(nodePositions[i + 1].y / 60) * 100}%`}
                  stroke={nodes[i] && nodes[i + 1] ? "#22c55e" : "#1a1a2e"} strokeWidth={1} />
              ))}
            </svg>
          </div>
          <div className="absolute right-5 top-4 text-[#22c55e55] text-[9px] tracking-[2px]">
            {nodes.filter(Boolean).length}/{nodes.length} ONLINE
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-1 mb-5 border-b border-[#1a1a2e] overflow-x-auto pb-2">
          {["dashboard", "analytics", "alerts", "hardware", "chat"].map(tab => (
            <button key={tab} className="tab-btn whitespace-nowrap"
              style={{
                color: activeTab === tab ? "#22c55e" : "#444",
                borderBottom: activeTab === tab ? "2px solid #22c55e" : "2px solid transparent",
                transition: "all 0.3s ease"
              }}
              onClick={() => setActiveTab(tab)}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-5 auto-rows-max">
              {SENSORS.map((s, i) => (
                <div key={s.id} style={{ animation: `slideIn 0.3s ease-out ${i * 0.05}s backwards` }}>
                  <GlowCard sensor={s} value={readings[s.id]} history={histories[s.id]} />
                </div>
              ))}
            </div>
            <TxLog logs={logs} />
          </>
        )}

        {activeTab === "analytics" && (
          <div className="tab-content grid grid-cols-1 md:grid-cols-2 gap-4">
            {SENSORS.map(s => (
              <div key={s.id} className="bg-[#0a0a0f] rounded-2xl p-5 shadow-[0_0_20px_rgba(34,197,94,0.05)] border border-[#1a1a2e]">
                <div style={{ color: s.color }} className="text-[10px] tracking-[3px] mb-3 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> {s.label} ANALYTICS
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={histories[s.id]}>
                    <XAxis dataKey="t" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: "#0a0a0f", border: `1px solid ${s.color}44`, borderRadius: 8, fontSize: 10, color: s.color, fontFamily: "'Courier New',monospace" }}
                      formatter={(v: any) => [`${v} ${s.unit}`, s.label]}
                    />
                    <Line type="monotone" dataKey="v" stroke={s.color} strokeWidth={2} dot={false} style={{ filter: `drop-shadow(0 0 4px ${s.color})` }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-around mt-2">
                  {["MIN", "AVG", "MAX"].map((stat, i) => {
                    const vals = histories[s.id].map(h => h.v);
                    const val = i === 0 ? Math.min(...vals) : i === 1 ? vals.reduce((a, b) => a + b, 0) / vals.length : Math.max(...vals);
                    return (
                      <div key={stat} className="text-center">
                        <div style={{ color: s.color }} className="text-sm font-bold">{val.toFixed(1)}</div>
                        <div className="text-[#333] text-[8px] tracking-[2px]">{stat}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="tab-content flex flex-col gap-2.5">
            <div className="text-[#333] text-[9px] tracking-[3px] mb-2">◈ ALERT THRESHOLD MONITOR</div>
            {SENSORS.map(s => {
              const isAlert = s.id === "DIST_01" ? readings[s.id] < s.alert : readings[s.id] > s.alert;
              return (
                <div key={s.id} className={`bg-[#0a0a0f] border ${isAlert ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]" : "border-[#1a1a2e]"} rounded-xl px-5 py-3.5 flex justify-between items-center transition-all duration-300`}>
                  <div className="flex gap-3.5 items-center">
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <div className="text-[#aaa] text-[10px] tracking-[2px]">{s.label}</div>
                      <div className="text-[#444] text-[9px] tracking-[1px] mt-0.5">
                        THRESHOLD: {s.id === "DIST_01" ? "<" : ">"} {s.alert}{s.unit}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div style={{ color: isAlert ? "#ef4444" : s.color }} className="text-lg font-bold drop-shadow-[0_0_10px_currentColor]">
                      {readings[s.id]}{s.unit}
                    </div>
                    <div className={`text-[9px] tracking-[2px] ${isAlert ? "text-red-500 animate-[blink_1s_infinite]" : "text-[#22c55e]"}`}>
                      {isAlert ? "⚠ BREACH" : "✓ NOMINAL"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "hardware" && (
          <div className="tab-content bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-8 shadow-[0_0_30px_rgba(34,197,94,0.05)]">
            <div className="flex items-center gap-3 mb-6">
              <Cpu className="w-6 h-6 text-[#22c55e]" />
              <h2 className="text-[#22c55e] text-xl font-bold tracking-widest">HARDWARE INTEGRATION PROTOCOL</h2>
            </div>
            
            {isHwLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-12 h-12 border-4 border-[#22c55e22] border-t-[#22c55e] rounded-full animate-spin" />
                <div className="text-[#22c55e] text-[10px] tracking-[4px] animate-pulse">DECRYPTING SCHEMATICS...</div>
              </div>
            ) : (
              <div className="markdown-body prose prose-invert max-w-none">
                <Markdown>{hwGuide}</Markdown>
              </div>
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <div className="tab-content bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl flex flex-col h-[400px] sm:h-[500px] md:h-[600px] overflow-hidden shadow-[0_0_30px_rgba(34,197,94,0.05)]">
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-[#1a1a2e] flex items-center justify-between bg-[#050508]">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-[#22c55e]" />
                <div className="flex flex-col">
                  <span className="text-[#22c55e] text-[10px] font-bold tracking-widest uppercase">Secure Uplink: Gemini-3.1</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
                    <span className="text-[#22c55e55] text-[8px] tracking-[2px]">TELEMETRY FEED ACTIVE</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    handleAiChat("Analyze the current sensor telemetry for any anomalies or breaches.");
                  }}
                  className="px-3 py-1.5 rounded border border-[#22c55e33] text-[#22c55e] text-[8px] tracking-[2px] hover:bg-[#22c55e11] transition-all flex items-center gap-2"
                >
                  <Activity className="w-3 h-3" /> ANALYZE TELEMETRY
                </button>
                <div className="w-[1px] h-6 bg-[#1a1a2e] mx-1" />
                <button onClick={() => setAiMode("fast")} className={`p-1.5 rounded border ${aiMode === "fast" ? "border-[#22c55e] text-[#22c55e]" : "border-[#1a1a2e] text-[#444]"} transition-all`} title="Fast Mode">
                  <Zap className="w-4 h-4" />
                </button>
                <button onClick={() => setAiMode("pro")} className={`p-1.5 rounded border ${aiMode === "pro" ? "border-[#06b6d4] text-[#06b6d4]" : "border-[#1a1a2e] text-[#444]"} transition-all`} title="Pro Mode">
                  <Sparkles className="w-4 h-4" />
                </button>
                <button onClick={() => setAiMode("think")} className={`p-1.5 rounded border ${aiMode === "think" ? "border-purple-500 text-purple-500" : "border-[#1a1a2e] text-[#444]"} transition-all`} title="Thinking Mode">
                  <Brain className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                  <Search className="w-12 h-12 mb-4" />
                  <p className="text-[10px] tracking-[4px]">AWAITING INPUT COMMANDS...</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-4 rounded-xl border ${msg.role === "user" ? "bg-[#1a1a2e] border-[#22c55e33] text-[#22c55e]" : "bg-[#050508] border-[#1a1a2e] text-[#aaa]"}`}>
                    <div className="markdown-body prose prose-sm prose-invert">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#050508] border border-[#1a1a2e] p-4 rounded-xl animate-pulse flex items-center gap-3">
                    <div className="w-2 h-2 bg-[#22c55e] rounded-full animate-bounce" />
                    <span className="text-[10px] text-[#22c55e] tracking-widest">PROCESSING...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-[#1a1a2e] bg-[#050508]">
              <div className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAiChat()}
                  placeholder="ENTER COMMAND... (Ctrl+Enter to send)"
                  className="w-full bg-[#0a0a0f] border border-[#1a1a2e] rounded-lg px-4 py-3 text-[#22c55e] text-xs focus:outline-none focus:border-[#22c55e] transition-all pr-12"
                />
                <button 
                  onClick={() => handleAiChat()}
                  disabled={isAiLoading || !chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#22c55e] hover:bg-[#22c55e11] rounded-lg transition-all disabled:opacity-50"
                >
                  <Cpu className={`w-4 h-4 ${isAiLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-6 border-t border-[#1a1a2e] pt-3.5 flex justify-between items-center">
          <span className="text-[#222] text-[8px] tracking-[2px]">
            GABIOT CONNECT v2.5.0 · ENCRYPTED · SECURE
          </span>
          <span className="text-[#222] text-[8px] tracking-[2px] animate-[pulse_3s_infinite]">
            SYSTEM STATUS: OPTIMAL · ALL TELEMETRY LOGGED
          </span>
        </div>

        {/* Global Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[100] border ${
            toast.type === "error" ? "border-red-500 text-red-500 bg-red-500/10" :
            toast.type === "success" ? "border-[#22c55e] text-[#22c55e] bg-[#22c55e10]" :
            "border-[#06b6d4] text-[#06b6d4] bg-[#06b6d410]"
          } px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-[slideIn_0.3s_ease-out]`}>
            {toast.type === "error" && <AlertCircle className="w-5 h-5" />}
            {toast.type === "success" && <CheckCircle2 className="w-5 h-5" />}
            {toast.type === "info" && <Info className="w-5 h-5" />}
            <span className="text-[10px] tracking-[2px] font-bold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

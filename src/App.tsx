import React, { useState, useEffect, useRef } from "react";
import { 
  ShieldAlert, Activity, Cpu, Map as MapIcon, Layers, 
  Crosshair, GitMerge, TrendingUp, AlertTriangle, Zap,
  ChevronRight, RefreshCw, BarChart2, Sun, Moon
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, Marker } from 'react-leaflet';
import L from 'leaflet';

// ─── STATIC CONSTANTS ────────────────────────────────────────────────────────
const TIME_BLOCKS = ["Sunday_0400","Saturday_2200","Friday_1800","Monday_0800"];

const TICKER_ITEMS = [
  { id: 3,   block: "SUN_0400", delay: 6497, status: "CRITICAL" },
  { id: 14,  block: "SUN_0400", delay: 216,  status: "HIGH"     },
  { id: 31,  block: "SUN_0400", delay: 10,   status: "ACTIVE"   },
  { id: 7,   block: "SAT_2200", delay: 4120, status: "CRITICAL" },
  { id: 22,  block: "FRI_1800", delay: 890,  status: "HIGH"     },
  { id: 45,  block: "MON_0800", delay: 340,  status: "HIGH"     },
  { id: 88,  block: "WED_1200", delay: 122,  status: "ACTIVE"   },
  { id: 103, block: "THU_0900", delay: 56,   status: "ACTIVE"   },
  { id: 201, block: "SUN_0300", delay: 5201, status: "CRITICAL" },
  { id: 316, block: "SAT_0500", delay: 4844, status: "CRITICAL" },
];

const CHRONIC_REGISTRY = [
  { rank: 1, id: 3,   violations: 4330, conf: 1.00, peak: "SUN_0400", totalDelay: 6497,  rec: "Permanent barricade" },
  { rank: 2, id: 201, violations: 3466, conf: 0.98, peak: "SUN_0300", totalDelay: 5201,  rec: "Permanent barricade" },
  { rank: 3, id: 316, violations: 3228, conf: 0.96, peak: "SAT_0500", totalDelay: 4844,  rec: "Permanent barricade" },
  { rank: 4, id: 7,   violations: 2901, conf: 0.95, peak: "SAT_2200", totalDelay: 4120,  rec: "Permanent barricade" },
  { rank: 5, id: 98,  violations: 1100, conf: 0.88, peak: "MON_0800", totalDelay: 1240,  rec: "Regular patrol slot" },
  { rank: 6, id: 22,  violations: 890,  conf: 0.82, peak: "FRI_1800", totalDelay: 890,   rec: "Regular patrol slot" },
];

const PILLARS = [
  { title: "DBSCAN Clustering", desc: "Maps 298k raw violation rows into 484 physical gridlock nodes.", icon: MapIcon },
  { title: "Hawkes Probability", desc: "Calculates spatio-temporal confidence scores to separate anomalies from chronic contagions.", icon: Activity },
  { title: "Knapsack Optimizer", desc: "Integer Linear Programming maximizes delay cleared without exceeding officer constraints.", icon: Cpu },
  { title: "Gravity Routing", desc: "Multi-agent heuristic maximizing lives-per-km via Damage/Distance decay.", icon: GitMerge },
  { title: "Civic Empathy Override", desc: "Applies 3x priority multipliers to hotspots within 500m of Hospitals and Schools.", icon: ShieldAlert },
  { title: "Explainable Context", desc: "Ray-casting links hotspots to Metro Construction and VIP Rally polygons.", icon: Layers },
  { title: "Pareto Efficiency", desc: "Mathematically proves the point of diminishing returns for resource allocation.", icon: TrendingUp },
  { title: "Digital Twin Simulator", desc: "Silently solves N+x states to forecast marginal ROI of off-duty officer deployment.", icon: Crosshair },
  { title: "Chronic Registry", desc: "Identifies 17-week repeat offenders for permanent infrastructure barricading.", icon: AlertTriangle },
];

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ─── TICKER STRIP ─────────────────────────────────────────────────────────────
function TickerStrip() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  const statusColor = { CRITICAL: "var(--alert)", HIGH: "#FFB800", ACTIVE: "var(--signal)" };

  return (
    <div className="bg-[var(--abyss)] border-b border-[var(--elevated)] h-10 flex items-center overflow-hidden">
      <div className="flex gap-0 animate-[ticker_30s_linear_infinite] whitespace-nowrap will-change-transform">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-7 border-r border-[var(--elevated)] font-mono text-xs tracking-widest">
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: statusColor[item.status],
              boxShadow: "0 0 6px " + statusColor[item.status],
              animation: item.status === "CRITICAL" ? "pulse-dot 1s ease-in-out infinite" : "none",
            }} />
            <span className="text-[var(--slate)]">HS-{String(item.id).padStart(3,"0")}</span>
            <span className="text-[var(--frost)]">{item.block}</span>
            <span style={{ color: statusColor[item.status] }} className="font-bold">
              {item.delay.toLocaleString()} MIN
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── MAP CANVAS ───────────────────────────────────────────────────────────────
function MapCanvas({ dispatched, mode, hotspots }) {
  const DEPOT = [12.9815, 77.5946]; // Central Bengaluru HQ

  // Calculate routes for dispatched hotspots
  const dispatchedHotspots = hotspots.filter(h => dispatched.includes(h.id));

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden rounded-xl">
      <MapContainer 
        center={DEPOT} 
        zoom={12} 
        zoomControl={false}
        className="w-full h-full"
      >
        {/* CartoDB Dark Matter Base Map */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Draw Patrol Routes (Only in tactical deployed mode) */}
        {mode === "tactical" && dispatchedHotspots.map((h, i) => (
          <Polyline 
            key={`route-${h.id}`}
            positions={[DEPOT, [h.lat, h.lon]]}
            color="#00E5A0"
            weight={2}
            opacity={0.5}
            dashArray="6, 6"
          />
        ))}

        {/* Draw Hotspots */}
        {hotspots.map(h => {
          const isDispatched = dispatched.includes(h.id) && mode === "tactical";
          const isWorst = h.id === 3; // Example worst hotspot
          const radius = Math.min(Math.max(6 + h.delay / 500, 6), 24);

          return (
            <React.Fragment key={h.id}>
              {/* Outer Pulse for Worst Hotspot */}
              {(isWorst || mode === "hero") && !isDispatched && (
                <Marker
                  position={[h.lat, h.lon]}
                  icon={L.divIcon({
                    className: 'custom-pulse-icon',
                    html: `<div class="pulse-circle" style="width: ${radius*3}px; height: ${radius*3}px; background-color: rgba(255,59,92,0.3); border-radius: 50%;"></div>`,
                    iconSize: [radius*3, radius*3],
                    iconAnchor: [radius*1.5, radius*1.5]
                  })}
                />
              )}

              {/* Main Hotspot Dot */}
              <CircleMarker
                center={[h.lat, h.lon]}
                radius={isDispatched ? radius : radius * 0.8}
                pathOptions={{
                  color: isDispatched ? '#fff' : '#FF3B5C',
                  weight: isDispatched ? 2 : 0,
                  fillColor: isDispatched ? '#00E5A0' : '#FF3B5C',
                  fillOpacity: isDispatched ? 1 : 0.7,
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1} className="custom-tooltip">
                  <div className="font-mono text-xs">
                    <strong>HS-{h.id}</strong><br/>
                    Delay: {h.delay} mins<br/>
                    Status: {isDispatched ? "✅ DISPATCHED" : "🚨 UNMANAGED"}
                  </div>
                </Tooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        {/* Draw HQ Depot */}
        {mode === "tactical" && (
          <CircleMarker
            center={DEPOT}
            radius={8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#FFB800', fillOpacity: 1 }}
          >
            <Tooltip permanent direction="bottom" offset={[0, 10]} className="bg-transparent border-none text-[#FFB800] font-bold shadow-none text-xs">HQ</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

// ─── MAIN APPLICATION ─────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("pitch"); // pitch | analyzing | deployed
  
  // API State
  const [cityData, setCityData] = useState(null);
  const [dispatchResults, setDispatchResults] = useState(null);
  
  // Control State
  const [officers, setOfficers] = useState(5);
  const [timeBlock, setTimeBlock] = useState("Sunday_0400");
  const [alpha, setAlpha] = useState(1.0);
  const [lambda, setLambda] = useState(0.15);
  const [enableCritical, setEnableCritical] = useState(false);
  const [enableEvents, setEnableEvents] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  
  const [dispatched, setDispatched] = useState([]);
  const [spinnerStep, setSpinnerStep] = useState(0);

  const SPINNER_STEPS = [
    "Ingesting friction log...",
    "Running DBSCAN spatial clustering...",
    "Applying Infrastructure & Event multipliers...",
    "Solving Knapsack ILP (CBC solver)...",
    "Computing gravity-based multi-agent routes...",
    "Simulating N+x Digital Twin marginal gains...",
    "Tactical Manifest Ready."
  ];

  // Fetch Vitals on Mount
  useEffect(() => {
    fetch('http://localhost:8001/api/vitals')
      .then(res => res.json())
      .then(data => setCityData(data))
      .catch(err => {
        console.error(err);
        alert("Failed to load /api/vitals. Ensure FastAPI is running on port 8001.");
      });
  }, []);

  async function handleDeploy() {
    if (appState === "analyzing") return;
    setAppState("analyzing");
    setSpinnerStep(0);
    
    const interval = setInterval(() => {
      setSpinnerStep(s => (s < SPINNER_STEPS.length - 1 ? s + 1 : s));
    }, 400);

    try {
      const res = await fetch('http://localhost:8001/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time_block: timeBlock,
          available_officers: officers,
          alpha: alpha,
          lambda_: lambda,
          enable_critical: enableCritical,
          enable_events: enableEvents
        })
      });
      const data = await res.json();
      
      clearInterval(interval);
      setSpinnerStep(SPINNER_STEPS.length - 1);

      if (data.error) {
        alert("Dispatcher Error: " + data.error);
        setAppState("pitch");
        return;
      }

      setTimeout(() => {
        setDispatchResults(data);
        setDispatched(data.dispatched_ids);
        setAppState("deployed");
      }, 500);

    } catch (err) {
      clearInterval(interval);
      console.error(err);
      alert("API request failed.");
      setAppState("pitch");
    }
  }

  if (!cityData) {
    return (
      <div className="min-h-screen bg-[var(--abyss)] flex flex-col items-center justify-center font-display text-[var(--frost)] text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[var(--signal)] mb-6" />
        <h2 className="text-xl tracking-[0.2em] uppercase font-bold text-white">Establishing connection to Command Center...</h2>
        <p className="text-[var(--slate)] mt-2 font-mono text-sm">Booting FastAPI backend and loading historical citation matrix</p>
      </div>
    );
  }

  // Twin Simulator Logic (Global Max Thresholding Patch)
  const twinData = dispatchResults?.twin_data || [];
  const maxME = Math.max(...twinData.map(d => d.me), 1); // fallback to 1 to avoid Infinity
  const thetaH = maxME * 0.9;
  const thetaL = maxME * 0.5;

  return (
    <div className="min-h-screen bg-[var(--abyss)] text-[var(--frost)] font-sans overflow-x-hidden selection:bg-[var(--signal)] selection:text-[var(--abyss)]">
      {/* ── CSS VARIABLES & KEYFRAMES ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          ${isLightMode ? `
          --abyss: #F8FAFC; --surface: #FFFFFF; --elevated: #CBD5E1;
          --signal: #059669; --alert: #DC2626; --frost: #0F172A; --slate: #334155;
          ` : `
          --abyss: #080C14; --surface: #0F1724; --elevated: #1A2540;
          --signal: #00E5A0; --alert: #FF3B5C; --frost: #C8D6F0; --slate: #4A6080;
          `}
        }
        body { font-weight: 600; }
        .font-display { font-family: 'Space Grotesk', sans-serif; font-weight: 800; }
        .font-mono { font-family: 'JetBrains Mono', monospace; font-weight: 800; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(1000%); } }
        .glass-panel { background: rgba(15, 23, 36, 0.6); backdrop-filter: blur(12px); border: 1px solid var(--elevated); }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}} />

      <TickerStrip />

      {/* ── HERO PITCH (Visible before deployment) ── */}
      {appState === "pitch" && (
        <div className="relative w-full min-h-[85vh] flex flex-col justify-center animate-[slideUp_0.5s_ease-out]">
          <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
            <div className="w-full h-full overflow-hidden relative">
                <MapCanvas hotspots={cityData.hotspots} cityStats={cityData.cityStats} dispatched={[]} mode="hero" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--abyss)] via-[var(--abyss)] to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--abyss)] to-transparent" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-8 w-full">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--alert)]/20 border border-[var(--alert)]/50 flex items-center justify-center">
                  <ShieldAlert className="text-[var(--alert)] w-5 h-5" />
                </div>
                <span className="font-display tracking-[0.2em] text-[var(--slate)] text-base uppercase font-bold">
                  System Critical Alert
                </span>
              </div>
              
              <h1 className="font-display text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight text-white">
                <span className="text-[var(--alert)] drop-shadow-[0_0_30px_rgba(255,59,92,0.4)]">
                  {cityData.cityStats.totalDelayHrs.toLocaleString()} HOURS
                </span><br/>
                OF CITY-WIDE GRIDLOCK.<br/>
                <span className="text-[var(--slate)]">EVERY SINGLE WEEK.</span>
              </h1>
              
              <p className="text-2xl text-[var(--slate)] font-display max-w-2xl leading-relaxed mb-10">
                Reactive patrol routing fails to account for spatial cascading and marginal returns. 
                We don't need more tow trucks. We need <strong className="text-[var(--frost)] font-bold">Predictive Operations Research</strong>.
              </p>

              <button 
                onClick={() => document.getElementById('command-interface')?.scrollIntoView({ behavior: 'smooth' })}
                className="group relative inline-flex items-center gap-4 px-8 py-5 bg-[var(--signal)]/10 border border-[var(--signal)]/50 rounded-lg font-display text-[var(--signal)] text-lg tracking-[0.15em] uppercase font-bold overflow-hidden transition-all hover:bg-[var(--signal)]/20 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,229,160,0.3)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--signal)]/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                <Zap className="w-6 h-6" />
                Initialize Tactical Command
                <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* 9 Pillars Rail */}
          <div className="absolute bottom-0 left-0 w-full bg-[var(--surface)]/80 backdrop-blur-md border-y border-[var(--elevated)] py-6 z-20">
            <div className="max-w-7xl mx-auto px-8">
              <div className="text-xs text-[var(--slate)] font-display uppercase tracking-[0.2em] mb-4 font-bold">The 9-Pillar Architecture</div>
              <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 cursor-grab active:cursor-grabbing snap-x">
                {PILLARS.map((p, i) => (
                  <div key={i} className="snap-start shrink-0 w-80 bg-[var(--abyss)] border border-[var(--elevated)] rounded-xl p-6 hover:border-[var(--signal)]/50 transition-colors">
                    <p.icon className="w-7 h-7 text-[var(--signal)] mb-4" />
                    <h3 className="font-display font-bold text-lg mb-2">{p.title}</h3>
                    <p className="text-sm text-[var(--slate)] leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TACTICAL COMMAND INTERFACE ── */}
      <div id="command-interface" className="max-w-[1800px] mx-auto p-4 md:p-8 min-h-screen pt-12">
        
        {/* Top Command Bar (Replaces Sidebar) */}
        <div className="glass-panel rounded-xl p-6 mb-8 relative z-30">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="flex items-center gap-4">
                <button 
                onClick={() => setIsLightMode(!isLightMode)}
                className="p-3 rounded-xl border border-[var(--elevated)] bg-[var(--abyss)] hover:bg-[var(--elevated)] transition-colors text-[var(--slate)] hover:text-[var(--signal)] shrink-0"
                title="Toggle Theme"
                >
                {isLightMode ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:flex gap-6 flex-1 items-center">
              <div className="flex flex-col w-full lg:w-auto">
                <div className="text-xs text-[var(--slate)] font-display uppercase tracking-widest mb-2 font-bold">Time Block</div>
                <select 
                  value={timeBlock} 
                  onChange={e => { setTimeBlock(e.target.value); setAppState("pitch"); }}
                  className="w-full lg:w-48 bg-[var(--abyss)] border border-[var(--elevated)] rounded-md px-4 py-3 text-base font-mono focus:border-[var(--signal)] outline-none"
                >
                  {TIME_BLOCKS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              
              <div className="flex flex-col w-full lg:w-auto px-4 lg:border-l border-[var(--elevated)]">
                <div className="flex justify-between items-baseline mb-2">
                  <div className="text-xs text-[var(--slate)] font-display uppercase tracking-widest font-bold">Officers</div>
                  <div className="font-mono font-extrabold text-xl text-[var(--signal)]">{officers}</div>
                </div>
                <input 
                  type="range" min={1} max={20} value={officers}
                  onChange={e => { setOfficers(+e.target.value); setAppState("pitch"); }}
                  className="w-full h-2 bg-[var(--elevated)] rounded-full appearance-none cursor-pointer accent-[var(--signal)]"
                />
              </div>

              <div className="flex flex-col w-full lg:w-auto px-4 lg:border-l border-[var(--elevated)]">
                <div className="flex justify-between items-baseline mb-2">
                  <div className="text-xs text-[var(--slate)] font-display uppercase tracking-widest font-bold">Grav Alpha</div>
                  <div className="font-mono font-extrabold text-lg text-[var(--signal)]">{alpha.toFixed(1)}</div>
                </div>
                <input 
                  type="range" min={0.5} max={2.0} step={0.1} value={alpha}
                  onChange={e => { setAlpha(+e.target.value); setAppState("pitch"); }}
                  className="w-full h-2 bg-[var(--elevated)] rounded-full appearance-none cursor-pointer accent-[var(--signal)]"
                />
              </div>

              <div className="flex flex-col w-full lg:w-auto px-4 lg:border-l border-[var(--elevated)]">
                <div className="flex justify-between items-baseline mb-2">
                  <div className="text-xs text-[var(--slate)] font-display uppercase tracking-widest font-bold">Urg Lambda</div>
                  <div className="font-mono font-extrabold text-lg text-[var(--signal)]">{lambda.toFixed(2)}</div>
                </div>
                <input 
                  type="range" min={0} max={0.5} step={0.05} value={lambda}
                  onChange={e => { setLambda(+e.target.value); setAppState("pitch"); }}
                  className="w-full h-2 bg-[var(--elevated)] rounded-full appearance-none cursor-pointer accent-[var(--signal)]"
                />
              </div>

              <div className="flex flex-col gap-4 px-4 lg:border-l border-[var(--elevated)] col-span-2 md:col-span-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={enableCritical} onChange={e => {setEnableCritical(e.target.checked); setAppState("pitch")}} className="hidden" />
                  <div className="w-10 h-5 bg-[var(--abyss)] border border-[var(--elevated)] rounded-full relative transition-colors group-hover:border-[#FF3B5C]">
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#FF3B5C] transition-transform ${enableCritical ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm font-display text-[var(--slate)] uppercase tracking-wider font-bold">Hospitals/Schools</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={enableEvents} onChange={e => {setEnableEvents(e.target.checked); setAppState("pitch")}} className="hidden" />
                  <div className="w-10 h-5 bg-[var(--abyss)] border border-[var(--elevated)] rounded-full relative transition-colors group-hover:border-[#FF8C00]">
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#FF8C00] transition-transform ${enableEvents ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm font-display text-[var(--slate)] uppercase tracking-wider font-bold">Event Overlays</span>
                </label>
              </div>
            </div>

            <button 
              onClick={handleDeploy}
              disabled={appState === "analyzing"}
              className="w-full lg:w-auto shrink-0 px-8 py-4 bg-[var(--signal)]/10 border border-[var(--signal)] rounded-lg font-display text-[var(--signal)] text-base tracking-[0.1em] uppercase font-bold transition-all hover:bg-[var(--signal)]/20 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {appState === "analyzing" ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Crosshair className="w-5 h-5" />
              )}
              {appState === "analyzing" ? "Solving ILP..." : "Execute Dispatch"}
            </button>
          </div>
        </div>

        {/* Main Split View */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Left/Center: Radar Map */}
          <div className="xl:col-span-2 glass-panel rounded-xl overflow-hidden relative min-h-[600px] max-h-[800px]">
            <div className="absolute top-4 left-4 z-10 bg-[var(--abyss)]/90 border border-[var(--elevated)] rounded-md px-4 py-2 font-display text-xs text-[var(--slate)] uppercase tracking-widest flex items-center gap-2 backdrop-blur-sm font-bold">
              <MapIcon className="w-4 h-4" /> Tactical Deployment Radar (Pan & Zoom)
            </div>
            
            {appState === "analyzing" && (
              <div className="absolute inset-0 z-20 bg-[var(--abyss)]/80 backdrop-blur-sm flex flex-col items-center justify-center sticky top-0 left-0 w-full h-full pointer-events-none">
                <div className="w-full absolute inset-0 overflow-hidden">
                  <div className="w-full h-1 bg-[var(--signal)]/50 shadow-[0_0_20px_var(--signal)] animate-[scanline_2s_linear_infinite]" />
                </div>
                <div className="font-mono text-sm text-[var(--slate)] flex flex-col gap-4 max-w-sm w-full font-bold">
                  {SPINNER_STEPS.slice(0, spinnerStep + 1).map((step, i) => (
                    <div key={i} className={"flex items-center gap-3 " + (i === spinnerStep ? "text-[var(--signal)]" : "opacity-50")}>
                      {i === spinnerStep ? <RefreshCw className="w-4 h-4 animate-spin" /> : "✓"}
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <MapCanvas hotspots={cityData.hotspots} cityStats={cityData.cityStats} dispatched={dispatched} mode={appState === "deployed" ? "tactical" : "hero"} />
            
            {/* Map Legend */}
            <div className="absolute bottom-4 left-4 z-10 bg-[var(--abyss)]/90 border border-[var(--elevated)] rounded-md p-4 flex flex-col gap-3 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-3 text-xs text-[var(--slate)] font-display uppercase tracking-wider font-bold"><div className="w-3 h-3 rounded-full bg-[var(--alert)]" /> Critical Node</div>
              <div className="flex items-center gap-3 text-xs text-[var(--slate)] font-display uppercase tracking-wider font-bold"><div className="w-3 h-3 rounded-full bg-[var(--signal)]" /> Dispatched</div>
              <div className="flex items-center gap-3 text-xs text-[var(--slate)] font-display uppercase tracking-wider font-bold"><div className="w-3 h-3 rounded-full bg-[#FFB800]" /> Central Depot</div>
            </div>
          </div>

          {/* Right: Operations Manifest */}
          <div className="glass-panel rounded-xl p-6 flex flex-col max-h-[800px]">
            <div className="font-display text-xs text-[var(--slate)] uppercase tracking-widest border-b border-[var(--elevated)] pb-4 mb-6 flex items-center justify-between font-bold">
              <span>Operations Manifest</span>
              {appState === "deployed" && <span className="text-[var(--signal)]">OPTIMIZED</span>}
            </div>

            {appState === "pitch" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                <AlertTriangle className="w-12 h-12 text-[var(--slate)] mb-4" />
                <p className="font-display text-base font-bold">Awaiting Dispatch Execution.<br/>System Online.</p>
              </div>
            )}

            {appState === "deployed" && dispatchResults && (
              <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-4 animate-[slideUp_0.4s_ease-out]">
                {/* Roll-down metrics */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-[var(--abyss)] border border-[var(--elevated)] rounded-lg p-4">
                    <div className="text-[10px] text-[var(--slate)] font-display uppercase tracking-widest mb-1 font-bold">Delay Cleared</div>
                    <div className="font-mono text-3xl font-extrabold text-[var(--signal)]">{(dispatchResults.metrics.total_delay_cleared/60).toFixed(1)}h</div>
                  </div>
                  <div className="bg-[var(--abyss)] border border-[var(--elevated)] rounded-lg p-4">
                    <div className="text-[10px] text-[var(--slate)] font-display uppercase tracking-widest mb-1 font-bold">Efficiency Rate</div>
                    <div className="font-mono text-3xl font-extrabold text-[var(--frost)]">{dispatchResults.metrics.pct_cleared.toFixed(1)}%</div>
                  </div>
                </div>

                {dispatchResults.routes.map((h, i) => (
                  <div key={`${h.id}-${i}`} className="bg-[var(--abyss)] border border-[var(--elevated)] border-l-4 border-l-[var(--signal)] rounded-lg p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div className="font-mono text-base font-bold text-[var(--frost)]">Off #{h.officer_id + 1} Stop #{h.route_sequence} — HS-{h.id}</div>
                      <div className="text-[10px] px-2 py-1 rounded border border-[#FF3B5C]/30 text-[#FF3B5C] bg-[#FF3B5C]/10 font-display uppercase tracking-wider font-bold">{h.tag?.split(" ")[1] || h.tag || "Normal"}</div>
                    </div>
                    <div className="font-mono text-4xl font-extrabold text-[var(--signal)] leading-none mb-4">
                      {h.delay.toLocaleString()} <span className="text-xs text-[var(--slate)] font-normal">MINS</span>
                    </div>
                    
                    {/* Explainable Context Badges */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {h.critical && <span className="text-[10px] px-2 py-1 rounded border border-[#FF3B5C] text-[#FF3B5C] bg-[#FF3B5C]/10 font-display uppercase font-bold">{h.critical}</span>}
                      {h.event && <span className="text-[10px] px-2 py-1 rounded border border-[#FF8C00] text-[#FF8C00] bg-[#FF8C00]/10 font-display uppercase font-bold">{h.event}</span>}
                      <span className="text-[10px] px-2 py-1 rounded border border-[var(--slate)] text-[var(--slate)] bg-[var(--elevated)] font-mono font-bold">{h.cost} Officer(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Analytics (Digital Twin + Pareto) */}
        {appState === "deployed" && dispatchResults && (
          <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-8 animate-[slideUp_0.6s_ease-out]">
            
            {/* Digital Twin */}
            <div className="glass-panel rounded-xl p-8">
              <div className="font-display text-xs text-[var(--slate)] uppercase tracking-widest border-b border-[var(--elevated)] pb-4 mb-8 flex items-center gap-3 font-bold">
                <Cpu className="w-5 h-5" /> Digital Twin — Marginal Gain Forecaster
              </div>
              <div className="grid grid-cols-3 gap-6 mb-8">
                {twinData.map((t) => {
                  let status = "🔴 DIMINISHING";
                  let color = "var(--alert)";
                  if (t.me >= thetaH) { status = "🟢 HIGH ROI"; color = "var(--signal)"; }
                  else if (t.me >= thetaL) { status = "🟡 MODERATE"; color = "#FFB800"; }

                  return (
                    <div key={t.n} className="bg-[var(--abyss)] border border-[var(--elevated)] rounded-lg p-5" style={{ borderTop: `4px solid ${color}` }}>
                      <div className="font-display text-xs text-[var(--slate)] uppercase tracking-widest mb-3 font-bold">+{t.n} Officer(s)</div>
                      <div className="font-mono text-4xl font-extrabold mb-2" style={{ color }}>+{t.delta}</div>
                      <div className="font-mono text-xs text-[var(--slate)] mb-4 font-bold">{t.me.toFixed(1)} min/officer</div>
                      <div className="inline-block px-3 py-1.5 rounded text-[10px] font-display uppercase tracking-wider font-extrabold" style={{ color, background: `${color}20` }}>{status}</div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-[var(--signal)]/10 border border-[var(--signal)]/30 rounded-lg p-5 flex gap-4">
                <Crosshair className="text-[var(--signal)] shrink-0 w-6 h-6" />
                <p className="font-display text-base text-[var(--frost)] leading-relaxed font-bold">
                  <strong>Simulation Complete.</strong> Displaying real-time forecast for increasing budget by 1, 2, or 3 officers to capture remaining delay in this time block.
                </p>
              </div>
            </div>

            {/* Chronic Registry Snippet */}
            <div className="glass-panel rounded-xl p-8">
              <div className="font-display text-xs text-[var(--slate)] uppercase tracking-widest border-b border-[var(--elevated)] pb-4 mb-8 flex items-center gap-3 font-bold">
                <BarChart2 className="w-5 h-5" /> Chronic Registry (17-Week Trend)
              </div>
              <div className="space-y-4">
                {CHRONIC_REGISTRY.slice(0,4).map(r => (
                  <div key={r.id} className="bg-[var(--abyss)] border border-[var(--elevated)] rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="font-mono text-2xl font-extrabold text-[var(--slate)]">0{r.rank}</div>
                      <div>
                        <div className="font-mono font-extrabold text-lg text-[var(--frost)]">HS-{String(r.id).padStart(3,"0")}</div>
                        <div className="font-display text-xs text-[var(--alert)] uppercase tracking-widest font-bold">{r.violations.toLocaleString()} Violations</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-extrabold text-[var(--frost)]">{(r.conf*100).toFixed(0)}% Conf</div>
                      <div className="font-display text-[10px] text-[var(--slate)] uppercase tracking-widest font-bold">Recommend: 🚧 Barricade</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
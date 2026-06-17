import React, { useState, useEffect, useRef } from "react";
import { 
  ShieldAlert, Activity, Cpu, Map as MapIcon, Layers, 
  Crosshair, GitMerge, TrendingUp, AlertTriangle, Zap,
  ChevronRight, RefreshCw, BarChart2, Sun, Moon,
  Clock, Server
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';

// ─── STATIC CONSTANTS ────────────────────────────────────────────────────────

const POIS = [
  { name: "Victoria General", lat: 12.9634, lon: 77.5755, type: "hospital", icon: "🏥" },
  { name: "Manipal Lifeline", lat: 12.9592, lon: 77.6406, type: "hospital", icon: "🏥" },
  { name: "St. Joseph's Academy", lat: 12.9674, lon: 77.6006, type: "school", icon: "🏫" }
];

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function clamp(val: number, min: number, max: number) { return Math.min(Math.max(val, min), max); }

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function StatusStrip({ appState }: { appState: string }) {
  let cls = "idle";
  let statusText = "SYSTEM ONLINE // WAITING FOR DISPATCH COMMAND";
  if (appState === "analyzing") { cls = "running"; statusText = "SOLVING INTEGER LINEAR PROGRAM (CBC) // CALCULATING ROUTES..."; }
  if (appState === "deployed") { cls = "complete"; statusText = "TACTICAL MANIFEST OPTIMIZED // DISPATCH READY"; }

  return (
    <div className={`status-strip ${cls}`}>
      <div><span className="status-dot" /> {statusText}</div>
      <div className="flex items-center gap-4">
        <span><Server className="w-3 h-3 inline mr-1" /> FASTAPI 8001</span>
        <span>ILP_CBC_V2.10.10</span>
      </div>
    </div>
  );
}

function TopBar({ cityStats, appState }: { cityStats: any, appState: string }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!cityStats) return <div className="topbar">Loading...</div>;

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo"><ShieldAlert className="w-5 h-5 text-white" /></div>
        <div>
          <div className="topbar-title">Predictive Parking Command</div>
          <div className="topbar-sub">Digital Twin + Operations Research</div>
        </div>
      </div>

      <div className="topbar-trauma">
        <div className="trauma-counter">
          <span className="tc-label">ACTIVE HOTSPOTS:</span>
          <span className="tc-value">{cityStats.totalHotspots}</span>
        </div>
        <div className="trauma-counter">
          <span className="tc-label">WEEKLY DELAY:</span>
          <span className="tc-value">{cityStats.totalDelayHrs.toLocaleString()} HR</span>
        </div>
        <div className="trauma-counter">
          <span className="tc-label">CHRONIC OFFENDERS:</span>
          <span className="tc-value">{cityStats.chronicOffenders}</span>
        </div>
      </div>

      <div className="topbar-clock">
        <div className="live-dot" />
        {time.toISOString().split('T')[0]} {time.toTimeString().split(' ')[0]} LCL
      </div>
    </div>
  );
}

function TickerStrip({ cityData }: { cityData: any }) {
  const topHotspots = [...(cityData?.hotspots || [])]
    .sort((a, b) => b.delay - a.delay)
    .slice(0, 10);
    
  const items = [...topHotspots, ...topHotspots, ...topHotspots];
  
  return (
    <div className="ticker-wrap">
      <div className="ticker-inner">
        {items.map((item, i) => {
          const status = item.delay > 1000 ? "CRITICAL" : (item.delay > 300 ? "HIGH" : "ACTIVE");
          let dotColor = status === "CRITICAL" ? "var(--alert)" : status === "HIGH" ? "var(--amber)" : "var(--signal)";
          return (
            <div key={i} className="ticker-item">
              <span className="ticker-dot" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
              <span className="ticker-id">HS-{String(item.id).padStart(3,"0")}</span>
              <span className="ticker-block">LIVE</span>
              <span className="ticker-delay" style={{ color: dotColor }}>{Math.round(item.delay).toLocaleString()} MIN</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAP CANVAS ───────────────────────────────────────────────────────────────
function MapCanvas({ hotspots, dispatched, appState, routes }: { hotspots: any[], dispatched: number[], appState: string, routes: any[] }) {
  const DEPOT: [number, number] = [12.9815, 77.5946];

  return (
    <div className="absolute inset-0 w-full h-full">
      <MapContainer center={DEPOT} zoom={12} zoomControl={false} className="w-full h-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
        />

        {/* Polylines for routes */}
        {appState === "deployed" && routes?.map((h, i) => {
          const prev = i === 0 || routes[i-1].officer_id !== h.officer_id 
                        ? DEPOT 
                        : [routes[i-1].lat, routes[i-1].lon] as [number, number];
          return (
            <Polyline 
              key={`route-${h.id}-${i}`}
              positions={[prev, [h.lat, h.lon]]}
              color="#00E5A0" weight={2} opacity={0.6}
              className="animated-route"
            />
          );
        })}

        {/* Hospitals & Schools */}
        {POIS.map((poi, i) => (
          <Marker key={`poi-${i}`} position={[poi.lat, poi.lon]} icon={L.divIcon({
            className: 'custom-pulse-icon',
            html: `<div style="font-size: 20px; text-shadow: 0 0 10px rgba(255,255,255,0.5);">${poi.icon}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })}>
            <Tooltip direction="top" offset={[0, -10]}>
              <div className="mono text-xs font-bold">{poi.name}</div>
            </Tooltip>
          </Marker>
        ))}

        {/* Hotspots */}
        {hotspots.map(h => {
          const maxDelay = Math.max(...hotspots.map(h => h.delay));
          const isDispatched = dispatched.includes(h.id);
          const isWorst = h.delay === maxDelay && maxDelay > 0;
          let color = "#FF3B5C"; // Pink/Red default
          if (isWorst) color = "#FF0000"; // Deep Red for critical
          else if (h.delay > 300) color = "#FFB800"; // Orange/Amber
          
          if (isDispatched) color = "#00E5A0"; // Signal Green if handled

          const baseRadius = isDispatched ? 8 : Math.min(Math.max(6 + h.delay / 500, 6), 18);

          return (
            <React.Fragment key={h.id}>
              {/* Sonar Rings for Worst Hotspot */}
              {isWorst && !isDispatched && (
                <Marker position={[h.lat, h.lon]} icon={L.divIcon({
                  className: 'custom-pulse-icon',
                  html: `<div class="pulse-circle" style="width: 100px; height: 100px; background-color: rgba(255,0,0,0.3); border-radius: 50%;"></div>`,
                  iconSize: [100, 100],
                  iconAnchor: [50, 50]
                })} />
              )}

              {/* Cleared Zone glow for dispatched items */}
              {isDispatched && (
                <Circle center={[h.lat, h.lon]} radius={500} pathOptions={{ color: 'transparent', fillColor: '#00E5A0', fillOpacity: 0.15 }} />
              )}

              <CircleMarker
                center={[h.lat, h.lon]}
                radius={baseRadius}
                pathOptions={{
                  color: isDispatched ? '#fff' : color,
                  weight: isDispatched ? 2 : 0,
                  fillColor: color,
                  fillOpacity: isDispatched ? 1 : 0.8,
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <div className="mono" style={{ fontSize: '10px' }}>
                    <strong>HS-{h.id}</strong><br/>
                    Delay: {h.delay} mins<br/>
                    {isDispatched && "✅ DISPATCHED"}
                  </div>
                </Tooltip>
              </CircleMarker>

              {/* Text label for major hotspots */}
              {h.delay > 1000 && !isDispatched && (
                <Marker position={[h.lat, h.lon]} icon={L.divIcon({
                  className: 'custom-pulse-icon',
                  html: `<div style="color:${color}; font-family: 'JetBrains Mono'; font-size: 10px; font-weight: 700; text-shadow: 0 0 4px #000; margin-left: 15px; margin-top: -10px;">${h.delay}m</div>`
                })} />
              )}
            </React.Fragment>
          );
        })}

        {/* Depot */}
        <CircleMarker center={DEPOT} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#FFB800', fillOpacity: 1 }}>
            <Tooltip permanent direction="bottom" offset={[0, 10]} className="bg-transparent border-none text-[#FFB800] font-bold shadow-none text-xs">HQ</Tooltip>
        </CircleMarker>

      </MapContainer>
    </div>
  );
}

// ─── BOOT SEQUENCE ──────────────────────────────────────────────────────────────
const BootSequence = () => {
  const [lines, setLines] = React.useState<string[]>([]);
  const text = [
    "INITIALIZING PREDICTIVE PARKING COMMAND CENTER...",
    "TEAM: DESOLATE ERA | FLIPKART GRiD THEME 1",
    "--------------------------------------------------",
    "ARCHITECTURE BOOT SEQUENCE INITIATED.",
    "Target: Bengaluru Traffic Grid (484 active nodes)",
    "Engine: PuLP Integer Linear Programming (ILP)",
    "Routing: Gravity-Based Heuristic (Distance Decay)",
    "--------------------------------------------------",
    "Connecting to Hugging Face Operations Research Engine...",
    "Provisioning 16GB RAM / 2 vCPUs for spatial clustering.",
    "Please stand by. Handshake in progress...",
  ];

  React.useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) { setLines(p => [...p, text[i]]); i++; }
      else clearInterval(interval);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#080C14] flex flex-col items-center justify-center font-mono p-6">
      <div className="w-full max-w-2xl bg-[#0F1724] border border-[#1A2540] rounded-lg shadow-[0_0_40px_rgba(0,229,160,0.1)]">
        <div className="flex items-center px-4 py-2 bg-[#0A1020] border-b border-[#1A2540] gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div><div className="w-3 h-3 rounded-full bg-yellow-500"></div><div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="ml-4 text-[10px] text-slate-500 tracking-widest uppercase">Desolate_Era_OS_v2.4</span>
        </div>
        <div className="p-6 min-h-[300px] text-[13px] text-[#00E5A0] leading-relaxed">
          {lines.map((l, idx) => <div key={idx} className={l.includes('DESOLATE') ? 'text-white font-bold' : ''}>{l}</div>)}
          <div className="mt-4 flex items-center gap-3 text-[#C8D6F0] opacity-70">
            <div className="w-4 h-4 border-2 border-slate-500 border-t-[#00E5A0] rounded-full animate-spin"></div>
            <span className="text-[11px] uppercase tracking-widest animate-pulse">Awaiting Server Handshake...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN APPLICATION ─────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("idle"); // idle | analyzing | deployed
  const [cityData, setCityData] = useState<any>(null);
  const [dispatchResults, setDispatchResults] = useState<any>(null);
  
  // Controls
  const [timeBlock, setTimeBlock] = useState("");
  const [officers, setOfficers] = useState(5);
  const [alpha, setAlpha] = useState(1.0);
  const [lambda, setLambda] = useState(0.15);
  const [enableCritical, setEnableCritical] = useState(false);
  const [enableEvents, setEnableEvents] = useState(false);
  
  // Visual state
  const [dispatched, setDispatched] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  useEffect(() => {
    fetch('https://heavenlydem0n-desolate-era-os.hf.space/api/vitals')
      .then(res => res.json())
      .then(data => {
        setCityData(data);
        if (data.time_blocks && data.time_blocks.length > 0) {
          setTimeBlock(data.time_blocks[0]);
        }
      })
      .catch(err => console.error("API Error", err));
  }, []);

  async function handleDeploy() {
    if (appState === "analyzing") return;
    setAppState("analyzing");
    setSpinnerStep(0);
    
    const interval = setInterval(() => {
      setSpinnerStep(s => (s < SPINNER_STEPS.length - 1 ? s + 1 : s));
    }, 400);

    try {
      const res = await fetch('https://heavenlydem0n-desolate-era-os.hf.space/api/dispatch', {
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
        setAppState("idle");
        return;
      }

      setTimeout(() => {
        setDispatchResults(data);
        setDispatched(data.dispatched_ids);
        setAppState("deployed");
      }, 500);

    } catch (err) {
      clearInterval(interval);
      setAppState("idle");
    }
  }

  if (!cityData) {
    return <BootSequence />;
  }

  const twinData = dispatchResults?.twin_data || [];
  const metrics = dispatchResults?.metrics || null;
  const routes = dispatchResults?.routes || [];

  return (
    <div>
      <StatusStrip appState={appState} />
      <TopBar cityStats={cityData.cityStats} appState={appState} />
      <TickerStrip cityData={cityData} />

      <div className="main-grid">
        {/* LEFT COLUMN: Map & Controls */}
        <div className="flex flex-col gap-4">
          <div className="control-bar rounded-lg">
            {/* Zone 1 */}
            <div className="ctrl-zone">
              <div>
                <div className="ctrl-field-label">Time Block</div>
                <select className="ctrl-select" value={timeBlock} onChange={e => { setTimeBlock(e.target.value); setAppState("idle"); }}>
                  {cityData?.time_blocks?.length ? (
                    cityData.time_blocks.map((t: string) => <option key={t} value={t}>{t}</option>)
                  ) : (
                    <option value="">Loading...</option>
                  )}
                </select>
              </div>
            </div>
            
            {/* Zone 2 */}
            <div className="ctrl-zone" style={{ flex: 2 }}>
              <div>
                <div className="ctrl-field-label">Officers Available</div>
                <div className="flex items-end gap-3">
                  <div className="ctrl-big-value">{String(officers).padStart(2,'0')}</div>
                  <input type="range" min="1" max="20" value={officers} onChange={e => { setOfficers(+e.target.value); setAppState("idle"); }} 
                         className="w-32 accent-[var(--signal)] mb-2" />
                </div>
              </div>
              <div className="ml-4">
                <button className="adv-expander" onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? "Hide Routing Logic" : "Advanced Routing Logic"}
                </button>
              </div>

              {showAdvanced && (
                <div className="flex gap-6 ml-4 animate-[fadeUp_0.2s_ease-out]">
                  <div>
                    <div className="ctrl-field-label">Gravity Alpha</div>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={alpha} onChange={e => { setAlpha(+e.target.value); setAppState("idle"); }} className="w-20 accent-[var(--signal)]" />
                  </div>
                  <div>
                    <div className="ctrl-field-label">Urgency Lambda</div>
                    <input type="range" min="0.0" max="0.5" step="0.05" value={lambda} onChange={e => { setLambda(+e.target.value); setAppState("idle"); }} className="w-20 accent-[var(--signal)]" />
                  </div>
                  <div className="flex flex-col gap-2 mt-1">
                    <label className="checkbox-container">
                      <input type="checkbox" checked={enableCritical} onChange={e => {setEnableCritical(e.target.checked); setAppState("idle")}} />
                      <span className="checkbox-custom"></span>
                      <span className="ctrl-field-label !mb-0 text-white">HOSPITALS/SCHOOLS</span>
                    </label>
                    <label className="checkbox-container">
                      <input type="checkbox" checked={enableEvents} onChange={e => {setEnableEvents(e.target.checked); setAppState("idle")}} />
                      <span className="checkbox-custom"></span>
                      <span className="ctrl-field-label !mb-0 text-white">EVENT OVERLAYS</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Zone 3 */}
            <div className="ctrl-zone border-none">
              <button 
                className={`execute-btn ${appState === "analyzing" ? "solving" : ""} ${appState === "deployed" ? "done" : ""}`}
                onClick={handleDeploy}
                disabled={appState === "analyzing"}
              >
                {appState === "analyzing" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                {appState === "analyzing" ? "SOLVING..." : appState === "deployed" ? "RE-CALCULATE" : "EXECUTE DISPATCH"}
              </button>
            </div>
          </div>

          <div className="map-panel">
            <div className="map-header">
              <MapIcon className="w-3 h-3 inline mr-2" /> Live Tactical Radar
            </div>
            <div className="map-legend">
              <div className="legend-item"><div className="legend-dot bg-[#FF0000]" /> Critical Node (&gt;1000m)</div>
              <div className="legend-item"><div className="legend-dot bg-[#FFB800]" /> Warning Node (&gt;300m)</div>
              <div className="legend-item"><div className="legend-dot bg-[#00E5A0]" /> Cleared / Dispatched</div>
              <div className="legend-item"><div className="legend-dot bg-[#fff]" /> HQ Depot</div>
            </div>

            {appState === "analyzing" && (
              <div className="absolute inset-0 z-[1001] bg-[var(--abyss)]/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
                <div className="solver-spinner mb-6"></div>
                <div className="max-w-xs w-full bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                  <div className="solver-log">
                    {SPINNER_STEPS.map((step, i) => {
                       if (i > spinnerStep) return null;
                       const isActive = i === spinnerStep;
                       return (
                         <div key={i} className={`solver-log-item ${isActive ? "active" : "done"}`}>
                           <span className="sl-icon">{isActive ? ">" : "✓"}</span> {step}
                         </div>
                       );
                    })}
                  </div>
                </div>
              </div>
            )}

            <MapCanvas hotspots={cityData.hotspots} dispatched={dispatched} appState={appState} routes={routes} />
          </div>
        </div>

        {/* RIGHT COLUMN: Manifest */}
        <div className="manifest-panel">
          <div className="manifest-header">
            <div className="manifest-title">Operations Manifest</div>
            <div className={`manifest-status-badge ${appState === "deployed" ? "badge-optimized" : "badge-idle"}`}>
              {appState === "deployed" ? "OPTIMIZED" : "AWAITING PARAMS"}
            </div>
          </div>

          <div className="impact-grid">
            <div className="impact-cell">
              <div className="impact-label">Delay Cleared</div>
              <div className="impact-value text-[var(--signal)]">{metrics ? (metrics.total_delay_cleared/60).toFixed(1) : "0.0"} <span className="text-sm font-normal text-[var(--slate)]">HR</span></div>
            </div>
            <div className="impact-cell">
              <div className="impact-label">Efficiency Rate</div>
              <div className="impact-value text-white">{metrics ? metrics.pct_cleared.toFixed(1) : "0.0"} <span className="text-sm font-normal text-[var(--slate)]">%</span></div>
            </div>
            <div className="impact-cell">
              <div className="impact-label">Unmanaged</div>
              <div className="impact-value text-[var(--alert)]">{metrics ? (metrics.unmanaged_delay/60).toFixed(1) : "0.0"} <span className="text-sm font-normal text-[var(--slate)]">HR</span></div>
            </div>
            <div className="impact-cell">
              <div className="impact-label">Hotspots Cleared</div>
              <div className="impact-value text-[var(--amber)]">{dispatched.length} <span className="text-sm font-normal text-[var(--slate)]">NODES</span></div>
            </div>
          </div>

          {appState === "idle" && (
            <div className="manifest-empty">
              <AlertTriangle className="icon" />
              <div className="title">NO ACTIVE MANIFEST</div>
              <div className="sub">Adjust parameters and Execute Dispatch to generate knapsack-optimized patrol routes.</div>
            </div>
          )}

          {appState === "analyzing" && (
            <div className="manifest-solving">
              <Activity className="icon text-[var(--signal)] w-8 h-8 animate-pulse" />
              <div className="text-[10px] mono text-[var(--slate)]">Processing ILP Matrix...</div>
            </div>
          )}

          {appState === "deployed" && (
            <div className="manifest-scroll">
              {routes.map((h, i) => (
                <div key={`${h.id}-${i}`} className="manifest-row" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="manifest-bar" />
                  <div className="manifest-content">
                    <div className="manifest-row-top">
                      <div>
                        <div className="manifest-stop-id">OFFICER 0{h.officer_id + 1} — STOP 0{h.route_sequence}</div>
                        <div className="manifest-hs-id">HS-{String(h.id).padStart(3,"0")}</div>
                      </div>
                      <div className="manifest-badges">
                        {h.critical && <span className="badge badge-critical">{h.critical.split(" ")[1]}</span>}
                        {h.event && <span className="badge badge-event">{h.event.split(" ")[1]}</span>}
                        {h.tag?.includes("Repeat") ? <span className="badge badge-repeat">CHRONIC</span> : <span className="badge badge-anomaly">ANOMALY</span>}
                      </div>
                    </div>
                    <div className="manifest-delay">{h.delay.toLocaleString()}<span>MINS</span></div>
                    
                    <div className="p-bar-wrap">
                      <div className="p-bar-fill" style={{ width: `${Math.min(100, (h.delay/6000)*100)}%` }} />
                    </div>
                    
                    <div className="manifest-meta">
                      <span>Conf: {(h.conf*100).toFixed(0)}%</span>
                      <span className="manifest-pscore">Cost: {h.cost}</span>
                      <span>Dist: {h.distance_from_prev_km}km</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM METRICS */}
      {appState === "deployed" && (
        <div className="bottom-grid animate-[fadeUp_0.5s_ease-out]">
          
          {/* DIGITAL TWIN */}
          <div className="panel">
            <div className="panel-header"><Cpu className="w-3 h-3 inline mr-2" /> Digital Twin — Marginal Gain Forecaster</div>
            <div className="twin-cards">
              {twinData.map((t: any) => {
                const maxME = Math.max(...twinData.map((d:any) => d.me), 1);
                const isHero = t.me >= maxME * 0.9;
                return (
                  <div key={t.n} className={`twin-card ${isHero ? 'hero' : ''}`}>
                    {isHero && <div className="twin-hero-tag">Best ROI</div>}
                    <div className="twin-n">+{t.n} OFFICER{t.n > 1 ? 'S' : ''}</div>
                    <div className="twin-delta" style={{ color: isHero ? 'var(--signal)' : 'var(--frost)' }}>+{t.delta.toLocaleString()}<span>MIN</span></div>
                    <div className="twin-me">Yield: {t.me} min/off</div>
                    <div className="twin-sparkbar">
                      <div className="twin-sparkfill" style={{ width: `${(t.me/maxME)*100}%`, background: isHero ? 'var(--signal)' : 'var(--slate)' }} />
                    </div>
                    <div className="twin-label" style={{ 
                      color: isHero ? 'var(--signal)' : t.me >= maxME*0.5 ? 'var(--amber)' : 'var(--alert)',
                      background: isHero ? 'rgba(0,229,160,0.1)' : t.me >= maxME*0.5 ? 'rgba(255,184,0,0.1)' : 'rgba(255,59,92,0.1)'
                    }}>
                      {isHero ? 'RECOMMENDED' : t.me >= maxME*0.5 ? 'MODERATE' : 'DIMINISHING'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="briefing-card">
              <Crosshair className="briefing-icon text-[var(--signal)]" />
              <div>
                <div className="briefing-label">Commander Briefing</div>
                <div className="briefing-text">
                  Simulation complete. Adding <span className="hi">+{twinData.find((t:any)=>t.me === Math.max(...twinData.map((d:any)=>d.me)))?.n} officers</span> yields the highest marginal efficiency. Beyond this point, Pareto efficiency diminishes sharply.
                </div>
              </div>
            </div>
          </div>

          {/* CHRONIC REGISTRY */}
          <div className="panel">
            <div className="panel-header"><BarChart2 className="w-3 h-3 inline mr-2" /> Chronic Registry (17-Week Trend)</div>
            <div>
              {(cityData?.chronic_registry || []).slice(0, 4).map((r: any, i: number) => (
                <div key={r.id} className="registry-row">
                  <div className={`rank-medallion rank-${r.rank <= 3 ? r.rank : 'n'}`}>0{r.rank}</div>
                  <div className="registry-info">
                    <div className="registry-hs-id">HS-{String(r.id).padStart(3,"0")}</div>
                    <div className="registry-violations">{r.violations.toLocaleString()} VIOLATIONS</div>
                    
                    {/* SVG Sparkline Mockup */}
                    <div className="sparkline-wrap">
                      <svg width="120" height="18" viewBox="0 0 120 18" preserveAspectRatio="none">
                        <path d={`M0,15 Q10,${15 - Math.random()*10} 20,${15 - Math.random()*10} T40,${15 - Math.random()*10} T60,${15 - Math.random()*10} T80,${15 - Math.random()*10} T100,${15 - Math.random()*10} T120,4`} 
                              fill="none" stroke="var(--alert)" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="120" cy="4" r="2.5" fill="var(--alert)" />
                      </svg>
                    </div>

                    <div className="registry-streak">
                      <AlertTriangle className="w-2 h-2" /> 17 WEEKS CONSECUTIVE
                    </div>
                  </div>
                  <div className="registry-conf">
                    <div className="registry-conf-value text-[var(--frost)]">{(r.conf*100).toFixed(0)}%</div>
                    <div className="registry-conf-label">Confidence</div>
                    <div className={`registry-rec ${r.rec.includes("barricade") ? 'rec-barricade' : 'rec-patrol'}`}>
                      {r.rec.includes("barricade") ? "🚧 BARRICADE" : "🚓 PATROL SLOT"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
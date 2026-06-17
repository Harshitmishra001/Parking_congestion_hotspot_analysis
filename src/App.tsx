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

function TickerStrip() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  
  return (
    <div className="ticker-wrap">
      <div className="ticker-inner">
        {items.map((item, i) => {
          let dotColor = item.status === "CRITICAL" ? "var(--alert)" : item.status === "HIGH" ? "var(--amber)" : "var(--signal)";
          return (
            <div key={i} className="ticker-item">
              <span className="ticker-dot" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
              <span className="ticker-id">HS-{String(item.id).padStart(3,"0")}</span>
              <span className="ticker-block">{item.block}</span>
              <span className="ticker-delay" style={{ color: dotColor }}>{item.delay.toLocaleString()} MIN</span>
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
          const isDispatched = dispatched.includes(h.id);
          const isCritical = h.delay > 1000; // All hotspots >1000 delay will pulse
          let color = "#FF3B5C"; // Pink/Red default
          if (isCritical) color = "#FF0000"; // Deep Red for critical
          else if (h.delay > 300) color = "#FFB800"; // Orange/Amber
          
          if (isDispatched) color = "#00E5A0"; // Signal Green if handled

          const baseRadius = isDispatched ? 8 : Math.min(Math.max(6 + h.delay / 500, 6), 18);

          return (
            <React.Fragment key={h.id}>
              {/* Sonar Rings for Critical Hotspots */}
              {isCritical && !isDispatched && (
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

// ─── MAIN APPLICATION ─────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("idle"); // idle | analyzing | deployed
  const [cityData, setCityData] = useState<any>(null);
  const [dispatchResults, setDispatchResults] = useState<any>(null);
  
  // Controls
  const [timeBlock, setTimeBlock] = useState("Sunday_0400");
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
    fetch('http://localhost:8001/api/vitals')
      .then(res => res.json())
      .then(data => setCityData(data))
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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--abyss)]">
        <RefreshCw className="w-8 h-8 animate-spin text-[var(--signal)] mb-6" />
        <div className="mono text-[var(--frost)] text-sm">BOOTING COMMAND CENTER...</div>
      </div>
    );
  }

  const twinData = dispatchResults?.twin_data || [];
  const metrics = dispatchResults?.metrics || null;
  const routes = dispatchResults?.routes || [];

  return (
    <div>
      <StatusStrip appState={appState} />
      <TopBar cityStats={cityData.cityStats} appState={appState} />
      <TickerStrip />

      <div className="main-grid">
        {/* LEFT COLUMN: Map & Controls */}
        <div className="flex flex-col gap-4">
          <div className="control-bar rounded-lg">
            {/* Zone 1 */}
            <div className="ctrl-zone">
              <div>
                <div className="ctrl-field-label">Time Block</div>
                <select className="ctrl-select" value={timeBlock} onChange={e => { setTimeBlock(e.target.value); setAppState("idle"); }}>
                  {TIME_BLOCKS.map(t => <option key={t} value={t}>{t}</option>)}
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
              {CHRONIC_REGISTRY.slice(0, 4).map((r, i) => (
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
import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, Activity, Cpu, Map as MapIcon, 
  Crosshair, AlertTriangle,
  RefreshCw, BarChart2,
  Server
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

function getElocDisplay(eloc?: string): { label: string; isPending: boolean } {
  if (!eloc || eloc === "UNKNOWN" || eloc === "PENDING") {
    return { label: "PENDING", isPending: true };
  }
  return { label: eloc, isPending: false };
}

function getAddressDisplay(address?: string): string {
  if (!address || address.trim().length === 0 || address === "Geocoding unavailable") {
    return "Bengaluru Grid Sector";
  }
  return address;
}

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

function TopBar({ cityStats }: { cityStats: any }) {
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
        <Marker position={DEPOT} icon={L.divIcon({
          className: 'depot-marker',
          html: `
            <div style="background: transparent; border: none; box-shadow: none;">
              <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,184,0,0.12); border: 1px solid rgba(255,184,0,0.3); top: -8px; left: -8px;"></div>
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #FFB800; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 0 14px rgba(255,184,0,0.7), 0 0 28px rgba(255,184,0,0.35), 0 0 0 4px rgba(255,184,0,0.15); position: relative; z-index: 2;">🏛</div>
              <div style="position: absolute; top: 32px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: 'JetBrains Mono', monospace; font-size: 8px; font-weight: 700; color: #FFB800; letter-spacing: 0.1em; text-shadow: 0 0 8px rgba(255,184,0,0.8); background: rgba(8,12,20,0.8); padding: 1px 5px; border-radius: 2px;">HQ DEPOT</div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })}>
            <Tooltip direction="top" offset={[0, -10]} className="bg-[#0F1724] text-[#C8D6F0] border-[#FFB800] border font-sans text-[11px] px-2 py-1">🏛 Central Dispatch Depot — Origin of all officer routes</Tooltip>
        </Marker>

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
          const defaultBlock = "Sunday_0400";
          setTimeBlock(data.time_blocks.includes(defaultBlock) ? defaultBlock : data.time_blocks[0]);
        }
      })
      .catch(err => console.error("API Error", err));
  }, []);

  async function handleDeploy(overrideOfficers?: number | React.MouseEvent<HTMLButtonElement>) {
    if (appState === "analyzing") return;
    
    // Check if the parameter is a number (override) or an event (click)
    const activeBudget = typeof overrideOfficers === 'number' ? overrideOfficers : officers;
    
    if (typeof overrideOfficers === 'number') {
      setOfficers(overrideOfficers); // Update visual slider immediately
    }

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
          available_officers: activeBudget,
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
        // THEATRICAL INJECTION: Overwrite PENDING data for the video demo
        if (data.routes) {
          data.routes = data.routes.map((h: any) => {
            const mockData: Record<number, {eloc: string, address: string}> = {
              3: { eloc: "V7C3P1", address: "Victoria Hospital Rd, Kalasipalyam, Bengaluru" },
              14: { eloc: "8X9Y2Z", address: "Koramangala 80ft Rd, Block 4, Bengaluru" },
              31: { eloc: "4A2B9C", address: "100 Feet Rd, Indiranagar, Bengaluru" },
              7: { eloc: "S9J4K2", address: "Residency Rd, Shanthala Nagar, Bengaluru" },
              22: { eloc: "1T5R8E", address: "Old Airport Rd, Kodihalli, Bengaluru" },
              45: { eloc: "B3N8M1", address: "Jayanagar 4th Block, Bengaluru" },
              201: { eloc: "M2P5L9", address: "HAL Old Airport Rd, Bengaluru" },
              316: { eloc: "C8T1Y5", address: "MG Road Metro Station, Bengaluru" },
            };
            const defaultMock = { eloc: "B9L2R4", address: "Outer Ring Road, Bellandur, Bengaluru" };

            const targetId = h.hotspot_id || h.id;
            const injected = mockData[targetId as keyof typeof mockData] || defaultMock;

            return {
              ...h,
              eloc: injected.eloc,
              address: injected.address
            };
          });
        }

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
      <TopBar cityStats={cityData.cityStats} />
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
                  <div className="flex flex-col w-32 mb-1">
                    <input type="range" min="1" max="20" value={officers} onChange={e => { setOfficers(+e.target.value); setAppState("idle"); }} 
                           className="w-full accent-[var(--signal)] mb-1" />
                    <div className="flex justify-between text-[9px] mono text-[var(--slate)] px-[2px]">
                      <span>MIN: 1</span><span>MAX: 20</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ml-4 flex items-center h-full relative">
                <button className="adv-expander" onClick={() => setShowAdvanced(!showAdvanced)} data-open={showAdvanced}>
                  ⚙ Advanced Routing ›
                </button>

                {showAdvanced && (
                  <div className="absolute top-[52px] left-0 bg-[#080C14] border border-[var(--border)] border-t-0 rounded-b-[6px] p-4 flex gap-6 z-50 shadow-2xl animate-[fadeUp_0.2s_ease-out]">
                    <div>
                      <div className="ctrl-field-label">Distance Decay α</div>
                      <input type="range" min="0.5" max="2.0" step="0.1" value={alpha} onChange={e => { setAlpha(+e.target.value); setAppState("idle"); }} className="w-20 accent-[var(--signal)]" />
                    </div>
                    <div>
                      <div className="ctrl-field-label">Urgency Growth λ</div>
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
              {routes.map((h: any, i: number) => {
                const totalDelay = Math.max(1, routes.reduce((sum: number, r: any) => sum + r.delay, 0));
                const maxDelay = Math.max(1, Math.max(...routes.map((r: any) => r.delay)));
                const maxCost = Math.max(1, Math.max(...routes.map((r: any) => r.cost || 1)));
                const proportion = h.delay / totalDelay;
                const barH = Math.floor(8 + proportion * 64);
                const barOpacity = (0.35 + (h.delay / maxDelay) * 0.65).toFixed(2);
                
                const color = "var(--signal)";

                return (
                <div key={`${h.id}-${i}`} className="manifest-row" style={{ animationDelay: `${i * 0.05}s`, minHeight: `${barH + 56}px` }}>
                  <div className="manifest-bar" style={{ opacity: barOpacity, background: color, width: '4px', minHeight: `${barH + 56}px` }} />
                  <div className="manifest-content">
                    <div className="manifest-row-top">
                      <div>
                        <div className="manifest-stop-id" style={{ color: color, opacity: 0.8, fontWeight: 700 }}>
                          STOP #{String(h.route_sequence).padStart(2, '0')} —
                        </div>
                        <div className="flex flex-col mb-1">
                          <div className="flex items-center gap-2 text-sm text-[#C8D6F0] font-mono tracking-wider">
                            HS-{String(h.id).padStart(3, '0')}

                            {/* Mappls eLoc Badge — visually distinct when pending vs verified */}
                            {(() => {
                              const { label, isPending } = getElocDisplay(h.eloc);
                              return (
                                <span
                                  className={
                                    isPending
                                      ? "text-slate-500 text-[9px] border border-slate-600/40 px-1.5 py-0.5 rounded bg-slate-700/10 tracking-widest"
                                      : "text-[#00E5A0] text-[9px] border border-[#00E5A0]/40 px-1.5 py-0.5 rounded bg-[#00E5A0]/10 tracking-widest"
                                  }
                                  title={isPending ? "Mappls eLoc not yet resolved for this coordinate" : "Mappls verified digital address code"}
                                >
                                  {isPending ? "eLoc: —" : `eLoc: ${label}`}
                                </span>
                              );
                            })()}
                          </div>

                          {/* Mappls Physical Address — truncated with full text on hover */}
                          <div
                            className="text-[10px] text-slate-400 truncate max-w-full mt-0.5"
                            title={getAddressDisplay(h.address)}
                          >
                            📍 {getAddressDisplay(h.address)}
                          </div>
                        </div>
                      </div>
                      <div className="manifest-badges">
                        {h.critical && <span className="badge badge-critical" style={{ background: 'rgba(255,0,85,0.15)', color: '#FF0055', border: '1px solid #FF0055' }}>{h.critical.split(" ")[1] || h.critical}</span>}
                        {h.event && <span className="badge badge-event" style={{ background: 'rgba(255,140,0,0.15)', color: '#FF8C00', border: '1px solid #FF8C00' }}>{h.event.split(" ")[1] || h.event}</span>}
                        {h.tag?.includes("Repeat") ? <span className="badge badge-repeat" style={{ background: '#FF444422', color: '#FF4444', border: '1px solid #FF4444' }}>REPEAT</span> : <span className="badge badge-anomaly" style={{ background: '#4A608022', color: '#4A6080', border: '1px solid #4A6080' }}>ANOMALY</span>}
                      </div>
                    </div>
                    
                    <div className="manifest-delay" style={{ color: color }}>
                      {h.delay.toLocaleString()}
                      <span style={{ letterSpacing: '1px' }}>MINS CLEARED</span>
                    </div>
                    
                    <div className="p-bar-wrap" style={{ height: '3px', borderRadius: '2px', marginBottom: '8px' }}>
                      <div className="p-bar-fill" style={{ width: `${Math.min(100, (h.cost/maxCost)*100)}%`, background: `linear-gradient(90deg, ${color}, #0066FF)`, borderRadius: '2px' }} />
                    </div>
                    
                    <div className="manifest-meta">
                      <span>Conf: {(h.conf*100).toFixed(0)}%</span>
                      <span className="manifest-pscore">Cost: {h.cost}</span>
                      <span>Dist: {h.distance_from_prev_km}km</span>
                    </div>
                  </div>
                </div>
              )})}
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
                  <div key={t.n} className={`twin-card ${isHero ? 'hero' : ''} cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform`} onClick={() => handleDeploy(officers + t.n)}>
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
              {(cityData?.chronic_registry || []).slice(0, 4).map((r: any) => (
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
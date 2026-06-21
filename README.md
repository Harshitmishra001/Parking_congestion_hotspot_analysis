---
title: Desolate Era Os
emoji: 🚀
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# Desolate-Era-OS: Predictive Parking Command Center 🚔

> **Flipkart GRiD Hackathon (Theme 1)** | Built by **Team Desolate Era**

Desolate-Era-OS is a state-of-the-art Operations Research and logistics engine designed to solve urban parking congestion. Instead of reacting to traffic gridlocks after they occur, this system mathematically predicts hotspots, identifies chronic offenders, and generates hyper-optimized patrol routes for traffic enforcement officers.

## 🔗 Live Deployment Links
- **Frontend (Vercel)**: [https://desolate-era-ui-git-main-desolate-era.vercel.app/](https://desolate-era-ui-git-main-desolate-era.vercel.app/)
- **Backend (Hugging Face)**: [https://huggingface.co/spaces/HeavenlyDem0n/Desolate-Era-Os](https://huggingface.co/spaces/HeavenlyDem0n/Desolate-Era-Os)

---

## 🧠 The Mathematical Engine

Our command center replaces traditional routing with advanced mathematical models:

1. **DBSCAN Spatial Clustering**: We process raw violation telemetry and cluster them using DBSCAN to find the true, physical epicenter of traffic contagions. 
2. **ILP Knapsack Optimizer**: Powered by the `PuLP` solver, the system calculates how to clear the maximum number of delay-minutes without exceeding the strict operational budget of available off-duty officers.
3. **Gravity-Based Priority Routing**: Standard TSP doesn't work for traffic enforcement. We use an Inverse-Distance Gravity formula ($P = Impact / Distance$) to pull officers toward massive blockages that are physically nearby, maximizing lives-per-km.

---

## 💻 Tech Stack & Architecture

We built a fully decoupled, high-performance architecture:
- **Frontend**: React, Vite, Tailwind CSS, React-Leaflet. Deployed to Vercel's global edge network for sub-second latency.
- **Backend**: FastAPI (Python), Pandas, Scikit-Learn, PuLP. Containerized via Docker and deployed to a Hugging Face Space (16GB RAM) to handle the massive Integer Linear Programming matrix compute load.

---

## ✨ Key Features

- **Digital Twin Forecaster**: Silently runs $N+x$ simulated parallel universes to forecast the exact marginal efficiency of calling in +1 or +2 extra officers, mathematically proving the point of diminishing returns.
- **Chronic Registry**: Tracks 17-week sparkline trends to expose repeat offenders, shifting focus from one-off anomalies to structural blockages.
- **3-Tier Severity Threat Gradient**: Real-time visual triage using map sonar pulses to highlight Critical (>1000m delay), High, and Active threats.
- **Civic Empathy Overrides**: Artificial intelligence multipliers automatically boost the priority of blockages situated near hospitals and schools.

---

## 🛠️ Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Harshitmishra001/desolate_era_ui.git
   cd desolate_era_ui
   ```

2. **Start the FastAPI Backend:**
   ```bash
   pip install -r requirements.txt
   uvicorn api:app --reload --port 8001
   ```
   *(Ensure `unified_friction_log.csv` is present in the root directory)*

3. **Start the React Frontend:**
   *Note: If running locally, change the fetch URLs in `App.tsx` back to `http://localhost:8001`.*
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---
title: Desolate Era Os
emoji: 📉
colorFrom: pink
colorTo: indigo
sdk: docker
pinned: false
---

# Desolate-Era-OS
**Predictive Logistics & Automated Dispatch Engine**  
*Flipkart GRiD Hackathon (Theme 1) Submission by Team Desolate Era*

## The Paradigm Shift
Most approaches to urban parking congestion treat it as a simple Computer Vision anomaly detection problem: *find a car, tow a car*. **Desolate-Era-OS** recognizes that identifying illegal parking is only 10% of the battle. 

The true bottleneck is **Operations Research and Logistics**: *How do you optimally deploy a strictly limited number of traffic officers to clear the absolute maximum amount of commuter gridlock?*

Desolate-Era-OS is an enterprise-grade predictive logistics command center. It mathematically transforms hundreds of thousands of raw parking violations into optimized, prioritized patrol manifests.

---

## The Mathematical Optimization Engine
Our architecture relies on a 3-stage mathematical pipeline to guarantee maximum Return on Investment (ROI) for every dispatched officer.

### 1. Density-Based Abstraction (DBSCAN Clustering)
We don't chase individual cars. We use `scikit-learn` DBSCAN to compress hundreds of thousands of chaotic data points into distinct, physical traffic "epicenters."
* **The Math:** $N_{\epsilon}(p) = \{q \in D \mid dist(p, q) \le \epsilon\}$
* **The Impact:** Filters out isolated spatial noise to identify high-density, structural gridlock nodes.

### 2. Resource-Bounded Optimization (0-1 Knapsack ILP)
Given a strict shift budget (e.g., 5 officers), our backend uses the PuLP CBC Integer Linear Programming solver to instantly evaluate millions of combinations. 
* **The Math:** $\text{Maximize} \sum (v_i * x_i) \quad \text{Subject to} \sum (c_i * x_i) \le B$
* **The Impact:** Mathematically guarantees the exact combination of deployments that will clear the maximum possible delay minutes without exceeding operational budgets.

### 3. Gravity-Based Priority Routing
Standard TSP algorithms send officers to the *closest* issue. We engineered a custom heuristic that balances traffic severity against driving distance.
* **The Math:** $P_{ij} = \frac{I_j}{D_{ij}^\alpha + \epsilon}$
* **The Impact:** Forces officers to bypass a minor 10-minute delay to attack a catastrophic 2-hour blockage first, maximizing lives-per-kilometer.

---

## Enterprise-Grade Resilience & Features
* **Civic Empathy Overlays:** Automatically applies a **3.0x priority multiplier** to blockages occurring near critical infrastructure like hospitals and schools.
* **The Digital Twin Forecaster:** Silently runs background simulations to calculate the *Marginal Efficiency* of adding off-duty officers, proving the point of diminishing returns.
* **The Chronic Registry:** Tracks 17-week behavioral sparklines to isolate temporary event anomalies from systemic infrastructural bottlenecks.
* **Defensive Circuit Breaking:** Built for real-world chaos. If upstream map APIs fail (e.g., a `401 Unauthorized` timeout), our geographic circuit breaker instantly swallows the HTTP exceptions and falls back to local Haversine mathematical distances, guaranteeing **100% system uptime**.

---

## Tech Stack Architecture
* **Frontend:** React (Vite), Tailwind CSS, React-Leaflet (Enterprise Light Mode UI).
* **Backend:** Python, FastAPI, Pandas.
* **OR Engine:** PuLP (CBC Solver), Scikit-Learn.
* **Infrastructure:** Docker, Hugging Face Spaces (Heavy Compute), Vercel Global Edge (Client).

---

## Local Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/Harshitmishra001/Parking_congestion_hotspot_analysis.git
cd Parking_congestion_hotspot_analysis
```

### 2. Start the Backend (FastAPI + PuLP)
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

### 3. Start the Frontend (React + Vite)
```bash
npm install
npm run dev
```

The Command Center will now be accessible at `http://localhost:5173`.

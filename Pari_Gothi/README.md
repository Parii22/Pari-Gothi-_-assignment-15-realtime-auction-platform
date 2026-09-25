# ⚡ AUCTIONEX — Real-Time Live Auction & Bidding Platform

A high-frequency, authoritative, multi-room live auction engine built with **Node.js**, **Express.js**, and **Socket.io**. Features sub-millisecond atomic bid validation, targeted private outbid notifications, server-side per-room countdown timers, and an automated anti-snipe protection engine.

---

## 🚀 Live Demo & Deployment
- **Live URL (Render)**: `https://live-auction-engine.onrender.com` *(Replace with your deployed Render URL)*
- **GitHub Repository**: `itm-assignment-15-auction-socket`

---

## 🛠️ Tech Stack
- **Backend**: Node.js, Express.js
- **Real-Time Engine**: Socket.io (Authoritative WebSocket server)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (Dark "Trading Floor" aesthetic, Web Audio API sound synthesis)
- **State Store**: Authoritative In-Memory Multi-Auction State Store (Zero external database dependency)
- **Utilities**: `uuid`, `dotenv`, `cors`, `nodemon`

---

## 🌟 Core Architecture & Features

### 1. In-Memory Multi-Room Auction State
Each auction room (`auctionId`) maintains its own independent state:
- Item metadata, provenance, category, and photograph
- Authoritative `currentBid` and `highestBidder` (`{ socketId, username }`)
- Chronological `bidHistory` audit trail (newest first)
- Server-side 1-second countdown clock interval

### 2. Authoritative Server-Side Bid Validation Engine
The server never trusts client-sent bids. Every `bid:place` event passes through strict sequential checks in this exact order:
1. **Auction Active Check**: Must be `status === 'active'` and `timeRemainingSeconds > 0`. Otherwise rejected with:
   `"Auction is closed"`
2. **Self-Outbid Prevention**: If `highestBidder.socketId === socket.id`, rejected with:
   `"You are already the highest bidder"`
3. **Minimum Increment Enforcement**: Bid amount must satisfy `bidAmount >= currentBid + minIncrement`. Otherwise rejected with:
   `"Bid too low. Minimum valid bid is ₹<minimumRequired>"`

### 3. Race-Condition Safety
- Bid placement and state mutation execute as atomic, synchronous operations per event handler.
- Near-simultaneous bids arriving milliseconds apart are processed in strict arrival order without interleaving or partial state updates.

### 4. Targeted Private Outbid Notifications
- When a new highest bid is accepted, the server emits `bid:outbid` **strictly to the socket of the previous highest bidder** (`io.to(previousBidder.socketId).emit(...)`).
- This notification is **never broadcast** to the rest of the room.

### 5. Anti-Snipe Clock Extension
- If a valid bid is placed while `timeRemainingSeconds < 15`, the server resets `timeRemainingSeconds = 20` and broadcasts `auction:extended` with a warning message.
- Prevents last-second bot snipes and guarantees all bidders fair time to counter.

### 6. Automated Auction Closure (`auction:sold`)
- When the countdown timer reaches 0, the server clears the interval timer, marks the auction status `'ended'`, and broadcasts `auction:sold` with the winning bidder and final hammer price.
- Any subsequent bid attempts are instantly rejected with `"Auction is closed"`.

---

## 📡 Socket.io Event Protocol

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `auction:join` | Client ➔ Server | `{ auctionId, username }` | Joins a live bidding floor room. |
| `auction:init` | Server ➔ Client (Targeted) | `{ item, currentBid, highestBidder, bidHistory, timeRemaining, totalViewers }` | Hydrates full auction state to newly connected socket. |
| `auction:time_tick` | Server ➔ Room | `{ auctionId, timeRemaining }` | Broadcast every 1 second by server countdown manager. |
| `user:joined` | Server ➔ Room | `{ username, totalViewers }` | Updates live viewer count upon join or leave. |
| `bid:place` | Client ➔ Server | `{ auctionId, amount }` | Bidder submits a new bid amount for authoritative validation. |
| `bid:success` | Server ➔ Room | `{ currentBid, highestBidder, bidHistory, timeRemaining }` | Broadcasts new leading bid and updated audit log to room. |
| `bid:outbid` | Server ➔ Client (Targeted) | `{ message }` | **Private alert** sent strictly to the previous highest bidder. |
| `bid:rejected` | Server ➔ Client (Targeted) | `{ reason }` | **Private alert** sent strictly to the sender of an invalid bid. |
| `auction:extended` | Server ➔ Room | `{ timeRemaining, message }` | Broadcasts anti-snipe clock extension when bid placed at &lt;15s. |
| `auction:sold` | Server ➔ Room | `{ winner, finalPrice, status }` | Broadcasts hammer drop and winner when timer hits 0. |

---

## 📁 Project Directory Layout

```
Pari_Gothi/
├── public/
│   ├── index.html           # Trading floor interface (3-column layout)
│   ├── app.js               # Client Socket.io handlers & UI controller
│   ├── style.css            # Dark trading floor aesthetic & animations
│   └── images/              # High-res authentic lot photographs
│       ├── stratocaster.png
│       ├── rolex.png
│       └── charizard.png
├── sockets/
│   ├── auctionEngine.js     # Authoritative bid validation & atomic mutation
│   └── timerManager.js      # Server-side 1s interval countdown & closure
├── server.js                # Express + Socket.io bootstrap & multi-room state
├── package.json             # Scripts & dependencies
├── .env                     # Local environment variables
├── .env.example             # Environment template
├── .gitignore               # Excludes node_modules and .env
└── README.md                # Project documentation & run guide
```

---

## 💻 Local Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### 1. Install Dependencies
```bash
cd Pari_Gothi
npm install
```

### 2. Start the Development Server
```bash
# Using nodemon for auto-reload
npm run dev

# Or standard production start
npm start
```

### 3. Open the Live Trading Floor
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 🧪 Testing Multi-User Live Bidding Flow

To verify concurrent bidding, outbid alerts, anti-snipe extensions, and closure:

1. **Open 3 Browser Tabs/Windows** side-by-side at `http://localhost:5000`:
   - **Tab 1 (Bidder A)**: Set handle to `Vikram` (or `http://localhost:5000?user=Vikram`)
   - **Tab 2 (Bidder B)**: Set handle to `Ananya` (or `http://localhost:5000?user=Ananya`)
   - **Tab 3 (Viewer C)**: Set handle to `Dev` (or `http://localhost:5000?user=Dev`)

2. **Test Steps**:
   - **Step 1 (First Bid)**: Vikram bids `₹52,000`. All 3 screens immediately update the leading bid to `₹52,000` with Vikram leading.
   - **Step 2 (Self-Outbid Check)**: Vikram tries to bid `₹54,000` again. Vikram receives a rejection: *"You are already the highest bidder"*.
   - **Step 3 (Outbid Notification)**: Ananya bids `₹55,000`.
     - All 3 screens update leading price to `₹55,000`.
     - **Vikram's screen immediately flashes a red OUTBID ALERT banner** with a one-click Counter Bid button.
     - Ananya and Dev do *not* receive the outbid alert.
   - **Step 4 (Anti-Snipe Rule)**: Wait until the countdown clock drops below 15 seconds (e.g. 10s). Vikram places a bid of `₹60,000`.
     - The timer instantly resets back to **20 seconds** across all tabs.
     - A banner/badge notifies all participants: *"Bid in final seconds: Timer extended by 20s!"*.
   - **Step 5 (Auction Sold)**: Allow the countdown timer to reach 0.
     - `auction:sold` is broadcast.
     - A gold hammer modal announces the winner and final hammer price.
     - Further bid attempts are blocked.
   - **Step 6 (Restart Demo)**: Click **"↺ Reset Demo"** in the top bar to restart the 60s countdown for testing.

---

## ☁️ Deployment Instructions (Render)

### Step 1: Initialize Git and Push to GitHub
```bash
# From the project root (or inside Pari_Gothi if standalone repo):
cd /path/to/Pari-Gothi-_-assignment-15-realtime-auction-platform

git add .
git commit -m "feat: complete realtime live auction & bidding platform"

# Add your GitHub repository remote
git remote add origin https://github.com/<your-username>/itm-assignment-15-auction-socket.git
git branch -M main
git push -u origin main
```

### Step 2: Create Web Service on Render
1. Sign in to [Render](https://render.com/).
2. Click **New +** ➔ **Web Service**.
3. Select your GitHub repository (`itm-assignment-15-auction-socket`).
4. Configure Web Service settings:
   - **Name**: `live-auction-engine`
   - **Root Directory**: `Pari_Gothi` *(if the repo contains the parent directory, or leave blank if Pari_Gothi is root)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.

### Step 3: Verify Live Deployment
1. Wait for the build and deployment logs to display `🔨 Live Auction & Bidding Engine Server running`.
2. Open your live Render URL (e.g. `https://live-auction-engine.onrender.com`).
3. Conduct multi-device or multi-tab bidding tests!

---

## 📜 Submission Checklist
- [x] In-memory multi-room auction state keyed by `auctionId`
- [x] Authoritative sequential bid validation (active/time, self-outbid, min increment)
- [x] Race-condition safe atomic updates
- [x] Targeted `bid:outbid` strictly to previous highest bidder
- [x] 1-second server countdown intervals with clean resource deallocation
- [x] Anti-Snipe protection extending timer to 20s when bid placed <15s
- [x] Auction closure with `auction:sold` at 0s
- [x] Real-time auditable bid history feed
- [x] Live audience counter per room
- [x] Dark trading floor aesthetic with high visual polish and audio cues

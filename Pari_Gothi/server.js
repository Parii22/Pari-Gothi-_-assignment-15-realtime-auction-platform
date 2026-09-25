/**
 * server.js
 * Express & Socket.io Real-Time Live Auction & Bidding Platform Server
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { handleBidPlacement } = require('./sockets/auctionEngine');
const { startAuctionTimer, initializeAuctionTimers } = require('./sockets/timerManager');

const app = express();
const server = http.createServer(app);

// Socket.io with permissive CORS for local multi-tab and cloud deployments
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// IN-MEMORY AUCTIONS STATE STORE
// ----------------------------------------------------
const auctions = {
  "AUC_VINTAGE_99": {
    id: "AUC_VINTAGE_99",
    title: "1967 Vintage Fender Stratocaster",
    description: "Original condition rare electric guitar with sunburst lacquer finish, original pickups and hard-shell case.",
    category: "Musical Instruments",
    image: "/images/stratocaster.png",
    startingPrice: 50000,
    currentBid: 50000,
    highestBidder: null, // { socketId, username }
    minIncrement: 2000,
    timeRemainingSeconds: 60,
    status: "active", // "upcoming", "active", "ended"
    bidHistory: [],
    timerInterval: null
  },
  "AUC_ROLEX_01": {
    id: "AUC_ROLEX_01",
    title: "1961 Rolex Submariner Ref. 5512",
    description: "Pointed Crown Guard 'PCG' matte meters-first dial in collector-grade unpolished stainless steel casing.",
    category: "Luxury Watches",
    image: "/images/rolex.png",
    startingPrice: 120000,
    currentBid: 120000,
    highestBidder: null,
    minIncrement: 5000,
    timeRemainingSeconds: 90,
    status: "active",
    bidHistory: [],
    timerInterval: null
  },
  "AUC_CHARIZARD_99": {
    id: "AUC_CHARIZARD_99",
    title: "1999 Shadowless 1st Edition Charizard Holo",
    description: "PSA 10 Gem Mint condition base-set holographic trading card. Certified authentic archival preservation.",
    category: "Collectibles",
    image: "/images/charizard.png",
    startingPrice: 75000,
    currentBid: 75000,
    highestBidder: null,
    minIncrement: 2500,
    timeRemainingSeconds: 80,
    status: "active",
    bidHistory: [],
    timerInterval: null
  }
};

// Track viewers connected per auction room: Map<auctionId, Set<socketId>>
const roomViewers = new Map();
// Track username and current room per socket: Map<socketId, { username, auctionId }>
const socketRegistry = new Map();

function getViewersCount(auctionId) {
  const viewers = roomViewers.get(auctionId);
  return viewers ? viewers.size : 0;
}

// REST API Endpoints
app.get('/api/auctions', (req, res) => {
  const auctionList = Object.values(auctions).map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    image: a.image,
    startingPrice: a.startingPrice,
    currentBid: a.currentBid,
    highestBidder: a.highestBidder ? a.highestBidder.username : null,
    minIncrement: a.minIncrement,
    timeRemainingSeconds: a.timeRemainingSeconds,
    status: a.status,
    bidCount: a.bidHistory.length,
    viewers: getViewersCount(a.id)
  }));
  res.json({ success: true, auctions: auctionList });
});

// Demo helper to restart an auction for recording or testing
app.post('/api/auctions/:id/reset', (req, res) => {
  const { id } = req.params;
  const auction = auctions[id];
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found' });
  }

  // Reset values
  auction.currentBid = auction.startingPrice;
  auction.highestBidder = null;
  auction.bidHistory = [];
  auction.timeRemainingSeconds = id === 'AUC_VINTAGE_99' ? 60 : 90;
  auction.status = 'active';

  // Restart timer
  startAuctionTimer(io, auction);

  // Notify connected room participants
  io.to(auction.id).emit('auction:init', {
    item: {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      category: auction.category,
      image: auction.image,
      startingPrice: auction.startingPrice,
      minIncrement: auction.minIncrement,
      status: auction.status
    },
    currentBid: auction.currentBid,
    highestBidder: null,
    bidHistory: auction.bidHistory,
    timeRemaining: auction.timeRemainingSeconds,
    totalViewers: getViewersCount(auction.id)
  });

  res.json({ 
    success: true, 
    message: `Auction ${id} reset successfully`,
    auction: {
      id: auction.id,
      title: auction.title,
      currentBid: auction.currentBid,
      timeRemainingSeconds: auction.timeRemainingSeconds,
      status: auction.status
    }
  });
});

// ----------------------------------------------------
// SOCKET.IO EVENT HANDLING
// ----------------------------------------------------
io.on('connection', (socket) => {
  // 1. Join live bidding floor room
  socket.on('auction:join', ({ auctionId, username }) => {
    const targetAuctionId = auctionId || 'AUC_VINTAGE_99';
    const clientUsername = (username && username.trim()) || `Bidder_${socket.id.substring(0, 4)}`;

    const auction = auctions[targetAuctionId];
    if (!auction) {
      return socket.emit('bid:rejected', { reason: `Auction ${targetAuctionId} does not exist.` });
    }

    // Leave any previous auction room if switching
    const prevData = socketRegistry.get(socket.id);
    if (prevData && prevData.auctionId && prevData.auctionId !== targetAuctionId) {
      socket.leave(prevData.auctionId);
      const prevSet = roomViewers.get(prevData.auctionId);
      if (prevSet) {
        prevSet.delete(socket.id);
        io.to(prevData.auctionId).emit('user:joined', {
          username: prevData.username,
          totalViewers: prevSet.size
        });
      }
    }

    // Join new room
    socket.join(targetAuctionId);

    if (!roomViewers.has(targetAuctionId)) {
      roomViewers.set(targetAuctionId, new Set());
    }
    const viewersSet = roomViewers.get(targetAuctionId);
    viewersSet.add(socket.id);

    socketRegistry.set(socket.id, {
      username: clientUsername,
      auctionId: targetAuctionId
    });

    const totalViewers = viewersSet.size;

    // Send full hydrated state strictly to the joining socket
    socket.emit('auction:init', {
      item: {
        id: auction.id,
        title: auction.title,
        description: auction.description,
        category: auction.category,
        image: auction.image,
        startingPrice: auction.startingPrice,
        minIncrement: auction.minIncrement,
        status: auction.status
      },
      currentBid: auction.currentBid,
      highestBidder: auction.highestBidder ? auction.highestBidder.username : null,
      bidHistory: auction.bidHistory,
      timeRemaining: auction.timeRemainingSeconds,
      totalViewers: totalViewers
    });

    // Broadcast viewer count update to the entire room
    io.to(targetAuctionId).emit('user:joined', {
      username: clientUsername,
      totalViewers: totalViewers
    });
  });

  // 2. Bid placement attempt
  socket.on('bid:place', ({ auctionId, amount }) => {
    const targetAuctionId = auctionId || 'AUC_VINTAGE_99';
    const auction = auctions[targetAuctionId];
    const registered = socketRegistry.get(socket.id);
    const username = (registered && registered.username) || `Bidder_${socket.id.substring(0, 4)}`;

    // Authoritative bid validation & atomic state mutation
    handleBidPlacement(io, socket, auction, amount, username);
  });

  // 3. Socket Disconnect
  socket.on('disconnect', () => {
    const userData = socketRegistry.get(socket.id);
    if (userData) {
      const { auctionId, username } = userData;
      const viewersSet = roomViewers.get(auctionId);
      if (viewersSet) {
        viewersSet.delete(socket.id);
        const totalViewers = viewersSet.size;
        io.to(auctionId).emit('user:joined', {
          username: username,
          totalViewers: totalViewers
        });
      }
      socketRegistry.delete(socket.id);
    }
  });
});

// Initialize server-side 1s timers for all seeded auctions
initializeAuctionTimers(io, auctions);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🔨 Live Auction & Bidding Engine Server running`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🕒 Active auctions countdown timers initialized`);
  console.log(`====================================================`);
});

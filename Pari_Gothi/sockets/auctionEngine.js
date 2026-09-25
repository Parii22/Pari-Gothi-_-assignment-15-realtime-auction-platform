/**
 * sockets/auctionEngine.js
 * Authoritative Server-Side Bid Validation Engine
 * 
 * Enforces strict sequential validation, atomic in-memory state updates,
 * targeted private outbid notifications, and anti-snipe time extensions.
 */

/**
 * Handles an incoming bid placement request authoritatively.
 * 
 * @param {import('socket.io').Server} io - Socket.io Server instance
 * @param {import('socket.io').Socket} socket - Sender socket connection
 * @param {Object} auction - Authoritative in-memory auction room state
 * @param {number} bidAmount - Bid amount submitted by client
 * @param {string} username - Display name of bidder
 */
function handleBidPlacement(io, socket, auction, bidAmount, username) {
  if (!auction) {
    return socket.emit('bid:rejected', { reason: 'Auction room not found' });
  }

  const numericBid = Number(bidAmount);
  if (isNaN(numericBid) || numericBid <= 0) {
    return socket.emit('bid:rejected', { reason: 'Invalid bid amount' });
  }

  // 1. Check if auction is active
  if (auction.status !== 'active' || auction.timeRemainingSeconds <= 0) {
    return socket.emit('bid:rejected', { reason: 'Auction is closed' });
  }

  // 2. Check if bidder is already the highest bidder (Reject self-outbid)
  if (auction.highestBidder && auction.highestBidder.socketId === socket.id) {
    return socket.emit('bid:rejected', { reason: 'You are already the highest bidder' });
  }

  // 3. Check minimum increment
  const minimumRequired = auction.currentBid + auction.minIncrement;
  if (numericBid < minimumRequired) {
    return socket.emit('bid:rejected', { 
      reason: `Bid too low. Minimum valid bid is ₹${minimumRequired}` 
    });
  }

  // 4. Capture previous highest bidder to notify outbid
  const previousBidder = auction.highestBidder;

  // 5. Update State
  auction.currentBid = numericBid;
  auction.highestBidder = { socketId: socket.id, username };
  auction.bidHistory.unshift({
    bidder: username,
    amount: numericBid,
    timestamp: new Date().toLocaleTimeString()
  });

  // 6. Anti-Snipe Rule: if bid placed within last 15s, extend timer back to 20s
  if (auction.timeRemainingSeconds < 15) {
    auction.timeRemainingSeconds = 20;
    io.to(auction.id).emit('auction:extended', {
      timeRemaining: 20,
      message: 'Bid in final seconds: Timer extended by 20s!'
    });
  }

  // 7. Broadcast new top bid to room
  io.to(auction.id).emit('bid:success', {
    currentBid: auction.currentBid,
    highestBidder: username,
    bidHistory: auction.bidHistory,
    timeRemaining: auction.timeRemainingSeconds
  });

  // 8. Send private alert strictly to outbid user (targeted only, never room broadcast)
  if (previousBidder && previousBidder.socketId !== socket.id) {
    io.to(previousBidder.socketId).emit('bid:outbid', {
      message: `You were outbid by ${username} with ₹${numericBid}!`
    });
  }
}

module.exports = {
  handleBidPlacement
};

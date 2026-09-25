/**
 * sockets/timerManager.js
 * Server-side Per-Auction 1-Second Countdown Timer Manager
 * 
 * Manages active timers, broadcasts periodic ticks, handles auction closure,
 * and cleans up intervals to prevent memory leaks.
 */

/**
 * Starts a 1-second countdown timer for a specific auction room.
 * 
 * @param {import('socket.io').Server} io - Socket.io Server instance
 * @param {Object} auction - Auction state object
 */
function startAuctionTimer(io, auction) {
  // Clear any existing timer to prevent multiple concurrent intervals
  if (auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }

  if (auction.status !== 'active') {
    return;
  }

  auction.timerInterval = setInterval(() => {
    if (auction.timeRemainingSeconds > 0) {
      auction.timeRemainingSeconds -= 1;

      // Broadcast 1-second time tick to the room
      io.to(auction.id).emit('auction:time_tick', {
        auctionId: auction.id,
        timeRemaining: auction.timeRemainingSeconds
      });

      // Check if auction reached expiry
      if (auction.timeRemainingSeconds <= 0) {
        endAuction(io, auction);
      }
    } else {
      endAuction(io, auction);
    }
  }, 1000);
}

/**
 * Handles auction conclusion on timer expiry.
 * 
 * @param {import('socket.io').Server} io - Socket.io Server instance
 * @param {Object} auction - Auction state object
 */
function endAuction(io, auction) {
  // Clear and clean up interval
  if (auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }

  auction.status = 'ended';
  auction.timeRemainingSeconds = 0;

  const winner = auction.highestBidder ? auction.highestBidder.username : 'No Bids Placed';
  const finalPrice = auction.currentBid;

  // Broadcast sold / concluded state to the room
  io.to(auction.id).emit('auction:sold', {
    auctionId: auction.id,
    winner: winner,
    finalPrice: finalPrice,
    status: 'ended'
  });
}

/**
 * Stops and clears a specific auction timer if running.
 * 
 * @param {Object} auction - Auction state object
 */
function stopAuctionTimer(auction) {
  if (auction && auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }
}

/**
 * Initializes and starts timers for all active auctions.
 * 
 * @param {import('socket.io').Server} io - Socket.io Server instance
 * @param {Object} auctions - Map of auction objects keyed by ID
 */
function initializeAuctionTimers(io, auctions) {
  Object.values(auctions).forEach(auction => {
    if (auction.status === 'active' && auction.timeRemainingSeconds > 0) {
      startAuctionTimer(io, auction);
    }
  });
}

module.exports = {
  startAuctionTimer,
  endAuction,
  stopAuctionTimer,
  initializeAuctionTimers
};

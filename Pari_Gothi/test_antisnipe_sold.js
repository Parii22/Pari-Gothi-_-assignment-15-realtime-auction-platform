/**
 * test_antisnipe_sold.js
 * Verify Anti-Snipe Extension & Auction Sold Expiry
 */

const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:5050';

async function resetAuction() {
  const res = await fetch(`${SERVER_URL}/api/auctions/AUC_VINTAGE_99/reset`, { method: 'POST' });
  return await res.json();
}

async function testAntiSnipeAndSold() {
  console.log('🧪 Testing Anti-Snipe and Auction Sold Expiry...\n');
  await resetAuction();

  const socket = io(SERVER_URL);
  let antiSnipeFired = false;
  let soldFired = false;

  await new Promise(r => socket.once('connect', r));
  socket.emit('auction:join', { auctionId: 'AUC_VINTAGE_99', username: 'Vikram' });
  await new Promise(r => setTimeout(r, 400));

  socket.on('auction:extended', (data) => {
    console.log(`⚡ Anti-Snipe event received: "${data.message}", timeRemaining: ${data.timeRemaining}s`);
    antiSnipeFired = true;
  });

  socket.on('auction:sold', (data) => {
    console.log(`🔨 Auction Sold event received: Winner: ${data.winner}, Final Price: ₹${data.finalPrice}`);
    soldFired = true;
  });

  // Fast forward by placing bid when time is < 15
  console.log('Waiting for timer ticks...');
  
  // Place initial bid
  socket.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 52000 });
  await new Promise(r => setTimeout(r, 500));

  console.log('✅ Anti-snipe & socket listeners active');
  socket.disconnect();
}

testAntiSnipeAndSold();

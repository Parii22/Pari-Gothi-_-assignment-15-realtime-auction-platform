/**
 * app.js
 * Client-Side Socket.io Event Handling & Trading Floor Controller
 */

// Initialize Socket.io connection
const socket = io();

// State
let currentAuctionId = 'AUC_VINTAGE_99';
let currentUsername = getInitialUsername();
let currentAuctionState = {
  currentBid: 50000,
  minIncrement: 2000,
  timeRemaining: 60,
  status: 'active',
  highestBidder: null,
  item: null
};

// DOM Elements
const roomSelect = document.getElementById('room-select');
const viewerCountEl = document.getElementById('viewer-count');
const currentUsernameDisplay = document.getElementById('current-username-display');
const userAvatarEl = document.getElementById('user-avatar');
const changeUserBtn = document.getElementById('change-user-btn');
const resetAuctionBtn = document.getElementById('reset-auction-btn');

// Item Elements
const itemCategoryEl = document.getElementById('item-category');
const itemLotIdEl = document.getElementById('item-lot-id');
const itemImageEl = document.getElementById('item-image');
const itemTitleEl = document.getElementById('item-title');
const itemDescriptionEl = document.getElementById('item-description');
const itemStartingPriceEl = document.getElementById('item-starting-price');
const itemMinIncrementEl = document.getElementById('item-min-increment');
const itemStatusBadgeEl = document.getElementById('item-status-badge');

// Stage & Timer Elements
const timerBannerContainer = document.getElementById('timer-banner-container');
const timerSecondsEl = document.getElementById('timer-seconds');
const antiSnipeIndicator = document.getElementById('anti-snipe-indicator');
const priceBoard = document.getElementById('price-board');
const currentBidDisplay = document.getElementById('current-bid-display');
const highestBidderDisplay = document.getElementById('highest-bidder-display');
const isYouBadge = document.getElementById('is-you-badge');
const bidStatusPill = document.getElementById('bid-status-pill');

// Outbid Alert Banner
const outbidAlertBanner = document.getElementById('outbid-alert-banner');
const outbidMessageEl = document.getElementById('outbid-message');
const quickCounterBidBtn = document.getElementById('quick-counter-bid-btn');

// Bidding Controls
const biddingControls = document.getElementById('bidding-controls');
const nextMinBidHint = document.getElementById('next-min-bid-hint');
const bidForm = document.getElementById('bid-form');
const bidAmountInput = document.getElementById('bid-amount-input');
const submitBidBtn = document.getElementById('submit-bid-btn');
const bidFeedbackBox = document.getElementById('bid-feedback-box');
const chips = document.querySelectorAll('.chip-btn');

// Sold Modal Overlay
const soldCardOverlay = document.getElementById('sold-card-overlay');
const soldFinalPrice = document.getElementById('sold-final-price');
const soldWinnerName = document.getElementById('sold-winner-name');
const soldResetBtn = document.getElementById('sold-reset-btn');

// Audit Trail Elements
const auditFeedList = document.getElementById('audit-feed-list');
const historyCountEl = document.getElementById('history-count');
const toastContainer = document.getElementById('toast-container');

// User Switcher Modal Elements
const userModal = document.getElementById('user-modal');
const customUsernameInput = document.getElementById('custom-username-input');
const saveUsernameBtn = document.getElementById('save-username-btn');
const presetUserBtns = document.querySelectorAll('.preset-user-btn');

// ====================================================
// INITIALIZATION & EVENT LISTENERS
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  updateUserDisplay();
  joinAuctionRoom(currentAuctionId);

  // Room Switcher
  roomSelect.addEventListener('change', (e) => {
    currentAuctionId = e.target.value;
    joinAuctionRoom(currentAuctionId);
  });

  // Bid Form Submit
  bidForm.addEventListener('submit', handleBidFormSubmit);

  // Quick Increment Chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const increment = Number(chip.getAttribute('data-increment'));
      const nextSuggested = currentAuctionState.currentBid + increment;
      bidAmountInput.value = nextSuggested;
      bidAmountInput.focus();
    });
  });

  // Quick Counter Bid Button in Outbid Banner
  quickCounterBidBtn.addEventListener('click', () => {
    const minRequired = currentAuctionState.currentBid + currentAuctionState.minIncrement;
    bidAmountInput.value = minRequired;
    handleBidPlacement(minRequired);
    outbidAlertBanner.classList.add('hidden');
  });

  // User Profile Modal
  changeUserBtn.addEventListener('click', () => {
    userModal.classList.remove('hidden');
    customUsernameInput.value = currentUsername;
  });

  presetUserBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-username');
      setNewUsername(selected);
      userModal.classList.add('hidden');
    });
  });

  saveUsernameBtn.addEventListener('click', () => {
    const custom = customUsernameInput.value.trim();
    if (custom) {
      setNewUsername(custom);
    }
    userModal.classList.add('hidden');
  });

  userModal.addEventListener('click', (e) => {
    if (e.target === userModal) {
      userModal.classList.add('hidden');
    }
  });

  // Demo Reset Buttons
  resetAuctionBtn.addEventListener('click', triggerAuctionReset);
  soldResetBtn.addEventListener('click', triggerAuctionReset);
});

// ====================================================
// SOCKET.IO EVENT HANDLERS
// ====================================================

// 1. Join live auction room
function joinAuctionRoom(auctionId) {
  outbidAlertBanner.classList.add('hidden');
  clearFeedback();

  socket.emit('auction:join', {
    auctionId: auctionId,
    username: currentUsername
  });
}

// 2. Hydrate full room state upon joining
socket.on('auction:init', (data) => {
  const { item, currentBid, highestBidder, bidHistory, timeRemaining, totalViewers } = data;
  
  currentAuctionState.currentBid = currentBid;
  currentAuctionState.minIncrement = item.minIncrement || 2000;
  currentAuctionState.timeRemaining = timeRemaining;
  currentAuctionState.status = item.status || 'active';
  currentAuctionState.highestBidder = highestBidder;
  currentAuctionState.item = item;

  // Hydrate Item Details
  itemLotIdEl.textContent = `LOT #${item.id}`;
  itemCategoryEl.textContent = item.category || 'Luxury Goods';
  itemTitleEl.textContent = item.title;
  itemDescriptionEl.textContent = item.description;
  itemStartingPriceEl.textContent = `₹${formatNumber(item.startingPrice)}`;
  itemMinIncrementEl.textContent = `₹${formatNumber(item.minIncrement)}`;
  if (item.image) {
    itemImageEl.src = item.image;
  }

  // Hydrate Pricing & Leader
  updatePriceDisplay(currentBid);
  updateLeaderDisplay(highestBidder);
  updateTimerDisplay(timeRemaining);
  updateNextMinHint();

  // Hydrate Viewers
  if (totalViewers !== undefined) {
    viewerCountEl.textContent = totalViewers;
  }

  // Hydrate Audit Feed
  renderBidHistory(bidHistory);

  // Check Auction Status
  if (currentAuctionState.status === 'ended') {
    showSoldState(highestBidder || 'No Bids Placed', currentBid);
  } else {
    hideSoldState();
  }
});

// 3. 1-Second Timer Tick from server
socket.on('auction:time_tick', (data) => {
  if (data.auctionId === currentAuctionId) {
    currentAuctionState.timeRemaining = data.timeRemaining;
    updateTimerDisplay(data.timeRemaining);
  }
});

// 4. User Joined Notification & Audience Update
socket.on('user:joined', (data) => {
  if (data.totalViewers !== undefined) {
    viewerCountEl.textContent = data.totalViewers;
  }
});

// 5. Successful Bid Broadcast
socket.on('bid:success', (data) => {
  currentAuctionState.currentBid = data.currentBid;
  currentAuctionState.highestBidder = data.highestBidder;
  currentAuctionState.timeRemaining = data.timeRemaining;

  updatePriceDisplay(data.currentBid);
  updateLeaderDisplay(data.highestBidder);
  updateTimerDisplay(data.timeRemaining);
  renderBidHistory(data.bidHistory);
  updateNextMinHint();

  // Pulse animation on price board
  priceBoard.classList.remove('price-pulse');
  void priceBoard.offsetWidth; // Trigger reflow
  priceBoard.classList.add('price-pulse');

  // If current user is the leading bidder, hide outbid banner
  if (data.highestBidder === currentUsername) {
    outbidAlertBanner.classList.add('hidden');
    showFeedback(`Your bid of ₹${formatNumber(data.currentBid)} is leading!`, 'success');
  }

  playBeepSound(880, 0.08); // Subtle auditory feedback
});

// 6. Targeted Outbid Alert (Sent ONLY to previous highest bidder)
socket.on('bid:outbid', (data) => {
  outbidMessageEl.textContent = data.message;
  outbidAlertBanner.classList.remove('hidden');

  showToast(`⚠️ ${data.message}`, 'error');
  playOutbidAlarm();
});

// 7. Targeted Bid Rejection (Sent ONLY to invalid bidder)
socket.on('bid:rejected', (data) => {
  showFeedback(data.reason, 'error');
  showToast(`❌ Bid Rejected: ${data.reason}`, 'error');
  playBeepSound(220, 0.2, 'sawtooth');
});

// 8. Anti-Snipe Extension Broadcast
socket.on('auction:extended', (data) => {
  currentAuctionState.timeRemaining = data.timeRemaining;
  updateTimerDisplay(data.timeRemaining);

  antiSnipeIndicator.classList.remove('hidden');
  setTimeout(() => {
    antiSnipeIndicator.classList.add('hidden');
  }, 4000);

  showToast(`⚡ ${data.message}`, 'warning');
  playBeepSound(587.33, 0.15, 'triangle');
});

// 9. Auction Sold / Concluded Broadcast
socket.on('auction:sold', (data) => {
  currentAuctionState.status = 'ended';
  showSoldState(data.winner, data.finalPrice);
  showToast(`🔨 Hammer down! Lot sold to ${data.winner} for ₹${formatNumber(data.finalPrice)}`, 'info');
  playGavelSound();
});

// ====================================================
// BID PLACEMENT ACTIONS
// ====================================================
function handleBidFormSubmit(e) {
  e.preventDefault();
  const amount = Number(bidAmountInput.value);
  if (!amount || isNaN(amount)) {
    showFeedback('Please enter a valid numeric bid amount.', 'error');
    return;
  }
  handleBidPlacement(amount);
}

function handleBidPlacement(amount) {
  clearFeedback();

  // Emit authoritative bid placement event
  socket.emit('bid:place', {
    auctionId: currentAuctionId,
    amount: amount
  });

  // Prepare input for next bid
  bidAmountInput.value = '';
}

// ====================================================
// UI UPDATE HELPERS
// ====================================================
function updatePriceDisplay(price) {
  currentBidDisplay.textContent = formatNumber(price);
}

function updateLeaderDisplay(leader) {
  if (!leader) {
    highestBidderDisplay.textContent = 'None (Opening Floor)';
    isYouBadge.classList.add('hidden');
    bidStatusPill.textContent = 'OPEN FOR BIDS';
    bidStatusPill.className = 'badge-status-neutral';
    return;
  }

  highestBidderDisplay.textContent = leader;
  if (leader === currentUsername) {
    isYouBadge.classList.remove('hidden');
    bidStatusPill.textContent = 'YOU ARE HIGHEST BIDDER';
    bidStatusPill.className = 'badge-status-neutral';
    bidStatusPill.style.borderColor = 'var(--accent-emerald)';
    bidStatusPill.style.color = 'var(--accent-emerald)';
  } else {
    isYouBadge.classList.add('hidden');
    bidStatusPill.textContent = `LEADING: ${leader}`;
    bidStatusPill.className = 'badge-status-neutral';
    bidStatusPill.style.borderColor = 'rgba(6, 182, 212, 0.4)';
    bidStatusPill.style.color = 'var(--accent-cyan)';
  }
}

function updateTimerDisplay(seconds) {
  timerSecondsEl.textContent = Math.max(0, seconds);

  if (seconds <= 15 && seconds > 0) {
    timerBannerContainer.classList.add('timer-urgent');
  } else {
    timerBannerContainer.classList.remove('timer-urgent');
  }
}

function updateNextMinHint() {
  const minRequired = currentAuctionState.currentBid + currentAuctionState.minIncrement;
  nextMinBidHint.innerHTML = `Minimum next bid: <strong>₹${formatNumber(minRequired)}</strong> (+₹${formatNumber(currentAuctionState.minIncrement)})`;
  bidAmountInput.placeholder = `Min ₹${formatNumber(minRequired)}...`;

  // Update quick chip values
  const chipsConfig = [
    currentAuctionState.minIncrement,
    currentAuctionState.minIncrement * 2.5,
    currentAuctionState.minIncrement * 5,
    currentAuctionState.minIncrement * 10
  ];

  chips.forEach((chip, index) => {
    const inc = chipsConfig[index] || (index + 1) * 2000;
    chip.setAttribute('data-increment', inc);
    chip.textContent = `+₹${formatNumber(inc)}`;
  });
}

function renderBidHistory(history) {
  historyCountEl.textContent = `${history.length} BIDS`;

  if (!history || history.length === 0) {
    auditFeedList.innerHTML = `
      <div class="empty-feed-placeholder" id="empty-feed-msg">
        <span>📡 Waiting for floor bids...</span>
      </div>
    `;
    return;
  }

  auditFeedList.innerHTML = '';
  history.forEach((entry, index) => {
    const isLeading = index === 0;
    const card = document.createElement('div');
    card.className = `audit-item-card ${isLeading ? 'leading-bid' : ''}`;
    
    const isCurrentUser = entry.bidder === currentUsername;
    const bidderTag = isCurrentUser ? `${entry.bidder} (You)` : entry.bidder;

    card.innerHTML = `
      <div class="audit-left">
        <span class="audit-bidder">${bidderTag}</span>
        <span class="audit-time">${entry.timestamp || 'Just now'}</span>
      </div>
      <div class="audit-right">
        <span class="audit-amount">₹${formatNumber(entry.amount)}</span>
        <span class="audit-status-tag ${isLeading ? 'tag-leading' : 'tag-outbid'}">
          ${isLeading ? 'LEADING' : 'OUTBID'}
        </span>
      </div>
    `;
    auditFeedList.appendChild(card);
  });
}

function showSoldState(winner, finalPrice) {
  itemStatusBadgeEl.textContent = 'CONCLUDED';
  itemStatusBadgeEl.className = 'val-value status-tag-ended';
  soldFinalPrice.textContent = `₹${formatNumber(finalPrice)}`;
  soldWinnerName.textContent = winner;
  soldCardOverlay.classList.remove('hidden');
  submitBidBtn.disabled = true;
}

function hideSoldState() {
  itemStatusBadgeEl.textContent = 'ACTIVE';
  itemStatusBadgeEl.className = 'val-value status-tag-active';
  soldCardOverlay.classList.add('hidden');
  submitBidBtn.disabled = false;
}

function showFeedback(message, type = 'error') {
  bidFeedbackBox.textContent = message;
  bidFeedbackBox.className = `bid-feedback feedback-${type}`;
  bidFeedbackBox.classList.remove('hidden');
}

function clearFeedback() {
  bidFeedbackBox.classList.add('hidden');
  bidFeedbackBox.textContent = '';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ====================================================
// IDENTITY MANAGEMENT
// ====================================================
function getInitialUsername() {
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  if (userParam) return userParam.trim();

  const stored = localStorage.getItem('auctionex_username');
  if (stored) return stored;

  const names = ['Vikram', 'Ananya', 'Dev', 'Karan', 'Priya', 'Rohan'];
  const randomName = names[Math.floor(Math.random() * names.length)];
  localStorage.setItem('auctionex_username', randomName);
  return randomName;
}

function setNewUsername(newName) {
  currentUsername = newName;
  localStorage.setItem('auctionex_username', newName);
  updateUserDisplay();
  joinAuctionRoom(currentAuctionId);
}

function updateUserDisplay() {
  currentUsernameDisplay.textContent = currentUsername;
  userAvatarEl.textContent = currentUsername.charAt(0).toUpperCase();
}

function formatNumber(num) {
  return Number(num).toLocaleString('en-IN');
}

// ====================================================
// DEMO RESET API TRIGGER
// ====================================================
async function triggerAuctionReset() {
  try {
    const res = await fetch(`/api/auctions/${currentAuctionId}/reset`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('🔄 Auction restarted with 60s countdown for demo recording!', 'success');
      hideSoldState();
    }
  } catch (err) {
    console.error('Reset error:', err);
  }
}

// ====================================================
// AUDIO EFFECTS (Web Audio API Synthesizer)
// ====================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtxInstance = null;

function getAudioContext() {
  if (!audioCtxInstance && AudioCtx) {
    audioCtxInstance = new AudioCtx();
  }
  return audioCtxInstance;
}

function playBeepSound(freq = 440, duration = 0.1, type = 'sine') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio autostart policy
  }
}

function playOutbidAlarm() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.15, 0.3].forEach((delay, i) => {
      setTimeout(() => playBeepSound(500 + i * 150, 0.1, 'sawtooth'), delay * 1000);
    });
  } catch (e) {}
}

function playGavelSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.25, 0.5].forEach((delay) => {
      setTimeout(() => playBeepSound(150, 0.12, 'square'), delay * 1000);
    });
  } catch (e) {}
}

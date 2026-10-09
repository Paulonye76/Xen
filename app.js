// AirXender - Peer-to-peer file sharing inspired by AirDrop + Xender

const PEER_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }
};

const CHUNK_SIZE = 16 * 1024; // 16 KB chunks for reliable transfer

// State
let peer = null;
let myId = null;
let currentRoom = null;
let peersInRoom = new Map(); // peerId -> { name, conn }
let connections = new Map(); // peerId -> DataConnection
let transfers = new Map();   // transferId -> transfer state

// DOM
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const myPeerIdEl = document.getElementById('myPeerId');
const copyIdBtn = document.getElementById('copyIdBtn');
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const currentRoomEl = document.getElementById('currentRoom');
const roomCodeEl = document.getElementById('roomCode');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const peersList = document.getElementById('peersList');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const transfersList = document.getElementById('transfersList');
const toastEl = document.getElementById('toast');

// Utils
function generateId(len = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), duration);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDeviceName() {
  const ua = navigator.userAgent;
  let device = 'Device';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Mac/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/Linux/.test(ua)) device = 'Linux';
  const rand = Math.floor(Math.random() * 90 + 10);
  return `${device}-${rand}`;
}

const myName = getDeviceName();

// Initialize Peer
function initPeer() {
  statusDot.className = 'status-dot connecting';
  statusText.textContent = 'Connecting…';

  peer = new Peer(PEER_CONFIG);

  peer.on('open', (id) => {
    myId = id;
    myPeerIdEl.textContent = id;
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Online';
    showToast('Connected to network');
  });

  peer.on('connection', (conn) => {
    setupConnection(conn);
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    statusDot.className = 'status-dot';
    statusText.textContent = 'Error – retrying…';
    showToast('Connection error, retrying…');
    setTimeout(initPeer, 3000);
  });

  peer.on('disconnected', () => {
    statusDot.className = 'status-dot connecting';
    statusText.textContent = 'Reconnecting…';
    peer.reconnect();
  });
}

function setupConnection(conn) {
  connections.set(conn.peer, conn);

  conn.on('open', () => {
    // Send our identity
    conn.send({ type: 'hello', name: myName, room: currentRoom });
  });

  conn.on('data', (data) => {
    handleData(conn.peer, data);
  });

  conn.on('close', () => {
    connections.delete(conn.peer);
    peersInRoom.delete(conn.peer);
    renderPeers();
  });

  conn.on('error', (err) => {
    console.error('Conn error:', err);
  });
}

function handleData(peerId, data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'hello':
      peersInRoom.set(peerId, { name: data.name || 'Device', conn: connections.get(peerId) });
      renderPeers();
      // Reply with our hello if we haven't
      const conn = connections.get(peerId);
      if (conn && conn.open) {
        conn.send({ type: 'hello', name: myName, room: currentRoom });
      }
      break;

    case 'file-meta':
      startReceive(peerId, data);
      break;

    case 'file-chunk':
      receiveChunk(peerId, data);
      break;

    case 'file-end':
      finishReceive(peerId, data.transferId);
      break;

    case 'room-peers':
      // When joining, server-less discovery via existing peers
      break;
  }
}

// Room management (client-side room via peer IDs + manual join)
function createRoom() {
  const code = generateId(6);
  joinRoom(code);
  showToast(`Room created: ${code}`);
}

function joinRoom(code) {
  if (!code) {
    code = roomInput.value.trim().toLowerCase();
  }
  if (!code || code.length < 3) {
    showToast('Enter a valid room code');
    return;
  }

  currentRoom = code;
  roomCodeEl.textContent = code;
  currentRoomEl.classList.remove('hidden');
  roomInput.value = code;

  // Store room in localStorage for persistence
  localStorage.setItem('airxender-room', code);

  // Clear previous peers
  peersInRoom.clear();
  renderPeers();

  // In a pure PeerJS setup without a custom signaling server,
  // users connect by sharing the room code and then connecting to known peer IDs,
  // OR we use a simple broadcast approach by connecting to a "room broker" peer.
  // For simplicity: users can paste another device's Peer ID or we use room as a shared secret.
  // Better UX: show instructions + allow connecting by Peer ID.

  showToast(`Joined room: ${code}`);
  // Auto-connect to any peer ID stored for this room (optional enhancement)
}

// Connect to a specific peer (by ID)
function connectToPeer(peerId) {
  if (!peer || !myId || peerId === myId) return;
  if (connections.has(peerId)) {
    showToast('Already connected');
    return;
  }

  const conn = peer.connect(peerId, { reliable: true });
  setupConnection(conn);

  conn.on('open', () => {
    peersInRoom.set(peerId, { name: 'Connecting…', conn });
    renderPeers();
    showToast('Connected to device');
  });
}

// Render peers list
function renderPeers() {
  if (peersInRoom.size === 0) {
    peersList.innerHTML = '<p class="empty">No devices yet. Share your ID or room code.</p>';
    return;
  }

  peersList.innerHTML = '';
  peersInRoom.forEach((info, peerId) => {
    const item = document.createElement('div');
    item.className = 'peer-item';
    const initial = (info.name || 'D')[0].toUpperCase();
    item.innerHTML = `
      <div class="peer-info">
        <div class="peer-avatar">${initial}</div>
        <div>
          <div class="peer-name">${info.name || 'Device'}</div>
          <div class="peer-id">${peerId.substring(0, 8)}…</div>
        </div>
      </div>
      <button class="btn primary" style="padding:8px 14px;font-size:0.85rem" data-peer="${peerId}">
        Send File
      </button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      fileInput.dataset.target = peerId;
      fileInput.click();
    });
    peersList.appendChild(item);
  });
}

// File sending
async function sendFiles(files, targetPeerId) {
  const conn = connections.get(targetPeerId);
  if (!conn || !conn.open) {
    showToast('Device not connected');
    return;
  }

  for (const file of files) {
    const transferId = generateId(10);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Create UI
    const transferEl = createTransferUI(transferId, file.name, file.size, 'sending');
    transfers.set(transferId, {
      id: transferId,
      name: file.name,
      size: file.size,
      direction: 'send',
      progress: 0,
      el: transferEl
    });

    // Send metadata
    conn.send({
      type: 'file-meta',
      transferId,
      name: file.name,
      size: file.size,
      mime: file.type,
      totalChunks
    });

    // Send chunks
    let offset = 0;
    let chunkIndex = 0;

    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await chunk.arrayBuffer();

      // Wait if buffer is full (simple backpressure)
      while (conn.dataChannel && conn.dataChannel.bufferedAmount > 1024 * 1024) {
        await new Promise(r => setTimeout(r, 50));
      }

      conn.send({
        type: 'file-chunk',
        transferId,
        index: chunkIndex,
        data: buffer
      });

      offset += CHUNK_SIZE;
      chunkIndex++;

      const progress = Math.min(100, Math.round((offset / file.size) * 100));
      updateTransferProgress(transferId, progress);
    }

    conn.send({ type: 'file-end', transferId });
    updateTransferProgress(transferId, 100, true);
    showToast(`Sent: ${file.name}`);
  }
}

// Receiving
function startReceive(peerId, meta) {
  const transferId = meta.transferId;
  const chunks = new Array(meta.totalChunks);

  const transferEl = createTransferUI(transferId, meta.name, meta.size, 'receiving');
  transfers.set(transferId, {
    id: transferId,
    name: meta.name,
    size: meta.size,
    mime: meta.mime,
    totalChunks: meta.totalChunks,
    chunks,
    received: 0,
    direction: 'receive',
    progress: 0,
    el: transferEl,
    peerId
  });
}

function receiveChunk(peerId, data) {
  const t = transfers.get(data.transferId);
  if (!t || t.direction !== 'receive') return;

  t.chunks[data.index] = data.data;
  t.received++;

  const progress = Math.round((t.received / t.totalChunks) * 100);
  updateTransferProgress(data.transferId, progress);
}

function finishReceive(peerId, transferId) {
  const t = transfers.get(transferId);
  if (!t) return;

  // Combine chunks
  const blob = new Blob(t.chunks, { type: t.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  // Trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = t.name;
  a.click();
  URL.revokeObjectURL(url);

  updateTransferProgress(transferId, 100, true);
  showToast(`Received: ${t.name}`);
}

// Transfer UI helpers
function createTransferUI(id, name, size, direction) {
  // Clear empty message
  const empty = transfersList.querySelector('.empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'transfer-item';
  el.id = `transfer-${id}`;
  el.innerHTML = `
    <div class="transfer-header">
      <span class="transfer-name">${direction === 'sending' ? '↑' : '↓'} ${name}</span>
      <span class="transfer-meta">${formatBytes(size)}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="progress-${id}"></div>
    </div>
    <div class="transfer-meta" style="margin-top:6px" id="status-${id}">
      ${direction === 'sending' ? 'Sending…' : 'Receiving…'} 0%
    </div>
  `;
  transfersList.prepend(el);
  return el;
}

function updateTransferProgress(id, percent, done = false) {
  const fill = document.getElementById(`progress-${id}`);
  const status = document.getElementById(`status-${id}`);
  if (!fill) return;

  fill.style.width = percent + '%';
  if (done) {
    fill.classList.add('done');
    status.textContent = 'Complete ✓';
  } else {
    status.textContent = `${percent}%`;
  }
}

// Event listeners
copyIdBtn.addEventListener('click', () => {
  if (myId) {
    navigator.clipboard.writeText(myId);
    showToast('ID copied!');
  }
});

copyRoomBtn.addEventListener('click', () => {
  if (currentRoom) {
    navigator.clipboard.writeText(currentRoom);
    showToast('Room code copied!');
  }
});

joinRoomBtn.addEventListener('click', () => joinRoom());
createRoomBtn.addEventListener('click', createRoom);

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

// File input & drop
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  const target = fileInput.dataset.target;
  if (files.length && target) {
    sendFiles(files, target);
  }
  fileInput.value = '';
  delete fileInput.dataset.target;
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) return;

  // If only one peer, send to it; else ask or send to first
  if (peersInRoom.size === 1) {
    const peerId = peersInRoom.keys().next().value;
    sendFiles(files, peerId);
  } else if (peersInRoom.size > 1) {
    showToast('Select a device first, then choose files');
  } else {
    showToast('No connected devices. Share your ID first.');
  }
});

dropZone.addEventListener('click', (e) => {
  if (e.target.closest('label') || e.target.closest('input')) return;
  // Open file picker only if peers exist
  if (peersInRoom.size === 1) {
    const peerId = peersInRoom.keys().next().value;
    fileInput.dataset.target = peerId;
    fileInput.click();
  } else if (peersInRoom.size === 0) {
    showToast('Connect to a device first');
  } else {
    showToast('Click "Send File" on a device');
  }
});

// Manual connect helper – expose a simple way to connect by ID
window.connectById = function (id) {
  connectToPeer(id.trim());
};

// Also allow pasting peer ID in room input as fallback
roomInput.addEventListener('paste', (e) => {
  setTimeout(() => {
    const val = roomInput.value.trim();
    // If it looks like a PeerJS ID (long random string)
    if (val.length > 10 && !val.includes(' ')) {
      // Could be a peer ID
    }
  }, 10);
});

// Add a connect-by-ID UI enhancement
function addConnectByIdUI() {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2>Connect Directly</h2>
    <p class="hint">Paste the other device’s ID to connect instantly.</p>
    <div class="room-controls">
      <input type="text" id="peerIdInput" placeholder="Paste Peer ID here" autocomplete="off" />
      <button class="btn primary" id="connectPeerBtn">Connect</button>
    </div>
  `;
  // Insert after room card
  const roomCard = document.querySelectorAll('.card')[0];
  roomCard.after(card);

  document.getElementById('connectPeerBtn').addEventListener('click', () => {
    const id = document.getElementById('peerIdInput').value.trim();
    if (id) connectToPeer(id);
  });
}

// Init
initPeer();
addConnectByIdUI();

// Restore last room
const savedRoom = localStorage.getItem('airxender-room');
if (savedRoom) {
  roomInput.value = savedRoom;
}

// Service worker for PWA (optional simple)
if ('serviceWorker' in navigator) {
  // Minimal SW registration can be added later
}

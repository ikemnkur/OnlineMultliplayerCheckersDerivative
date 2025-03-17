// Connect to Socket.IO
const socket = io();

// Global array to store players (from server) including their mode info.
let playersData = [];

// Global sort settings (if needed)
let sortKey = 'username';
let sortOrderAsc = true;

// DOM element references
const playerList = document.getElementById('playerList');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatArea = document.getElementById('chatArea');
const searchBar = document.getElementById('searchBar');
const sortButtons = document.querySelectorAll('#sortFilters button');

// ------------------------------
// Join Lobby & Set User Data
// ------------------------------
let username = localStorage.getItem("ombgUsername");
if (!username) {
  username = prompt("Enter your username for the lobby:") || "Anonymous";
  localStorage.setItem("ombgUsername", username);
}

// Retrieve and parse playerStats from localStorage (if available)
let playerStatsStr = localStorage.getItem('playerStats');
let playerStats = {};
if (playerStatsStr) {
  try {
    playerStats = JSON.parse(playerStatsStr);
  } catch (e) {
    console.error("Error parsing playerStats:", e);
  }
}

// Determine current betting mode; default to "none"
let bettingModeElem = document.querySelector('input[name="tool"]:checked');
let bettingMode = bettingModeElem ? bettingModeElem.value : "none";

// Construct userdata with all properties and send it to the server.
let userdata = {
  username: username,
  mode: bettingMode,
  gamesPlayed: playerStats.gamesPlayed || 0,
  gamesWon: playerStats.gamesWon || 0,
  gamesLost: playerStats.gamesLost || 0,
  gamesDraw: playerStats.gamesDraw || 0,
  winMeans: playerStats.winMeans || {},
  totalTime: playerStats.totalTime || 0,
  totalMoves: playerStats.totalMoves || 0,
  totalScoreWhenWon: playerStats.totalScoreWhenWon || 0,
  totalScoreWhenLost: playerStats.totalScoreWhenLost || 0
};
socket.emit('joinLobby', userdata);

// When the betting mode radio changes, update your mode on the server.
// Listen for changes to the betting mode radio buttons.
document.querySelectorAll('input[name="tool"]').forEach(radio => {
  radio.addEventListener('change', function () {
    const newMode = this.value;
    // Emit the updated betting mode to the server.
    socket.emit('updateBettingMode', { mode: newMode });
    console.log("Betting mode updated to:", newMode);
    // Update the local filtering if necessary.
    renderPlayers();
  });
});


// ------------------------------
// Player List Rendering
// ------------------------------
function addPlayer(player) {
  // Do not show your own entry.
  if (player.username === username) return;
  const li = document.createElement('li');
  li.textContent = player.username + " ";

  // Create a challenge button.
  const challengeBtn = document.createElement('button');
  challengeBtn.textContent = 'Challenge';
  challengeBtn.style.marginLeft = '10px';

  challengeBtn.addEventListener('click', () => {
    // Confirm challenge request.
    if (confirm(`Do you want to challenge ${player.username} to a game?`)) {
      socket.emit('challengePlayer', { challenger: username, target: player.username });
      alert(`Challenge sent to ${player.username}. Awaiting response...`);
    }
  });

  li.appendChild(challengeBtn);
  playerList.appendChild(li);
}

// function renderPlayers() {
//   // Read the current betting mode from the radio group.
//   const selectedMode = document.querySelector('input[name="tool"]:checked').value;
//   // Filter playersData to only those with the same mode and that are not you.
//   const filteredPlayers = playersData.filter(player => player.mode === selectedMode && player.username !== username);

//   // (Optionally) Apply search filtering.
//   const query = searchBar.value.trim().toLowerCase();
//   const finalPlayers = filteredPlayers.filter(player =>
//     player.username.toLowerCase().includes(query)
//   );

//   // Optionally, add sorting here if needed.
//   // For now, we simply clear and render.
//   playerList.innerHTML = '';
//   finalPlayers.forEach(player => addPlayer(player));
// }


// Render players based on selected betting mode and search.
function renderPlayers() {
  const selectedMode = document.querySelector('input[name="tool"]:checked').value;
  const query = searchBar.value.trim().toLowerCase();
  const filteredPlayers = playersData.filter(player =>
    player.mode === selectedMode && player.username !== username &&
    player.username.toLowerCase().includes(query)
  );
  playerList.innerHTML = '';
  filteredPlayers.forEach(player => addPlayer(player));
}

// Socket event for refreshed player list.
socket.on('refreshPlayers', (serverPlayers) => {
  playersData = serverPlayers;
  renderPlayers();
});

// ------------------------------
// Socket Events for Player List
// ------------------------------
socket.on('refreshPlayers', serverPlayers => {
  // Expect serverPlayers to be an array of objects { username, mode }
  playersData = serverPlayers;
  renderPlayers();
});

socket.on('playerJoined', data => {
  // data: { username, mode }
  if (data.username === username) return;
  playersData.push(data);
  renderPlayers();
});

// Update list on search.
searchBar.addEventListener('input', renderPlayers);

// Sorting buttons (if needed; you can expand this as required)
sortButtons.forEach(button => {
  button.addEventListener('click', () => {
    const newSortKey = button.getAttribute('data-sort');
    if (sortKey === newSortKey) {
      sortOrderAsc = !sortOrderAsc;
    } else {
      sortKey = newSortKey;
      sortOrderAsc = true;
    }
    // If sorting is required, you can sort the final list here.
    renderPlayers();
  });
});

// ------------------------------
// Chat Functionality
// ------------------------------
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (message !== '') {
    socket.emit('lobbyMessage', { username, message });
    chatInput.value = '';
  }
});
socket.on('lobbyMessage', (data) => {
  const msgDiv = document.createElement('div');
  msgDiv.textContent = `${data.username}: ${data.message}`;
  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
});

// ------------------------------
// Challenge Request Handling
// ------------------------------

// Incoming challenge: Only prompt if you're not the challenger.
socket.on('incomingChallenge', (data) => {
  if (data.challenger === username) return; // ignore your own challenge.
  if (confirm(`You have been challenged by ${data.challenger}. Accept challenge?`)) {
    socket.emit('challengeResponse', { challenger: data.challenger, target: username, accepted: true });
  } else {
    socket.emit('challengeResponse', { challenger: data.challenger, target: username, accepted: false });
  }
});

// For the challenger: listen for responses.
socket.on('challengeResponse', (data) => {
  if (data.accepted) {
    alert(`${data.target} accepted your challenge!`);
  } else {
    alert(`${data.target} declined your challenge.`);
  }
});

// Start game event.
socket.on('startGame', (data) => {
  // Get the current betting mode from the radio buttons.
  const currentMode = document.querySelector('input[name="tool"]:checked').value;
  
  if (currentMode === "none") {
    alert(`Starting game with ${data.opponent}.`);
    window.location.href = `game.html?roomId=${data.roomId}`;
  } else if (currentMode === "simple") {
    alert(`Place bets on game with ${data.opponent}.`);
    window.location.href = `simplebet?roomId=${data.roomId}`;
  } else if (currentMode === "advanced") {
    alert(`Placing wagers and bets game with ${data.opponent}.`);
    window.location.href = `advancedbet?roomId=${data.roomId}`;
  }
});

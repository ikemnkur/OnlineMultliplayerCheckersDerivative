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
let bettingModeElem = document.querySelector('input[name="betMode"]:checked');
let bettingMode = bettingModeElem ? bettingModeElem.value : "none";

// Determine current players mode from the active player mode button; default to "none"
let playersModeElem = document.querySelector('.player-mode-button.active');
let playersMode = playersModeElem ? playersModeElem.getAttribute('data-value') : "none";

// Construct userdata with both mode properties and send it to the server.
let userdata = {
  username: username,
  mode: bettingMode,
  playersMode: playersMode,
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

// Listen for changes on betting mode radio buttons.
document.querySelectorAll('input[name="betMode"]').forEach(radio => {
  radio.addEventListener('change', function () {
    const newBettingMode = this.value;
    socket.emit('updateBettingMode', { mode: newBettingMode });
    console.log("Betting mode updated to:", newBettingMode);
    renderPlayers();
  });
});

// Listen for clicks on player mode buttons.
document.querySelectorAll('.player-mode-button').forEach(button => {
  button.addEventListener('click', function() {
    // Remove active styling from all buttons.
    document.querySelectorAll('.player-mode-button').forEach(btn => btn.classList.remove('active'));
    // Set active styling on the clicked button.
    this.classList.add('active');
    
    const newPlayersMode = this.getAttribute('data-value');
    socket.emit('updatePlayersMode', { playersMode: newPlayersMode });
    console.log("Players mode updated to:", newPlayersMode);
    renderPlayers();
  });
});

// When rendering players, you can continue to filter by betting mode (or update as needed)
function renderPlayers() {
  const bettingModeElem = document.querySelector('input[name="tool"]:checked');
  const selectedBettingMode = bettingModeElem ? bettingModeElem.value : "none";
  const query = searchBar.value.trim().toLowerCase();
  const filteredPlayers = playersData.filter(player =>
    player.mode === selectedBettingMode && player.username !== username &&
    player.username.toLowerCase().includes(query)
  );
  playerList.innerHTML = '';
  filteredPlayers.forEach(player => addPlayer(player));
}

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
  // Get the current betting mode from the betting mode radio buttons.
  const selectedBettingMode = document.querySelector('input[name="betMode"]:checked').value;

  if (selectedBettingMode === "none") {
    alert(`Starting game with ${data.opponent}.`);
    window.location.href = `game.html?roomId=${data.roomId}`;
  } else if (selectedBettingMode === "simple") {
    alert(`Place bets on game with ${data.opponent}.`);
    window.location.href = `simplebet?roomId=${data.roomId}`;
  } else if (selectedBettingMode === "advanced") {
    alert(`Placing wagers and bets game with ${data.opponent}.`);
    window.location.href = `advancedbet?roomId=${data.roomId}`;
  }
});
// Listen for clicks on player mode buttons.
document.querySelectorAll('.player-mode-button').forEach(button => {
  button.addEventListener('click', function() {
    // Remove active styling from all buttons.
    document.querySelectorAll('.player-mode-button').forEach(btn => btn.classList.remove('active'));
    // Set active styling on the clicked button.
    this.classList.add('active');
    
    const newPlayersMode = this.getAttribute('data-value');
    socket.emit('updatePlayersMode', { playersMode: newPlayersMode });
    console.log("Players mode updated to:", newPlayersMode);
    
    // Update UI based on selected mode.
    if(newPlayersMode === '4player' || newPlayersMode === '8player'){
      // Change search bar placeholder.
      document.getElementById('searchBar').placeholder = "Search Matches";
      // Hide Betting Mode fieldset.
      document.getElementById('bettingModeFieldset').style.display = 'none';
      // Hide sort filters.
      document.getElementById('sortFilters').style.display = 'none';
      // Show plus button to trigger match creation form.
      document.getElementById('addMatchButton').style.display = 'block';
    } else {
      // Revert search bar placeholder.
      document.getElementById('searchBar').placeholder = "Search players...";
      // Show Betting Mode fieldset.
      document.getElementById('bettingModeFieldset').style.display = 'flex';
      // Show sort filters.
      document.getElementById('sortFilters').style.display = 'flex';
      // Hide plus button and match creation overlay.
      document.getElementById('addMatchButton').style.display = 'none';
      document.getElementById('matchCreationOverlay').style.display = 'none';
    }
    
    renderPlayers();
  });
});

// Listener to toggle the match creation overlay
document.getElementById('addMatchButton').addEventListener('click', function(){
  const matchForm = document.getElementById('matchCreationOverlay');
  matchForm.style.display = (matchForm.style.display === 'block') ? 'none' : 'block';
});

// Listener for create match button.
document.getElementById('createMatchButton').addEventListener('click', function(){
  const title = document.getElementById('matchTitle').value.trim();
  const betModeElem = document.querySelector('input[name="matchBetMode"]:checked');
  const matchBetMode = betModeElem ? betModeElem.value : 'none';
  const matchTime = document.getElementById('matchTime').value.trim();
  const matchNote = document.getElementById('matchNote').value.trim();
  const suggestedElo = document.getElementById('suggestedElo').value.trim();
  const suggestedExperience = document.getElementById('suggestedExperience').value;
  const username = localStorage.getItem("ombgUsername");
  
  if(title === ''){
    alert("Please enter a match title.");
    return;
  }
  // Emit or process match creation:
  socket.emit('createMatch', { 
    title, 
    matchBetMode, 
    matchTime, 
    matchNote, 
    suggestedElo, 
    suggestedExperience,
    username
  });
  alert("Match created!");
  // Optionally, hide the overlay after creation.
  document.getElementById('matchCreationOverlay').style.display = 'none';
});
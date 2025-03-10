// Connect to Socket.IO
const socket = io();

// Global array to store player objects with simulated stats.
let players = [];

// Global sort settings
let sortKey = 'username';
let sortOrderAsc = true; 

// DOM element references
const playerList = document.getElementById('playerList');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatArea = document.getElementById('chatArea');
const searchBar = document.getElementById('searchBar');
const sortButtons = document.querySelectorAll('#sortFilters button');

// Ask for username (replace with proper login if needed)
let username = localStorage.getItem("ombgUsername")
if(username == null){
  username = prompt("Enter your username for the lobby:") || "Anonymous";
  localStorage.setItem("ombgUsername", username)
}


// Emit join event
socket.emit('joinLobby', username);

// Utility: Generate a random integer
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// When a new player joins, simulate extra stats and add them.
socket.on('playerJoined', (data) => {
  // Avoid duplicating yourself.
  if (data.username === username) return;
  const player = {
    username: data.username,
    avgScore: getRandomInt(0, 100),
    gamesPlayed: getRandomInt(1, 20),
    avgTime: getRandomInt(30, 300)
  };
  players.push(player);
  updatePlayerList();
});

// When a player leaves, remove them.
socket.on('playerLeft', (data) => {
  players = players.filter(p => p.username !== data.username);
  updatePlayerList();
});

// Listen for periodic refresh from the server.
socket.on('refreshPlayers', (serverPlayers) => {
  // Merge the server list with existing stats if available.
  players = serverPlayers.map(sp => {
    // Skip if the username already exists in our array.
    const existing = players.find(p => p.username === sp.username);
    return existing || {
      username: sp.username,
      avgScore: getRandomInt(0, 100),
      gamesPlayed: getRandomInt(1, 20),
      avgTime: getRandomInt(30, 300)
    };
  });
  updatePlayerList();
});

// Chat functionality
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

// Search filtering: update on each keystroke.
searchBar.addEventListener('input', updatePlayerList);

// Sorting buttons
sortButtons.forEach(button => {
  button.addEventListener('click', () => {
    const newSortKey = button.getAttribute('data-sort');
    if (sortKey === newSortKey) {
      sortOrderAsc = !sortOrderAsc;
    } else {
      sortKey = newSortKey;
      sortOrderAsc = true;
    }
    updatePlayerList();
  });
});

// Update the player list display.
function updatePlayerList() {
  playerList.innerHTML = '';
  const query = searchBar.value.trim().toLowerCase();
  
  let filteredPlayers = players.filter(player => 
    player.username.toLowerCase().includes(query)
  );
  
  filteredPlayers.sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    if (typeof valA === 'string') {
      return sortOrderAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return sortOrderAsc ? valA - valB : valB - valA;
    }
  });
  
  filteredPlayers.forEach(player => {
    const li = document.createElement('li');
    li.textContent = `${player.username} - Avg Score: ${player.avgScore}, Games Played: ${player.gamesPlayed}, Avg Time: ${player.avgTime}s`;
    
    // Only add a challenge button if it's not your own username.
    if (player.username !== username) {
      const challengeBtn = document.createElement('button');
      challengeBtn.textContent = 'Challenge';
      challengeBtn.style.marginLeft = '10px';
      challengeBtn.addEventListener('click', () => {
        if (confirm(`Do you want to challenge ${player.username} to a game?`)) {
          socket.emit('challengePlayer', { challenger: username, target: player.username });
        }
      });
      li.appendChild(challengeBtn);
    }
    
    playerList.appendChild(li);
  });
}

// Listen for an incoming challenge.
socket.on('incomingChallenge', (data) => {
  if (confirm(`You have been challenged by ${data.challenger}. Accept challenge?`)) {
    socket.emit('challengeResponse', { challenger: data.challenger, target: username, accepted: true });
  } else {
    socket.emit('challengeResponse', { challenger: data.challenger, target: username, accepted: false });
  }
});

// Listen for challenge responses (for the challenger).
socket.on('challengeResponse', (data) => {
  if (data.accepted) {
    alert(`${data.target} accepted your challenge!`);
  } else {
    alert(`${data.target} declined your challenge.`);
  }
});

// Listen for start game signal.
socket.on('startGame', (data) => {
  alert(`Starting game with ${data.opponent}.`);
  // Redirect to the game page with the room id (adjust the URL if needed)
  window.location.href = `game.html?roomId=${data.roomId}`;
});

// public/client.js

// Prompt for a nickname before connecting.
let nickname = prompt("Enter your nickname:");
if (!nickname) {
  nickname = "Player";
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const scoreDiv = document.getElementById('score');
const timerRedSpan = document.getElementById('timerRed');
const timerBlackSpan = document.getElementById('timerBlack');

const socket = io();

// Send the nickname to the server.
socket.emit('setNickname', nickname);

const gridSize = 8;
const cellSize = canvas.width / gridSize;
let board = []; // board state from server
let myColor = null;
let myTurn = false;
let myNickname = nickname;
let opponentNickname = "Opponent";
let selectedPiece = null; // stored in server (unrotated) coordinates

// Preload sound effects (assumes you have these files in public/sounds/)
const selectSound = new Audio('sounds/select.wav');
const moveSound = new Audio('sounds/PieceMove.wav');
const captureSound = new Audio('sounds/capture.wav');
const warningSound = new Audio('sounds/hurryup.wav');
const winSound = new Audio('sounds/WinGame.wav');
const loseSound = new Audio('sounds/LoseGame.wav');
const startSound = new Audio('sounds/GameStart.mp3');

let warningPlayed = false;  // Play only once per turn
let lastTurn;               // To detect turn change

// Draw the board and pieces with rotation for black players.
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw board squares.
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // For display, if you're black, flip the row.
      let dispRow = (myColor === 'black') ? (gridSize - 1 - r) : r;
      ctx.fillStyle = ((r + c) % 2 === 1) ? "#769656" : "#EEEED2";
      ctx.fillRect(c * cellSize, dispRow * cellSize, cellSize, cellSize);
      
      // Highlight if this cell is the selected piece.
      if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.strokeRect(c * cellSize, dispRow * cellSize, cellSize, cellSize);
      }
    }
  }
  
  // Draw pieces.
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const piece = board[r] ? board[r][c] : null;
      if (piece) {
        let dispRow = (myColor === 'black') ? (gridSize - 1 - r) : r;
        ctx.beginPath();
        ctx.arc(c * cellSize + cellSize/2, dispRow * cellSize + cellSize/2, cellSize/2 - 10, 0, Math.PI * 2);
        ctx.fillStyle = piece.color;
        ctx.fill();
        // Optional king indicator.
        if (piece.king) {
          ctx.fillStyle = "gold";
          ctx.font = "20px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("K", c * cellSize + cellSize/2, dispRow * cellSize + cellSize/2);
        }
      }
    }
  }
}

// Handle clicks for move selection.
canvas.addEventListener('click', (e) => {
  if (!myTurn) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  // Compute the displayed row; if you're black, convert it back to server (unrotated) row.
  let row = Math.floor(y / cellSize);
  if (myColor === 'black') {
    row = gridSize - 1 - row;
  }
  
  if (!selectedPiece) {
    if (board[row] && board[row][col] && board[row][col].color === myColor) {
      selectedPiece = { row, col };
      drawBoard();
      selectSound.play();
    }
  } else {
    if (selectedPiece.row === row && selectedPiece.col === col) {
      selectedPiece = null;
      drawBoard();
      return;
    }
    socket.emit('makeMove', { from: selectedPiece, to: { row, col } });
    selectedPiece = null;
  }
});

socket.on('gameStart', (data) => {
  myColor = data.color;
  myNickname = data.yourNickname;
  opponentNickname = data.opponentNickname;
  statusDiv.innerText = `You are ${myNickname} (${myColor}).`;
  startSound.play();
});

socket.on('update', (data) => {
  board = data.board;
  myTurn = data.turn === myColor;
  
  // Reset warning sound only if turn changed.
  if (lastTurn !== undefined && data.turn !== lastTurn) {
    warningPlayed = false;
  }
  lastTurn = data.turn;
  
  drawBoard();
  
  // Compute and display scores.
  let scores = data.scores;
  let myScore, oppScore;
  if (myColor === 'red') {
    myScore = scores.scoreRed;
    oppScore = scores.scoreBlack;
  } else {
    myScore = scores.scoreBlack;
    oppScore = scores.scoreRed;
  }
  scoreDiv.innerText = `Score: You ${myScore} - Opponent ${oppScore}`;
  
  // Update status with turn message.
  statusDiv.innerText = `${myTurn ? "Your turn" : "Opponent's turn"}. You: ${myNickname} (${myColor}) vs ${opponentNickname}`;
  
  // Play move sounds.
  if (data.moveType) {
    if (data.moveType === 'capture') {
      captureSound.play();
    } else if (data.moveType === 'move') {
      moveSound.play();
    }
  }
});

socket.on('timer', (data) => {
  timerRedSpan.innerText = data.timerRed;
  timerBlackSpan.innerText = data.timerBlack;
  
  if (myColor === 'red' && data.timerRed < 20 && !warningPlayed) {
    warningSound.play();
    warningPlayed = true;
  }
  if (myColor === 'black' && data.timerBlack < 20 && !warningPlayed) {
    warningSound.play();
    warningPlayed = true;
  }
});

socket.on('gameOver', (data) => {
  // Display win/lose message with win reason.
  if (data.winner) {
    if (data.winner === myColor) {
      statusDiv.innerText = `You (${myColor}) have: Won via ${data.winReason}`;
      winSound.play();
    } else {
      statusDiv.innerText = `You (${myColor}) have: Lost via ${data.winReason}`;
      loseSound.play();
    }
  } else {
    statusDiv.innerText = "Draw!";
  }
  myTurn = false;
});

drawBoard()
// public/client.js

// Prompt for a nickname before connecting.
let nickname = prompt("Enter your nickname:");
if (!nickname) {
  nickname = "Player";
}
localStorage.setItem("nickname", nickname);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const scoreDiv = document.getElementById('score');
const timerRedSpan = document.getElementById('timerRed');
const timerBlackSpan = document.getElementById('timerBlack');
const moveList = document.getElementById('moveList');

const prevButton = document.getElementById('prevButton');
const playButton = document.getElementById('playButton');
const nextButton = document.getElementById('nextButton');
const reviewButton = document.getElementById('reviewButton');
const previewButton = document.getElementById('previewButton');
const newGameButton = document.getElementById('newGameButton');
const copyButton = document.getElementById('copyButton');
const previewText = document.getElementById('previewText');

const socket = io();
socket.emit('setNickname', nickname);

const gridSize = 8;
const cellSize = canvas.width / gridSize;
let board = []; // current board state from server
let myColor = null;
let myTurn = false;
let myNickname = nickname;
let opponentNickname = "Opponent";
let selectedPiece = null; // stored in server (unrotated) coordinates

// Variables for preview mode.
let previewMode = false;       // if true, we're in preview/review mode
let previewHistory = [];       // move history array for previewing
let previewIndex = 0;          // current move index in preview mode
let initialBoard = null;       // deep copy of the board at game start

// Preload sound effects.
const selectSound = new Audio('sounds/select.mp3');
const moveSound = new Audio('sounds/move.mp3');
const captureSound = new Audio('sounds/capture.mp3');
const warningSound = new Audio('sounds/warning.mp3');
const winSound = new Audio('sounds/win.mp3');
const loseSound = new Audio('sounds/lose.mp3');
const startSound = new Audio('sounds/start.mp3');

let warningPlayed = false;  // play only once per turn
let lastTurn;               // to detect turn change

// If the board is empty on load, draw an empty grid.
window.onload = function() {
  if (!board || board.length === 0) {
    board = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    drawBoard();
  }
};

// Utility: Deep clone a board.
function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

// Compute local scores from a board state.
function computeScoresLocal(simBoard) {
  let scoreRed = 0, scoreBlack = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const piece = simBoard[r][c];
      if (piece) {
        if (piece.color === 'red') {
          scoreRed += Math.pow(8 - r, 2);
        } else {
          scoreBlack += Math.pow(r + 1, 2);
        }
      }
    }
  }
  return { scoreRed, scoreBlack };
}

// Simulate board state at a given move index.
function simulateBoardAtMove(index, history, baseBoard) {
  let simBoard = cloneBoard(baseBoard);
  for (let i = 0; i <= index && i < history.length; i++) {
    const move = history[i];
    const from = move.from;
    const to = move.to;
    const piece = simBoard[from.row][from.col];
    if (piece) {
      simBoard[to.row][to.col] = piece;
      simBoard[from.row][from.col] = null;
      if (move.moveType === 'capture') {
        let midRow = (from.row + to.row) / 2;
        let midCol = (from.col + to.col) / 2;
        simBoard[midRow][midCol] = null;
      }
    }
  }
  return simBoard;
}

// Update the preview board state and update score/time/timer display.
function updatePreviewBoard() {
  if (!previewMode || !initialBoard) return;
  board = simulateBoardAtMove(previewIndex, previewHistory, initialBoard);
  drawBoard();
  Array.from(moveList.children).forEach((li, idx) => {
    li.style.backgroundColor = (idx === previewIndex) ? "#ddd" : "";
  });
  let simScores = computeScoresLocal(board);
  let myScore, oppScore;
  if (myColor === 'red') {
    myScore = simScores.scoreRed;
    oppScore = simScores.scoreBlack;
  } else {
    myScore = simScores.scoreBlack;
    oppScore = simScores.scoreRed;
  }
  let currentMove = previewHistory[previewIndex] || {};
  let currentTime = currentMove.timestamp || 0;
  timerRedSpan.innerText = (currentMove.timerRed !== undefined) ? currentMove.timerRed : '';
  timerBlackSpan.innerText = (currentMove.timerBlack !== undefined) ? currentMove.timerBlack : '';
  scoreDiv.innerText = `Score: You ${myScore} - Opponent ${oppScore}. Move Time: ${currentTime}s`;
}

// Draw the board (with rotation for black).
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let dispRow = (myColor === 'black') ? (gridSize - 1 - r) : r;
      ctx.fillStyle = ((r + c) % 2 === 1) ? "#769656" : "#EEEED2";
      ctx.fillRect(c * cellSize, dispRow * cellSize, cellSize, cellSize);
      if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.strokeRect(c * cellSize, dispRow * cellSize, cellSize, cellSize);
      }
    }
  }
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const piece = board[r] ? board[r][c] : null;
      if (piece) {
        let dispRow = (myColor === 'black') ? (gridSize - 1 - r) : r;
        ctx.beginPath();
        ctx.arc(c * cellSize + cellSize/2, dispRow * cellSize + cellSize/2, cellSize/2 - 10, 0, Math.PI * 2);
        ctx.fillStyle = piece.color;
        ctx.fill();
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

// Update move history display (as an unordered list).
function updateMoveHistory(moves) {
  moveList.innerHTML = "";
  moves.forEach((move, index) => {
    let li = document.createElement("li");
    li.textContent = `${move.timestamp}s - ${move.player.toUpperCase()} from (${move.from.row},${move.from.col}) to (${move.to.row},${move.to.col})` +
                     (move.moveType && move.moveType !== "move" ? ` [${move.moveType.toUpperCase()}]` : "");
    li.addEventListener('click', () => {
      if (!previewMode) return;
      previewIndex = index;
      updatePreviewBoard();
    });
    moveList.appendChild(li);
  });
}

// Handle canvas clicks for move selection.
canvas.addEventListener('click', (e) => {
  if (!myTurn || previewMode) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
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

// Listen for waitingForReady event and prompt the user.
socket.on('waitingForReady', (data) => {
  const ready = confirm(
    "A new game is available!\nYou are " +
      data.color.toUpperCase() +
      " (" +
      data.yourNickname +
      ").\nYour opponent is " +
      data.opponentNickname +
      ".\n\nAre you ready to start the game?"
  );
  if (ready) {
    socket.emit('playerReady');
  } else {
    alert("Waiting for you to be ready. Refresh the page to try again.");
  }
});

// When gameStart is received, initialize game state.
socket.on('gameStart', (data) => {
  myColor = data.color;
  myNickname = data.yourNickname;
  opponentNickname = data.opponentNickname;
  statusDiv.innerText = `Game started! You are ${myNickname} (${myColor}).`;
  startSound.play();
});

// --- Stats Saving via localStorage ---
// We'll update stats in localStorage after a game is over.
function updatePlayerStats(result, moveHistory, scores, winReason) {
  // Retrieve saved stats or initialize.
  let stats = JSON.parse(localStorage.getItem("playerStats")) || {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
    winMeans: {}, // e.g., { "Timeout": 0, "Breaching other Side": 0, "Abandonment": 0, "Higher Score": 0 }
    totalTime: 0, // seconds
    totalMoves: 0,
    totalScoreWhenWon: 0,
    totalScoreWhenLost: 0
  };
  let gameTime = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].timestamp : 0;
  let moves = moveHistory.length;
  stats.gamesPlayed++;
  stats.totalTime += gameTime;
  stats.totalMoves += moves;
  if (result === "win") {
    stats.gamesWon++;
    let reason = winReason || "Unknown";
    stats.winMeans[reason] = (stats.winMeans[reason] || 0) + 1;
    stats.totalScoreWhenWon += (myColor === 'red' ? scores.scoreRed : scores.scoreBlack);
  } else if (result === "loss") {
    stats.gamesLost++;
    stats.totalScoreWhenLost += (myColor === 'red' ? scores.scoreRed : scores.scoreBlack);
  } else {
    stats.gamesDraw++;
  }
  localStorage.setItem("playerStats", JSON.stringify(stats));
}

// On gameOver, update stats.
socket.on('gameOver', (data) => {
  if (data.winner) {
    if (data.winner === myColor) {
      statusDiv.innerText = `You (${myColor}) have: Won via ${data.winReason}`;
      winSound.play();
      updatePlayerStats("win", previewHistory, data.scores, data.winReason);
    } else {
      statusDiv.innerText = `You (${myColor}) have: Lost via ${data.winReason}`;
      loseSound.play();
      updatePlayerStats("loss", previewHistory, data.scores);
    }
  } else {
    statusDiv.innerText = "Draw!";
    updatePlayerStats("draw", previewHistory, data.scores);
  }
  myTurn = false;
});

socket.on('update', (data) => {
  if (!previewMode) {
    board = data.board;
  }
  myTurn = data.turn === myColor;
  if (!initialBoard && data.board) {
    initialBoard = cloneBoard(data.board);
  }
  if (!previewMode) {
    previewHistory = data.moveHistory || [];
    previewIndex = previewHistory.length - 1;
  }
  if (!previewMode) {
    drawBoard();
  }
  updateMoveHistory(previewHistory);
  let scores = data.scores;
  let myScore, oppScore;
  if (myColor === 'red') {
    myScore = scores.scoreRed;
    oppScore = scores.scoreBlack;
  } else {
    myScore = scores.scoreBlack;
    oppScore = scores.scoreRed;
  }
  if (previewMode && initialBoard) {
    let simScores = computeScoresLocal(simulateBoardAtMove(previewIndex, previewHistory, initialBoard));
    myScore = (myColor === 'red') ? simScores.scoreRed : simScores.scoreBlack;
    oppScore = (myColor === 'red') ? simScores.scoreBlack : simScores.scoreRed;
    let currentTime = previewHistory[previewIndex] ? previewHistory[previewIndex].timestamp : 0;
    scoreDiv.innerText = `Score: You ${myScore} - Opponent ${oppScore}. Move Time: ${currentTime}s`;
  } else {
    scoreDiv.innerText = `Score: You ${myScore} - Opponent ${oppScore}`;
  }
  statusDiv.innerText = `${myTurn ? "Your turn" : "Opponent's turn"}. You: ${myNickname} (${myColor}) vs ${opponentNickname}`;
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

// --- Button Event Handlers ---

prevButton.addEventListener('click', () => {
  if (!previewMode || previewHistory.length === 0) return;
  previewIndex = Math.max(0, previewIndex - 1);
  updatePreviewBoard();
});

nextButton.addEventListener('click', () => {
  if (!previewMode || previewHistory.length === 0) return;
  previewIndex = Math.min(previewHistory.length - 1, previewIndex + 1);
  updatePreviewBoard();
});

let mode = "pause";
let autoPlayInterval = null;

playButton.addEventListener('click', () => {
  if (mode === "play") {
    mode = "pause";
    clearInterval(autoPlayInterval);
  } else {
    mode = "play";
    autoPlayInterval = setInterval(() => {
      if (!previewMode || previewHistory.length === 0) return;
      if (previewIndex >= previewHistory.length - 1) {
         clearInterval(autoPlayInterval);
         mode = "pause";
         return;
      }
      previewIndex = Math.min(previewHistory.length - 1, previewIndex + 1);
      updatePreviewBoard();
    }, 1000);
  }
});

reviewButton.addEventListener('click', () => {
  if (previewHistory.length === 0) return;
  previewMode = true;
  previewIndex = previewHistory.length - 1;
  updatePreviewBoard();
  statusDiv.innerText = `Review Mode: Showing final move.`;
});

previewButton.addEventListener('click', () => {
  previewHistory = [];
  moveList.innerHTML = "";
  try {
    let parsed = JSON.parse(previewText.value);
    if (Array.isArray(parsed)) {
      previewMode = true;
      previewHistory = parsed;
      previewIndex = previewHistory.length - 1;
      if (!initialBoard) {
        alert("No initial board state available from current game; using default initial board.");
        initialBoard = createInitialBoard();
      }
      updatePreviewBoard();
      statusDiv.innerText = `Preview Mode: Loaded external game.`;
      updateMoveHistory(previewHistory);
    } else {
      alert("Invalid move history format.");
    }
  } catch (e) {
    alert("Error parsing move history JSON.");
  }
});

newGameButton.addEventListener('click', () => {
  location.reload();
});

copyButton.addEventListener('click', () => {
  if (previewHistory.length === 0) return;
  navigator.clipboard.writeText(JSON.stringify(previewHistory, null, 2))
    .then(() => {
      alert("Move history copied to clipboard!");
    })
    .catch(err => {
      alert("Failed to copy: " + err);
    });
});

// Client-side createInitialBoard for preview mode.
function createInitialBoard() {
  let board = Array(8).fill().map(() => Array(8).fill(null));
  for (let c = 1; c <= 6; c++) {
    board[0][c] = { color: 'black', king: false };
  }
  for (let c = 2; c <= 5; c++) {
    board[1][c] = { color: 'black', king: false };
  }
  for (let c = 3; c <= 4; c++) {
    board[2][c] = { color: 'black', king: false };
  }
  for (let c = 1; c <= 6; c++) {
    board[7][c] = { color: 'red', king: false };
  }
  for (let c = 2; c <= 5; c++) {
    board[6][c] = { color: 'red', king: false };
  }
  for (let c = 3; c <= 4; c++) {
    board[5][c] = { color: 'red', king: false };
  }
  return board;
}

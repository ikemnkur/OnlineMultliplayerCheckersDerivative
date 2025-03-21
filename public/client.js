// public/client.js

// Remove lobby-related username logic.
// This file is now solely for game play. The username/lobby is handled elsewhere.

// Get DOM elements for the game.
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const scoreDiv = document.getElementById('score');
const timerRedSpan = document.getElementById('timerRed');
const timerBlackSpan = document.getElementById('timerBlack');

// Element for countdown (ensure this element exists in your HTML)
const cntdwnObj = document.getElementById("cntdwn");
const cntdwnTxtObj = document.getElementById("cntdwnTxt");

// Connect to Socket.IO in game mode.
const socket = io({ query: { mode: 'game' } });

// Game variables.
const gridSize = 8;
const cellSize = canvas.width / gridSize;
let board = []; // current board state from server
let myColor = null;
let myTurn = false;
let selectedPiece = null; // piece selected by the user

// Variables for preview/review mode (if applicable).
let previewMode = false;
let previewHistory = [];
let previewIndex = 0;
let initialBoard = null;

// The following elements are used only if they exist (for preview/review mode).
const moveList = document.getElementById('moveList');
const prevButton = document.getElementById('prevButton');
const playButton = document.getElementById('playButton');
const nextButton = document.getElementById('nextButton');
const reviewButton = document.getElementById('reviewButton');
const previewButton = document.getElementById('previewButton');
const newGameButton = document.getElementById('newGameButton');
const backToLobbyButton = document.getElementById('backToLobby');
const copyButton = document.getElementById('copyButton');
const previewText = document.getElementById('previewText');

// Preload sound effects.
const selectSound = new Audio('/sounds/select.mp3');
const moveSound = new Audio('/sounds/move.mp3');
const captureSound = new Audio('/sounds/capture.mp3');
const warningSound = new Audio('/sounds/warning.mp3');
const winSound = new Audio('/sounds/win.mp3');
const loseSound = new Audio('/sounds/lose.mp3');
const startSound = new Audio('/sounds/start.mp3');

let warningPlayed = false;
let gameOver = false; // should be updated on game over

// When the page loads, if the board is empty, draw an empty grid.
window.onload = function () {
  if (!board || board.length === 0) {
    board = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    drawBoard();
  }
};

// ----------------------
// POSSIBLE MOVES DISPLAY
// ----------------------

// Client-side check for valid moves using similar rules to the server.
function isValidLocalMove(from, to) {
  // Check bounds.
  if (to.row < 0 || to.row >= gridSize || to.col < 0 || to.col >= gridSize) return false;
  if (board[to.row][to.col] !== null) return false;
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const forwardDir = (myColor === 'red') ? -1 : 1;
  // Horizontal move: same row, one column over.
  if (dr === 0 && Math.abs(dc) === 1) return true;
  // Vertical forward move.
  if (dr === forwardDir && dc === 0) return true;
  // Capture move: two steps diagonally forward.
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2 && dr === forwardDir * 2) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    const midPiece = board[midRow][midCol];
    if (midPiece && midPiece.color !== myColor) return true;
  }
  return false;
}

// Compute and return an array of possible moves for the selected piece.
function computePossibleMoves(from) {
  let moves = [];
  const forwardDir = (myColor === 'red') ? -1 : 1;
  const candidates = [
    { row: from.row, col: from.col - 1 },
    { row: from.row, col: from.col + 1 },
    { row: from.row + forwardDir, col: from.col },
    { row: from.row + 2 * forwardDir, col: from.col - 2 },
    { row: from.row + 2 * forwardDir, col: from.col + 2 }
  ];
  candidates.forEach(to => {
    if (isValidLocalMove(from, to)) {
      moves.push(to);
    }
  });
  return moves;
}

// ----------------------
// DRAWING THE BOARD
// ----------------------

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw board squares.
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // If playing as black, flip the board vertically.
      let dispRow = (myColor === 'black') ? (gridSize - 1 - r) : r;
      ctx.fillStyle = ((r + c) % 2 === 1) ? "#769656" : "#EEEED2";
      ctx.fillRect(c * cellSize, dispRow * cellSize, cellSize, cellSize);
      // Highlight the square if it is the selected piece.
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
        ctx.arc(c * cellSize + cellSize / 2, dispRow * cellSize + cellSize / 2, cellSize / 2 - 10, 0, Math.PI * 2);
        ctx.fillStyle = piece.color;
        ctx.fill();
        if (piece.king) {
          ctx.fillStyle = "gold";
          ctx.font = "20px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("K", c * cellSize + cellSize / 2, dispRow * cellSize + cellSize / 2);
        }
      }
    }
  }
  // If a piece is selected, draw blue dots for possible moves.
  if (selectedPiece) {
    const possibleMoves = computePossibleMoves(selectedPiece);
    possibleMoves.forEach(move => {
      // Calculate center of target square.
      let dispRow = (myColor === 'black') ? (gridSize - 1 - move.row) : move.row;
      let x = move.col * cellSize + cellSize / 2;
      let y = dispRow * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "blue";
      ctx.fill();
    });
  }
}

// ----------------------
// HANDLE MOVE HISTORY & PREVIEW (if applicable)
// ----------------------
// (Keep your existing preview/review functions unchanged. They already check for null elements.)

function updateMoveHistory(moves) {
  if (!moveList) return;
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

function updatePreviewBoard() {
  if (!previewMode || !initialBoard) return;
  board = simulateBoardAtMove(previewIndex, previewHistory, initialBoard);
  drawBoard();
  if (moveList) {
    Array.from(moveList.children).forEach((li, idx) => {
      li.style.backgroundColor = (idx === previewIndex) ? "#ddd" : "";
    });
  }
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

// ----------------------
// HANDLE USER INTERACTIONS (Move Selection)
// ----------------------

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
    // Select a piece if it belongs to the player.
    if (board[row] && board[row][col] && board[row][col].color === myColor) {
      selectedPiece = { row, col };
      drawBoard();
      selectSound.play();
    }
  } else {
    // If clicking the same square, cancel selection.
    if (selectedPiece.row === row && selectedPiece.col === col) {
      selectedPiece = null;
      drawBoard();
      return;
    }
    // Otherwise, emit the move.
    socket.emit('makeMove', { from: selectedPiece, to: { row, col } });
    selectedPiece = null;
  }
});

// ----------------------
// GAME STATE UPDATES VIA SOCKET EVENTS
// ----------------------

socket.on('waitingForReady', (data) => {
  // Start a 5-second countdown before emitting playerReady.
  let countdown = 5;
  if (cntdwnObj && !gameOver) {
    cntdwnObj.hidden = false;
    cntdwnObj.innerText = countdown;
    let x = setInterval(() => {
      countdown--;
      cntdwnObj.innerText = countdown;
      if (countdown <= 0) {
        clearInterval(x);
        if (!gameOver) {
          socket.emit('playerReady');
        } else {
          // alert("Waiting for you to be ready. Refresh the page to try again.");
          console.log("Game Over")
        }
        cntdwnTxtObj.hidden = true;
      }
    }, 1000);
  }
});

socket.on('gameStart', (data) => {
  myColor = data.color;
  statusDiv.innerText = `Game started! You are ${data.yourNickname} (${data.color}).`;
  startSound.play();
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
  scoreDiv.innerText = `Score: You ${myScore} - Opponent ${oppScore}`;
  statusDiv.innerText = `${myTurn ? "Your turn" : "Opponent's turn"}.`;
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
  gameOver = true;
  if (data.winner) {
    if (data.winner === myColor) {
      statusDiv.innerText = `You (${myColor}) won via ${data.winReason}`;
      winSound.play();
    } else {
      statusDiv.innerText = `You (${myColor}) lost via ${data.winReason}`;
      loseSound.play();
    }
  } else {
    statusDiv.innerText = "Draw!";
  }
  myTurn = false;
  // Optionally update stats...
});

// Utility: Deep clone a board.
function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}



// --- Button Event Handlers (only if the buttons exist) ---

if (prevButton) {
  prevButton.addEventListener('click', () => {
    if (!previewMode || previewHistory.length === 0) return;
    previewIndex = Math.max(0, previewIndex - 1);
    updatePreviewBoard();
  });
}

if (nextButton) {
  nextButton.addEventListener('click', () => {
    if (!previewMode || previewHistory.length === 0) return;
    previewIndex = Math.min(previewHistory.length - 1, previewIndex + 1);
    updatePreviewBoard();
  });
}

let mode = "pause";
let autoPlayInterval = null;
if (playButton) {
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
}

if (reviewButton) {
  reviewButton.addEventListener('click', () => {
    if (previewHistory.length === 0) return;
    previewMode = true;
    previewIndex = previewHistory.length - 1;
    updatePreviewBoard();
    prevButton.hidden = false;
    prevButton.hidden = false;
    prevButton.hidden = false;
    statusDiv.innerText = `----------------- Review Mode -----------------`;
  });
}

if (previewButton) {
  previewButton.addEventListener('click', () => {
    previewHistory = [];
    if (moveList) moveList.innerHTML = "";
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
        // make hidden ui button visble
        prevButton.hidden = false;
        prevButton.hidden = false;
        prevButton.hidden = false;
        statusDiv.innerText = `---------------- Preview Mode: Loaded external game. -----------------`;
        updateMoveHistory(previewHistory);
      } else {
        alert("Invalid move history format.");
      }
    } catch (e) {
      alert("Error parsing move history JSON.");
    }
  });
}

if (newGameButton) {
  newGameButton.addEventListener('click', () => {
    location.reload();
  });
}

if (backToLobbyButton) {
  backToLobbyButton.addEventListener('click', () => {
    history.back()
    location.href = "./lobby"
  });
}

if (copyButton) {
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
}

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

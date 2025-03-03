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
const moveList = document.getElementById('moveList');

const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const reviewButton = document.getElementById('reviewButton');
const previewButton = document.getElementById('previewButton');
const newGameButton = document.getElementById('newGameButton');
const copyButton = document.getElementById('copyButton');
const previewText = document.getElementById('previewText');

const socket = io();

// Send the nickname to the server.
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

// If the board is empty on load (e.g. page refresh) draw an empty grid.
window.onload = function() {
  if (!board || board.length === 0) {
    board = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    drawBoard();
  }
};

// Compute local scores from a board state.
// For red: sum((8 - row)^2) for each red piece.
// For black: sum((row + 1)^2) for each black piece.
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

// Deep clone a board.
function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
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

// Update the preview board state and update score/time display.
function updatePreviewBoard() {
  if (!previewMode || !initialBoard) return;
  board = simulateBoardAtMove(previewIndex, previewHistory, initialBoard);
  drawBoard();
  // Highlight the selected move in the list.
  Array.from(moveList.children).forEach((li, idx) => {
    li.style.backgroundColor = (idx === previewIndex) ? "#ddd" : "";
  });
  // Update score and time stats.
  let simScores = computeScoresLocal(board);
  let myScore, oppScore;
  if (myColor === 'red') {
    myScore = simScores.scoreRed;
    oppScore = simScores.scoreBlack;
  } else {
    myScore = simScores.scoreBlack;
    oppScore = simScores.scoreRed;
  }
  // Also display the time of the current move.
  let currentTime = previewHistory[previewIndex] ? previewHistory[previewIndex].timestamp : 0;
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

// Update move history display (using an unordered list).
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

socket.on('gameStart', (data) => {
  myColor = data.color;
  myNickname = data.yourNickname;
  opponentNickname = data.opponentNickname;
  statusDiv.innerText = `You are ${myNickname} (${myColor}).`;
  startSound.play();
});

socket.on('update', (data) => {
  if (!previewMode) {
    board = data.board;
  }
  myTurn = data.turn === myColor;
  
  // Save initial board state on first update.
  if (!initialBoard && data.board) {
    initialBoard = cloneBoard(data.board);
  }
  
  // If not in preview mode, update previewHistory from server update.
  if (!previewMode) {
    previewHistory = data.moveHistory || [];
    previewIndex = previewHistory.length - 1;
  }
  
  if (!previewMode) {
    drawBoard();
  }
  updateMoveHistory(previewHistory);
  
  // Update score and status.
  let scores = data.scores;
  let myScore, oppScore;
  if (myColor === 'red') {
    myScore = scores.scoreRed;
    oppScore = scores.scoreBlack;
  } else {
    myScore = scores.scoreBlack;
    oppScore = scores.scoreRed;
  }
  // In preview mode, use local score computation.
  if (previewMode && initialBoard) {
    let simScores = computeScoresLocal(simulateBoardAtMove(previewIndex, previewHistory, initialBoard));
    myScore = (myColor === 'red') ? simScores.scoreRed : simScores.scoreBlack;
    oppScore = (myColor === 'red') ? simScores.scoreBlack : simScores.scoreRed;
    // Also display the time of the current move.
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

socket.on('gameOver', (data) => {
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

reviewButton.addEventListener('click', () => {
  if (previewHistory.length === 0) return;
  previewMode = true;
  previewIndex = previewHistory.length - 1;
  updatePreviewBoard();
  statusDiv.innerText = `Review Mode: Showing final move.`;
});

previewButton.addEventListener('click', () => {
  // Clear current move history.
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
        // Create a default initial board based on our derivative game.
        initialBoard = Array(8).fill().map(() => Array(8).fill(null));
        // (You might want to call your createInitialBoard() function here.)
      }
      updatePreviewBoard();
      statusDiv.innerText = `Preview Mode: Loaded external game.`;
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

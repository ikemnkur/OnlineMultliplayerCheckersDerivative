// experimental.js

// Initialize a nickname (for experimental mode, this is just informational)
let nickname = prompt("Enter your nickname for experimental mode:");
if (!nickname) nickname = "Player";

// Global variables
let board = [];  // current board state (8x8)
const gridSize = 8;
const canvas = document.getElementById('expCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreDisplay');
const moveHistoryList = document.getElementById('moveHistoryList');

const prevMoveBtn = document.getElementById('prevMove');
const nextMoveBtn = document.getElementById('nextMove');
const autoPlayBtn = document.getElementById('autoPlay');
const newGameBtn = document.getElementById('newGameButton');
const copyBtn = document.getElementById('copyButton');
const loadHistoryBtn = document.getElementById('loadHistory');
const historyTextarea = document.getElementById('historyTextarea');

let currentTool = "move";  // "move", "add", or "remove"
let selectedPiece = null;  // for move tool
let selectedAddColor = "red";  // default for add tool

let moveHistory = [];  // array to record moves { tool, from, to, timestamp }
let startTime = Date.now(); // record when the experiment started

// Preview mode variables
let previewMode = false;
let previewIndex = 0;
let initialBoard = createInitialBoard(); // initial board state

// Initialize board.
board = cloneBoard(initialBoard);
drawBoard();
updateScoreDisplay();
updateMoveHistoryDisplay();

// ----------------------- Utility Functions -----------------------

function createInitialBoard() {
  const board = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
  // Use the same initial configuration as the game mode.
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

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

function updateScoreDisplay() {
  // Score calculation: for red, score = sum((8 - row)^2) for each red piece; for black, sum((row+1)^2) for each black piece.
  let scoreRed = 0, scoreBlack = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let piece = board[r][c];
      if (piece) {
        if (piece.color === 'red') scoreRed += Math.pow(8 - r, 2);
        else scoreBlack += Math.pow(r + 1, 2);
      }
    }
  }
  scoreDisplay.innerText = `Score (Red): ${scoreRed}   Score (Black): ${scoreBlack}`;
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cellSize = canvas.width / gridSize;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      ctx.fillStyle = ((r+c) % 2 === 1) ? "#769656" : "#EEEED2";
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      ctx.strokeStyle = "#ccc";
      ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
      // Draw piece if present.
      let piece = board[r][c];
      if (piece) {
        ctx.beginPath();
        ctx.arc(c * cellSize + cellSize/2, r * cellSize + cellSize/2, cellSize/2 - 5, 0, Math.PI * 2);
        ctx.fillStyle = piece.color;
        ctx.fill();
      }
    }
  }
  // Highlight selected piece if in move tool.
  if (selectedPiece) {
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 3;
    ctx.strokeRect(selectedPiece.col * cellSize, selectedPiece.row * cellSize, cellSize, cellSize);
  }
}

function updateMoveHistoryDisplay() {
  moveHistoryList.innerHTML = "";
  moveHistory.forEach((move, index) => {
    let li = document.createElement('li');
    li.textContent = `${move.timestamp}s - ${move.tool.toUpperCase()} from (${move.from.row},${move.from.col}) to (${move.to.row},${move.to.col})`;
    li.addEventListener('click', () => {
      previewMode = true;
      previewIndex = index;
      resetBoardToMove(index);
    });
    moveHistoryList.appendChild(li);
  });
}

// Replay the moves up to the specified index from initialBoard.
function resetBoardToMove(index) {
  board = cloneBoard(initialBoard);
  for (let i = 0; i <= index; i++) {
    const move = moveHistory[i];
    if (move.tool === "move") {
      board[move.to.row][move.to.col] = board[move.from.row][move.from.col];
      board[move.from.row][move.from.col] = null;
    } else if (move.tool === "add") {
      board[move.to.row][move.to.col] = { color: move.addColor, king: false };
    } else if (move.tool === "remove") {
      board[move.from.row][move.from.col] = null;
    }
  }
  drawBoard();
  updateScoreDisplay();
}

// ----------------------- Event Listeners -----------------------

// Canvas click handling
canvas.addEventListener('click', (e) => {
  if (previewMode) return; // In preview mode, ignore clicks.
  const cellSize = canvas.width / gridSize;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  
  if (currentTool === "move") {
    if (!selectedPiece) {
      if (board[row][col]) {
        selectedPiece = { row, col };
        drawBoard();
      }
    } else {
      // Move piece.
      const from = selectedPiece;
      const to = { row, col };
      recordMove("move", from, to);
      board[to.row][to.col] = board[from.row][from.col];
      board[from.row][from.col] = null;
      selectedPiece = null;
      drawBoard();
      updateScoreDisplay();
    }
  } else if (currentTool === "add") {
    if (!board[row][col]) {
      board[row][col] = { color: selectedAddColor, king: false };
      recordMove("add", { row: -1, col: -1 }, { row, col }, selectedAddColor);
      drawBoard();
      updateScoreDisplay();
    }
  } else if (currentTool === "remove") {
    if (board[row][col]) {
      recordMove("remove", { row, col }, { row: -1, col: -1 });
      board[row][col] = null;
      drawBoard();
      updateScoreDisplay();
    }
  }
});

// Record a move.
function recordMove(tool, from, to, addColor) {
  const timestamp = Math.floor((Date.now() - startTime) / 1000);
  const move = { tool, from, to, timestamp };
  if (tool === "add") move.addColor = addColor;
  moveHistory.push(move);
  updateMoveHistoryDisplay();
}

// Tool selection.
const toolRadios = document.getElementsByName('tool');
toolRadios.forEach(radio => {
  radio.addEventListener('change', function() {
    currentTool = this.value;
    selectedPiece = null;
    document.getElementById('pieceColorSelection').style.display = (currentTool === 'add') ? 'inline-block' : 'none';
  });
});

// Piece color selection for adding.
document.getElementById('addRed').addEventListener('click', () => {
  selectedAddColor = 'red';
});
document.getElementById('addBlack').addEventListener('click', () => {
  selectedAddColor = 'black';
});

// Preview navigation.
prevMoveBtn.addEventListener('click', () => {
  if (previewMode && previewIndex > 0) {
    previewIndex--;
    resetBoardToMove(previewIndex);
  }
});
nextMoveBtn.addEventListener('click', () => {
  if (previewMode && previewIndex < moveHistory.length - 1) {
    previewIndex++;
    resetBoardToMove(previewIndex);
  }
});
autoPlayBtn.addEventListener('click', () => {
  if (!previewMode) previewMode = true;
  let interval = setInterval(() => {
    if (previewIndex >= moveHistory.length - 1) {
      clearInterval(interval);
      return;
    }
    previewIndex++;
    resetBoardToMove(previewIndex);
  }, 1000);
});

// Load external move history.
loadHistoryBtn.addEventListener('click', () => {
  try {
    let parsed = JSON.parse(historyTextarea.value);
    if (Array.isArray(parsed)) {
      previewMode = true;
      moveHistory = parsed;
      previewIndex = moveHistory.length - 1;
      initialBoard = createInitialBoard();
      resetBoardToMove(previewIndex);
      updateMoveHistoryDisplay();
    } else {
      alert("Invalid move history format.");
    }
  } catch (e) {
    alert("Error parsing move history JSON.");
  }
});

// New Game: reload page.
newGameBtn.addEventListener('click', () => {
  location.reload();
});

// Copy move history.
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(JSON.stringify(moveHistory, null, 2))
    .then(() => {
      alert("Move history copied to clipboard!");
    })
    .catch(err => {
      alert("Failed to copy: " + err);
    });
});

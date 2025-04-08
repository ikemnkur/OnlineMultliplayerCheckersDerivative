// public/client.js

// Prompt for nickname.
let nickname = prompt("Enter your nickname:");
if (!nickname) nickname = "Player";
localStorage.setItem("nickname", nickname);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const scoreDiv = document.getElementById('score');
const timerRedSpan = document.getElementById('timerRed');
const timerBlackSpan = document.getElementById('timerBlack');
const timerBlueSpan = document.getElementById('timerBlue');
const timerGreenSpan = document.getElementById('timerGreen');
const moveList = document.getElementById('moveList');

const prevButton = document.getElementById('prevButton');
const playButton = document.getElementById('playButton');
const nextButton = document.getElementById('nextButton');
const reviewButton = document.getElementById('reviewButton');
const previewButton = document.getElementById('previewButton');
const newGameButton = document.getElementById('newGameButton');
const copyButton = document.getElementById('copyButton');
const previewText = document.getElementById('previewText');

const socket = io({ query: { mode: '4PlayerGame' } });
socket.emit('setNickname', nickname);

const gridSize = 8;
const cellSize = canvas.width / gridSize;
let board = [];
let myColor = null;
let myTurn = false;
let myNickname = nickname;
let opponentNickname = ""; // For 4 players, may list multiple names.
let selectedPiece = null;

// Preview mode variables.
let previewMode = false;
let previewHistory = [];
let previewIndex = 0;
let initialBoard = null;

// Preload sound effects.
const selectSound = new Audio('sounds/select.mp3');
const moveSound = new Audio('sounds/move.mp3');
const captureSound = new Audio('sounds/capture.mp3');
const warningSound = new Audio('sounds/warning.mp3');
const winSound = new Audio('sounds/win.mp3');
const loseSound = new Audio('sounds/lose.mp3');
const startSound = new Audio('sounds/start.mp3');

let warningPlayed = false;
let lastTurn;

// On load, if board is empty, draw empty grid.
window.onload = function() {
  if (!board || board.length === 0) {
    board = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    drawBoard();
  }
};

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

function computeScoresLocal(simBoard) {
  // For 4 players: 
  // red: sum((8 - row)^2), black: sum((row + 1)^2), blue: sum((8 - col)^2), green: sum((col + 1)^2)
  let scores = { red: 0, black: 0, blue: 0, green: 0 };
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let piece = simBoard[r][c];
      if (piece) {
        if (piece.color === 'red') scores.red += Math.pow(8 - r, 2);
        else if (piece.color === 'black') scores.black += Math.pow(r + 1, 2);
        else if (piece.color === 'blue') scores.blue += Math.pow(8 - c, 2);
        else if (piece.color === 'green') scores.green += Math.pow(c + 1, 2);
      }
    }
  }
  return scores;
}

// In this 4-player mode, drawing the board is as in the 2-player version.
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      ctx.fillStyle = ((r + c) % 2 === 1) ? "#769656" : "#EEEED2";
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let piece = board[r][c];
      if (piece) {
        ctx.beginPath();
        ctx.arc(c * cellSize + cellSize/2, r * cellSize + cellSize/2, cellSize/2 - 5, 0, Math.PI * 2);
        ctx.fillStyle = piece.color;
        ctx.fill();
      }
    }
  }
}

function updateMoveHistoryDisplay(moves) {
  moveList.innerHTML = "";
  moves.forEach((move, index) => {
    let li = document.createElement("li");
    li.textContent = `${move.timestamp}s - ${move.player.toUpperCase()} from (${move.from.row},${move.from.col}) to (${move.to.row},${move.to.col})` +
                     (move.moveType && move.moveType !== "move" ? ` [${move.moveType.toUpperCase()}]` : "");
    li.addEventListener('click', () => {
      if (!previewMode) return;
      previewIndex = index;
      resetBoardToMove(index);
    });
    moveList.appendChild(li);
  });
}

function simulateBoardAtMove(index, history, baseBoard) {
  let simBoard = cloneBoard(baseBoard);
  for (let i = 0; i <= index && i < history.length; i++) {
    const move = history[i];
    if (move.tool === "move") {
      simBoard[move.to.row][move.to.col] = simBoard[move.from.row][move.from.col];
      simBoard[move.from.row][move.from.col] = null;
    } else if (move.tool === "add") {
      simBoard[move.to.row][move.to.col] = { color: move.addColor, king: false };
    } else if (move.tool === "remove") {
      simBoard[move.from.row][move.from.col] = null;
    }
  }
  return simBoard;
}

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

function updateScoreDisplay() {
  const scores = computeScoresLocal(board);
  scoreDiv.innerText = `Scores -> Red: ${scores.red}  Black: ${scores.black}  Blue: ${scores.blue}  Green: ${scores.green}`;
}

// ----------------- Event Handlers -----------------

canvas.addEventListener('click', (e) => {
  if (previewMode) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  // For experimental free movement mode, simply allow a piece to be moved.
  if (!selectedPiece) {
    if (board[row][col]) {
      selectedPiece = { row, col };
      drawBoard();
      selectSound.play();
    }
  } else {
    // Record move.
    recordMove("move", selectedPiece, { row, col });
    board[row][col] = board[selectedPiece.row][selectedPiece.col];
    board[selectedPiece.row][selectedPiece.col] = null;
    selectedPiece = null;
    drawBoard();
    updateScoreDisplay();
  }
});

function recordMove(tool, from, to, addColor) {
  const timestamp = Math.floor((Date.now() - startTime) / 1000);
  const move = { tool, from, to, timestamp };
  if (tool === "add") move.addColor = addColor;
  moveHistory.push(move);
  updateMoveHistoryDisplay(moveHistory);
}

// Tool selection – assume you have controls in your HTML to change the current tool.
document.querySelectorAll('input[name="tool"]').forEach(radio => {
  radio.addEventListener('change', function() {
    currentTool = this.value;
    selectedPiece = null;
    document.getElementById('pieceColorSelection').style.display = (currentTool === 'add') ? 'block' : 'none';
  });
});

document.getElementById('addRed').addEventListener('click', () => { selectedAddColor = 'red'; });
document.getElementById('addBlack').addEventListener('click', () => { selectedAddColor = 'black'; });
document.getElementById('removeTool').addEventListener('click', () => { /* set tool to remove */ });

// Preview navigation.
prevButton.addEventListener('click', () => {
  if (previewMode && previewIndex > 0) {
    previewIndex--;
    resetBoardToMove(previewIndex);
  }
});
nextButton.addEventListener('click', () => {
  if (previewMode && previewIndex < moveHistory.length - 1) {
    previewIndex++;
    resetBoardToMove(previewIndex);
  }
});
playButton.addEventListener('click', () => {
  let mode = "pause";
  let autoPlayInterval = null;
  if (mode === "play") {
    mode = "pause";
    clearInterval(autoPlayInterval);
  } else {
    mode = "play";
    autoPlayInterval = setInterval(() => {
      if (!previewMode || moveHistory.length === 0) return;
      if (previewIndex >= moveHistory.length - 1) {
        clearInterval(autoPlayInterval);
        mode = "pause";
        return;
      }
      previewIndex++;
      resetBoardToMove(previewIndex);
    }, 1000);
  }
});

reviewButton.addEventListener('click', () => {
  if (moveHistory.length === 0) return;
  previewMode = true;
  previewIndex = moveHistory.length - 1;
  resetBoardToMove(previewIndex);
  statusDiv.innerText = "Review Mode: Showing final move.";
});

previewButton.addEventListener('click', () => {
  try {
    let parsed = JSON.parse(previewText.value);
    if (Array.isArray(parsed)) {
      previewMode = true;
      moveHistory = parsed;
      previewIndex = moveHistory.length - 1;
      initialBoard = createInitialBoard();
      resetBoardToMove(previewIndex);
      statusDiv.innerText = "Preview Mode: Loaded external game.";
      updateMoveHistoryDisplay(moveHistory);
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
  navigator.clipboard.writeText(JSON.stringify(moveHistory, null, 2))
    .then(() => alert("Move history copied to clipboard!"))
    .catch(err => alert("Failed to copy: " + err));
});

// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 2000;
app.use(express.static(__dirname + '/public'));

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Game state management
let waitingPlayer = null;
let games = {};

// Create initial board with custom formation (derivative game)
function createInitialBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(null));
  
  // Black pieces (top side)
  // Back row: row 0, columns 1 to 6.
  for (let c = 1; c <= 6; c++) {
    board[0][c] = { color: 'black', king: false };
  }
  // Middle row: row 1, columns 2 to 5.
  for (let c = 2; c <= 5; c++) {
    board[1][c] = { color: 'black', king: false };
  }
  // Top row: row 2, columns 3 to 4.
  for (let c = 3; c <= 4; c++) {
    board[2][c] = { color: 'black', king: false };
  }
  
  // Red pieces (bottom side)
  // Back row: row 7, columns 1 to 6.
  for (let c = 1; c <= 6; c++) {
    board[7][c] = { color: 'red', king: false };
  }
  // Middle row: row 6, columns 2 to 5.
  for (let c = 2; c <= 5; c++) {
    board[6][c] = { color: 'red', king: false };
  }
  // Top row: row 5, columns 3 to 4.
  for (let c = 3; c <= 4; c++) {
    board[5][c] = { color: 'red', king: false };
  }
  
  return board;
}

// Compute scores for each side.
// For red: each piece adds (8 - row)², for black: (row + 1)².
// Also add bonus scores from captured pieces.
function computeScores(game) {
  let scoreRed = game.capturedForRed || 0;
  let scoreBlack = game.capturedForBlack || 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = game.board[r][c];
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

// Validate moves according to new rules.
function isValidMove(game, from, to, color) {
  const board = game.board;
  if (from.row < 0 || from.row >= 8 || from.col < 0 || from.col >= 8) return false;
  if (to.row < 0 || to.row >= 8 || to.col < 0 || to.col >= 8) return false;
  
  const piece = board[from.row][from.col];
  if (!piece || piece.color !== color) return false;
  if (board[to.row][to.col] !== null) return false;
  
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const forwardDir = (color === 'red') ? -1 : 1; // red moves up, black moves down (server-side)
  
  // Non-capturing move: horizontal or forward
  if (dr === 0 && Math.abs(dc) === 1) return true;
  if (dr === forwardDir && dc === 0) return true;
  
  // Capturing move: diagonal forward jump (exactly 2 rows forward)
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2 && dr === forwardDir * 2) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    const midPiece = board[midRow][midCol];
    if (midPiece && midPiece.color !== color) return true;
  }
  
  return false;
}

// Start the chess-like timer for a game (3 minutes per player).
function startTimer(gameId) {
  let game = games[gameId];
  game.interval = setInterval(() => {
    if (game.turn === 'red') {
      game.timerRed--;
      if (game.timerRed <= 0) {
        clearInterval(game.interval);
        // If the winner (black) still has more than 20 sec, it's a Timeout win; otherwise, Higher Score.
        let winReason = (game.timerBlack > 20) ? "Timeout" : "Higher Score";
        io.to(gameId).emit('gameOver', { winner: 'black', scores: computeScores(game), winReason });
        return;
      }
    } else {
      game.timerBlack--;
      if (game.timerBlack <= 0) {
        clearInterval(game.interval);
        let winReason = (game.timerRed > 20) ? "Timeout" : "Higher Score";
        io.to(gameId).emit('gameOver', { winner: 'red', scores: computeScores(game), winReason });
        return;
      }
    }
    io.to(gameId).emit('timer', { timerRed: game.timerRed, timerBlack: game.timerBlack });
  }, 1000);
}

io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);
  
  // Receive and store the user's nickname.
  socket.on('setNickname', (nickname) => {
    socket.nickname = nickname;
  });
  
  // Pair players into a game room
  if (waitingPlayer) {
    const roomId = waitingPlayer.id + '#' + socket.id;
    socket.join(roomId);
    waitingPlayer.join(roomId);
    
    games[roomId] = {
      board: createInitialBoard(),
      players: { red: waitingPlayer.id, black: socket.id },
      // Store nicknames for display:
      nicknames: {
        red: waitingPlayer.nickname || 'Red',
        black: socket.nickname || 'Black'
      },
      turn: 'red', // red starts
      timerRed: 180,
      timerBlack: 180,
      capturedForRed: 0,
      capturedForBlack: 0,
      interval: null
    };
    
    // Inform players of game start along with their colors and opponent nicknames.
    io.to(roomId).emit('gameStart', {
      color: 'red',
      yourNickname: games[roomId].nicknames.red,
      opponentNickname: games[roomId].nicknames.black
    });
    io.to(games[roomId].players.black).emit('gameStart', {
      color: 'black',
      yourNickname: games[roomId].nicknames.black,
      opponentNickname: games[roomId].nicknames.red
    });
    
    // Send initial board, timer, and score.
    io.to(roomId).emit('update', {
      board: games[roomId].board,
      turn: games[roomId].turn,
      scores: computeScores(games[roomId]),
      moveType: null
    });
    io.to(roomId).emit('timer', { timerRed: 180, timerBlack: 180 });
    
    startTimer(roomId);
    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit('status', { message: 'Waiting for an opponent...' });
  }
  
  socket.on('makeMove', (data) => {
    // data: { from: { row, col }, to: { row, col } }
    const rooms = [...socket.rooms].filter(r => r !== socket.id);
    if (!rooms.length) return;
    const roomId = rooms[0];
    const game = games[roomId];
    if (!game) return;
    
    const playerColor = game.players.red === socket.id ? 'red' : 'black';
    if (game.turn !== playerColor) return;
    
    const { from, to } = data;
    if (!isValidMove(game, from, to, playerColor)) return;
    
    let moveType = "move"; // default move
    const piece = game.board[from.row][from.col];
    game.board[to.row][to.col] = piece;
    game.board[from.row][from.col] = null;
    
    // Check for capture (diagonal jump)
    if (Math.abs(to.row - from.row) === 2 && Math.abs(to.col - from.col) === 2) {
      moveType = "capture";
      const midRow = (from.row + to.row) / 2;
      const midCol = (from.col + to.col) / 2;
      const capturedPiece = game.board[midRow][midCol];
      game.board[midRow][midCol] = null;
      if (capturedPiece) {
        if (capturedPiece.color === 'red') {
          // When black captures red, bonus = capturedPiece.row (red's enemy side is row 0)
          game.capturedForBlack += capturedPiece.row;
        } else {
          // When red captures black, bonus = (7 - capturedPiece.row)
          game.capturedForRed += (7 - capturedPiece.row);
        }
      }
    }
    
    // Win condition: if a piece reaches the enemy side.
    if ((playerColor === 'red' && to.row === 0) ||
        (playerColor === 'black' && to.row === 7)) {
      moveType = "win";
      const scores = computeScores(game);
      io.to(roomId).emit('update', {
        board: game.board,
        turn: game.turn,
        scores,
        moveType
      });
      io.to(roomId).emit('gameOver', { winner: playerColor, scores, winReason: "Breaching other Side" });
      clearInterval(game.interval);
      return;
    }
    
    // Switch turn.
    const opponentColor = playerColor === 'red' ? 'black' : 'red';
    game.turn = opponentColor;
    
    const scores = computeScores(game);
    io.to(roomId).emit('update', {
      board: game.board,
      turn: game.turn,
      scores,
      moveType
    });
    console.log("move made");
  });
  
  socket.on('disconnect', () => {
    console.log('A user disconnected: ' + socket.id);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    for (let roomId in games) {
      const game = games[roomId];
      if (game.players.red === socket.id || game.players.black === socket.id) {
        const opponentColor = game.players.red === socket.id ? 'black' : 'red';
        io.to(roomId).emit('gameOver', { winner: opponentColor, scores: computeScores(game), winReason: "Abandonment" });
        clearInterval(game.interval);
        delete games[roomId];
      }
    }
  });
});

const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); // filesystem module

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname + '/public'));

// Global object to keep track of online players: { username: socketId }
const onlinePlayers = {};

// Existing routes and socket.io logic for the game...
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// NEW: Routing for the lobby page
app.get('/lobby', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});

// NEW: Routing for the lobby page
app.get('/simplebet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simplebet.html'));
});

// NEW: Routing for the lobby page
app.get('/advancedbet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'advancedbet.html'));
});

// NEW: Routing for the Exprimental Study Mode page
app.get('/study', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exprimental.html'));
});

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
  for (let c = 1; c <= 6; c++) {
    board[0][c] = { color: 'black', king: false };
  }
  for (let c = 2; c <= 5; c++) {
    board[1][c] = { color: 'black', king: false };
  }
  for (let c = 3; c <= 4; c++) {
    board[2][c] = { color: 'black', king: false };
  }
  // Red pieces (bottom side)
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

// Compute scores for each side.
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
  const forwardDir = (color === 'red') ? -1 : 1;
  if (dr === 0 && Math.abs(dc) === 1) return true;
  if (dr === forwardDir && dc === 0) return true;
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2 && dr === forwardDir * 2) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    const midPiece = board[midRow][midCol];
    if (midPiece && midPiece.color !== color) return true;
  }
  return false;
}

// Write the game move history to a JSON file.
function writeGameHistory(roomId, game) {
  // Define the directory to store game histories.
  const directory = path.join(__dirname, 'public', 'game_history');
  // Ensure the directory exists.
  fs.mkdirSync(directory, { recursive: true });

  // Build a base file name using the room ID.
  const fileBase = `game_history_${roomId.replace('#', '_')}`;
  // List all files in the directory.
  const files = fs.readdirSync(directory);
  // Check if a file already exists with that base.
  let filename = files.find(file => file.startsWith(fileBase));
  if (filename) {
    // Use the existing file.
    filename = path.join(directory, filename);
  } else {
    // Create a new file if none exists.
    filename = path.join(directory, `${fileBase}_${Date.now()}.json`);
  }

  const data = JSON.stringify(game.moveHistory, null, 2);
  fs.writeFile(filename, data, (err) => {
    if (err) {
      console.error("Error writing game history file:", err);
    } else {
      console.log(`Game history saved to ${filename}`);
    }
  });
}



// Start the timer for a game (3 minutes per player).
function startTimer(gameId) {
  let game = games[gameId];
  game.interval = setInterval(() => {
    if (game.turn === 'red') {
      game.timerRed--;
      if (game.timerRed <= 0) {
        clearInterval(game.interval);
        let winReason = (game.timerBlack > 20) ? "Timeout" : "Higher Score";
        io.to(gameId).emit('gameOver', { winner: 'black', scores: computeScores(game), winReason });
        writeGameHistory(gameId, game);
        return;
      }
    } else {
      game.timerBlack--;
      if (game.timerBlack <= 0) {
        clearInterval(game.interval);
        let winReason = (game.timerRed > 20) ? "Timeout" : "Higher Score";
        io.to(gameId).emit('gameOver', { winner: 'red', scores: computeScores(game), winReason });
        writeGameHistory(gameId, game);
        return;
      }
    }
    io.to(gameId).emit('timer', { timerRed: game.timerRed, timerBlack: game.timerBlack });
  }, 1000);
}
io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);
  const mode = socket.handshake.query.mode || 'lobby'; // default to lobby

  if (mode === 'lobby') {

    // Handle lobby join event.
    socket.on('joinLobby', (userdata) => {
      socket.username = userdata.username;
      socket.mode = userdata.mode; // store betting mode from client
      // Add to onlinePlayers mapping.
      onlinePlayers[userdata.username] = socket.id;
      console.log(`${userdata.username} joined the lobby with mode: ${userdata.mode}`);
      // Broadcast that a new player joined.
      io.emit('playerJoined', { username: userdata.username, mode: userdata.mode });
    });

    // Challenge event from a challenger to a target player.
    socket.on('challengePlayer', (data) => {
      // data: { challenger, target }
      // Prevent self-challenge:
      if (data.challenger === data.target) return;
      const targetSocketId = onlinePlayers[data.target];
      if (targetSocketId) {
        io.to(targetSocketId).emit('incomingChallenge', { challenger: data.challenger });
      } else {
        io.to(socket.id).emit('challengeResponse', { target: data.target, accepted: false, message: "Player offline" });
      }
    });

    // Response from the challenged player.
    socket.on('challengeResponse', (data) => {
      // data: { challenger, target, accepted }
      const challengerSocketId = onlinePlayers[data.challenger];
      if (challengerSocketId) {
        io.to(challengerSocketId).emit('challengeResponse', { target: data.target, accepted: data.accepted });
      }
      if (data.accepted) {
        // Create a unique room id.
        const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
        const targetSocketId = onlinePlayers[data.target];
        if (targetSocketId && challengerSocketId) {
          io.sockets.sockets.get(targetSocketId).join(roomId);
          io.sockets.sockets.get(challengerSocketId).join(roomId);
          io.to(targetSocketId).emit('startGame', { roomId, opponent: data.challenger });
          io.to(challengerSocketId).emit('startGame', { roomId, opponent: data.target });
        }
      }
    });

    // Handle lobby chat messages.
    socket.on('lobbyMessage', (data) => {
      io.emit('lobbyMessage', data);
    });

    // When a client disconnects, remove them from onlinePlayers.
    socket.on('disconnect', () => {
      if (socket.username) {
        console.log(`${socket.username} left the lobby`);
        delete onlinePlayers[socket.username];
        io.emit('playerLeft', { username: socket.username });
      }
      console.log(`User ${socket.username} disconnected`);
    });

    socket.on('updateBettingMode', (data) => {
      socket.mode = data.mode;
      console.log(`Updated betting mode for ${socket.username} to ${socket.mode}`);
    });
  }

  // Only if in game mode, execute pairing logic.
  if (mode === 'game') {

    // Pair players into a game room.
    if (waitingPlayer) {
      const roomId = waitingPlayer.id + '#' + socket.id;
      socket.join(roomId);
      waitingPlayer.join(roomId);

      games[roomId] = {
        board: createInitialBoard(),
        players: { red: waitingPlayer.id, black: socket.id },
        nicknames: {
          red: waitingPlayer.nickname || 'Red',
          black: socket.nickname || 'Black'
        },
        turn: 'red', // red starts
        timerRed: 180,
        timerBlack: 180,
        capturedForRed: 0,
        capturedForBlack: 0,
        moveHistory: [],
        startTime: Date.now(),
        interval: null,
        ready: { red: false, black: false } // readiness flags
      };

      // Instead of starting immediately, tell both players to confirm they're ready.
      io.to(roomId).emit('waitingForReady', {
        yourNickname: games[roomId].nicknames.red,
        opponentNickname: games[roomId].nicknames.black,
        color: 'red'
      });
      io.to(games[roomId].players.black).emit('waitingForReady', {
        yourNickname: games[roomId].nicknames.black,
        opponentNickname: games[roomId].nicknames.red,
        color: 'black'
      });

      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit('status', { message: 'Waiting for an opponent...' });
    }

    // Listen for playerReady events.
    socket.on('playerReady', () => {
      const rooms = [...socket.rooms].filter(r => r !== socket.id);
      if (!rooms.length) return;
      const roomId = rooms[0];
      const game = games[roomId];
      if (!game) return;
      const playerColor = game.players.red === socket.id ? 'red' : 'black';
      game.ready[playerColor] = true;
      console.log(`Player ${playerColor} is ready in room ${roomId}`);
      if (game.ready.red && game.ready.black) {
        io.to(roomId).emit('gameStart', {
          yourNickname: game.nicknames.red,
          opponentNickname: game.nicknames.black,
          color: 'red'
        });
        io.to(game.players.black).emit('gameStart', {
          yourNickname: game.nicknames.black,
          opponentNickname: game.nicknames.red,
          color: 'black'
        });
        io.to(roomId).emit('update', {
          board: game.board,
          turn: game.turn,
          scores: computeScores(game),
          moveType: null,
          moveHistory: game.moveHistory
        });
        io.to(roomId).emit('timer', { timerRed: 180, timerBlack: 180 });
        startTimer(roomId);
      }
    });

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
      let moveType = "move";
      const piece = game.board[from.row][from.col];
      game.board[to.row][to.col] = piece;
      game.board[from.row][from.col] = null;
      // Record move with relative timestamp and current timer values.
      game.moveHistory.push({
        player: playerColor,
        from,
        to,
        moveType: null, // will update below
        timestamp: Math.floor((Date.now() - game.startTime) / 1000),
        timerRed: game.timerRed,
        timerBlack: game.timerBlack
      });
      if (Math.abs(to.row - from.row) === 2 && Math.abs(to.col - from.col) === 2) {
        moveType = "capture";
        const midRow = (from.row + to.row) / 2;
        const midCol = (from.col + to.col) / 2;
        const capturedPiece = game.board[midRow][midCol];
        game.board[midRow][midCol] = null;
        if (capturedPiece) {
          if (capturedPiece.color === 'red') {
            game.capturedForBlack += capturedPiece.row;
          } else {
            game.capturedForRed += (7 - capturedPiece.row);
          }
        }
      }

      game.moveHistory[game.moveHistory.length - 1].moveType = moveType;
      if ((playerColor === 'red' && to.row === 0) ||
        (playerColor === 'black' && to.row === 7)) {
        moveType = "win";
        game.moveHistory[game.moveHistory.length - 1].moveType = moveType;
        const scores = computeScores(game);
        io.to(roomId).emit('update', {
          board: game.board,
          turn: game.turn,
          scores,
          moveType,
          moveHistory: game.moveHistory
        });
        io.to(roomId).emit('gameOver', { winner: playerColor, scores, winReason: "Breaching other Side" });
        writeGameHistory(roomId, game);
        clearInterval(game.interval);
        return;
      }
      const opponentColor = playerColor === 'red' ? 'black' : 'red';
      game.turn = opponentColor;
      const scores = computeScores(game);
      io.to(roomId).emit('update', {
        board: game.board,
        turn: game.turn,
        scores,
        moveType,
        moveHistory: game.moveHistory
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
          writeGameHistory(roomId, game);
          clearInterval(game.interval);
          delete games[roomId];
        }
      }
    });

  }
});



// Periodic refresh of connected players every 5 seconds.
// Periodic refresh: Send updated player list including mode.
setInterval(() => {
  const players = [];
  io.of('/').sockets.forEach((socket) => {
    if (socket.username) {
      players.push({ username: socket.username, mode: socket.mode || "none" });
    }
  });
  io.emit('refreshPlayers', players);
}, 5000);

// ##############################################################################################################################################################################################

// Add this at the top along with your other requires:
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your_jwt_secret';  // Change this to a secure secret in production


// app.js
// const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
// const path =  require("path")
// Using bcryptjs to avoid native build issues
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');

// const app = express();

// Set up EJS for templating
app.set('view engine', 'ejs');

// Update the below details with your own MySQL connection details
const pool = mysql.createConnection({
  host: '34.68.5.170',
  user: 'remote',
  password: 'Password!*',
  database: 'OMBG',
  multipleStatements: true
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));


const cookieParser = require('cookie-parser');
app.use(cookieParser());


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

// Landing Page Route
app.get('/', (req, res) => {
  res.render('index');
});

// info Page Route
app.get('/info', (req, res) => {
  res.render('info');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, email, date_of_birth, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    pool.query(
      'INSERT INTO users (username, email, date_of_birth, password) VALUES (?, ?, ?, ?)',
      [username, email, date_of_birth, hashedPassword],
      (err, results) => {
        if (err) {
          console.error(err);
          return res.send('Registration failed.');
        }
        res.redirect('/login');
      }
    );
  } catch (error) {
    console.error(error);
    res.send('Error processing registration.');
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  pool.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.render('login', { error: 'Login failed. Please try again.' });
      }
      if (results.length > 0) {
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          // Sign a JWT with the user's id and username
          const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          // Send the token as an HTTP-only cookie
          res.cookie('token', token, { httpOnly: true });
          return res.redirect('/dashboard');
        } else {
          return res.render('login', { error: 'Invalid credentials.' });
        }
      }
      return res.render('login', { error: 'User not found.' });
    }
  );
});

// -------------------- AUTHENTICATION MIDDLEWARE --------------------

// function authenticateToken(req, res, next) {
//   // Check for token in Authorization header or cookie.
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1] || req.cookies.token;
//   if (!token) return res.status(401).json({ error: 'Not logged in' });
//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) return res.status(403).json({ error: 'Invalid token' });
//     req.user = user;
//     next();
//   });
// }

// function authenticateToken(req, res, next) {
//   const authHeader = req.headers['authorization'];
//   const token = (authHeader && authHeader.split(' ')[1]) || (req.cookies && req.cookies.token);
//   if (!token) {
//     return res.status(401).json({ error: 'Not logged in' });
//   }
//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) return res.status(403).json({ error: 'Invalid token' });
//     req.user = user;
//     next();
//   });
// }


function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.cookies && req.cookies.token);
  if (!token) {
    return res.redirect('/login');
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.redirect('/login');
    }
    req.user = user;
    next();
  });
}

// -------------------- PROTECTED ROUTES --------------------

// Dashboard (user-specific transaction history)
app.get('/dashboard', authenticateToken, (req, res) => {
  // if (!req.session.user) return res.redirect('/login');
  pool.query(
    'SELECT username, email, date_of_birth, last_login, elo_score, xp, games_won, games_draw, games_lost, coins, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Pass the user and transactions to the dashboard view
      res.render('dashboard', { user: results[0] });
    }
  );
});


app.get('/profile', authenticateToken, (req, res) => {
  pool.query(
    'SELECT username, email, date_of_birth, last_login, elo_score, xp, games_won, games_draw, games_lost, coins, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.render('profile', { profile: results[0] });
    }
  );
});

// Log in-app purchases / crypto payments
app.post('/payment', authenticateToken, (req, res) => {
  const { paymentType, amount, coins, time, transactionId } = req.body;
  // Insert into transactions table with the new mappings.
  pool.query(
    `INSERT INTO transactions 
      (user_id, type, amount, currency, status, utc, transactionID, numberOfCoins) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, "payment", amount, paymentType, "pending", time, transactionId, coins],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Payment logging failed.' });
      }
      res.json({ message: 'Payment logged successfully.' });
    }
  );
});

// GET /payments - Render the payment handling page
app.get('/payments', authenticateToken, (req, res) => {
  // Fetch previous payment transactions for the user.
  pool.query(
    'SELECT * FROM transactions WHERE user_id = ? AND type IN (?, ?, ?)',
    [req.user.id, 'purchase', 'crypto', 'subscription'],
    (err, payments) => {
      if (err) {
        console.error(err);
        return res.send('Error fetching payments.');
      }
      res.render('payments', { payments });
    }
  );
});

// In-app currency exchange between accounts
app.post('/exchange', authenticateToken, (req, res) => {
  const { toUserId, amount } = req.body;
  const fromUserId = req.user.id;
  // Log the exchange for the sender
  pool.query(
    'INSERT INTO transactions (user_id, type, amount, currency, status) VALUES (?, ?, ?, ?, ?)',
    [fromUserId, 'exchange-out', amount, 'in-app', 'completed'],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Exchange logging failed.');
      }
      // Log the exchange for the recipient
      pool.query(
        'INSERT INTO transactions (user_id, type, amount, currency, status) VALUES (?, ?, ?, ?, ?)',
        [toUserId, 'exchange-in', amount, 'in-app', 'completed'],
        (err, results) => {
          if (err) {
            console.error(err);
            return res.send('Exchange logging failed for recipient.');
          }
          res.send('Exchange logged successfully.');
        }
      );
    }
  );
});

// Redemption request form
app.get('/redeem', authenticateToken, (req, res) => {
  // res.render('redeem');
  pool.query(
    'SELECT * FROM withdraws WHERE user_id = ? AND type IN (?, ?, ?)',
    [req.user.id, 'purchase', 'crypto', 'subscription'],
    (err, payments) => {
      if (err) {
        console.error(err);
        return res.send('Error fetching payments.');
      }
      res.render('redeem', { redeem });
    }
  );
});

// Log a redemption request
app.post('/redeem', authenticateToken, (req, res) => {
  const { amount } = req.body;
  pool.query(
    'INSERT INTO redemption_requests (user_id, amount, status) VALUES (?, ?, ?)',
    [req.user.id, amount, 'pending'],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Redemption request failed.');
      }
      console.log("Success in loggin payment request")
      res.send('Redemption request submitted.');
    }
  );
});

// Admin: Review redemption requests
app.get('/admin/redemptions', authenticateToken, (req, res) => {
  // In production, you should also check if req.user is an admin.
  pool.query(
    'SELECT r.*, u.username FROM redemption_requests r JOIN users u ON r.user_id = u.id',
    (err, requests) => {
      if (err) {
        console.error(err);
        return res.send('Error fetching redemption requests.');
      }
      res.render('admin_redemptions', { requests });
    }
  );
});

// Admin: Update redemption status
app.post('/admin/redemptions/:id', authenticateToken, (req, res) => {
  // Again, ensure only admins can access this route.
  const redemptionId = req.params.id;
  const { status } = req.body; // e.g., 'approved', 'rejected'
  pool.query(
    'UPDATE redemption_requests SET status = ? WHERE id = ?',
    [status, redemptionId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Failed to update redemption request.');
      }
      res.send('Redemption request updated.');
    }
  );
});



// Render the admin payments page (ensure only admins can access this route)
// app.get('/admin/payments', adminAuth, (req, res) => {
app.get('/admin/payments', authenticateToken, (req, res) => {
  // Query the database for all payments
  pool.query('SELECT * FROM transactions ORDER BY created_at DESC', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error while retrieving payments.');
    }
    // Render the EJS template "admin-payments.ejs", passing the payments data
    res.render('admin-payments', { payments: results });
  });
});

// Endpoint to update payment status (approve or reject)
// app.post('/admin/payment/:id', adminAuth, (req, res) => {
// Endpoint to update payment status (approve or reject)
app.post('/admin/payment/:id', authenticateToken, (req, res) => {
  const paymentId = req.params.id;
  const { action } = req.body; // Expect "approved" or "rejected"
  
  if (action !== 'approved' && action !== 'rejected') {
    return res.status(400).json({ message: 'Invalid action.' });
  }
  
  pool.query(
    'UPDATE transactions SET status = ? WHERE id = ?',
    [action, paymentId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Payment update failed.' });
      }
      res.json({ message: 'Payment updated successfully.' });
    }
  );
});

// // Start the server
// app.listen(PORT, () => {
//   console.log(`Server running on port: ${PORT}`);
// });

// Simple logout endpoint for JWT-based authentication
app.get('/logout', (req, res) => {
  // Optionally, you can add server-side logic to blacklist the token if needed.
  res.redirect('/login');
});

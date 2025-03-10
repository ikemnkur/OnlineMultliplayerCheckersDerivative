// app.js
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const path =  require("path")
// Using bcryptjs to avoid native build issues
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');

const app = express();

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

// info Page Route
app.get('/game', (req, res) => {
    res.render('game');
});

// Registration Route
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

// Login Route
app.get('/login', (req, res) => {
  res.render('login');
});


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  pool.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Login failed.');
      }
      if (results.length > 0) {
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          // Store the entire user object in the session
          req.session.user = user;
          return res.redirect('/dashboard');
        } else {
          return res.send('Invalid credentials.');
        }
      }
      console.log("req id:",req.session.user.id)
      return res.send('User not found.');
    }
  );
});

// Dashboard (user-specific transaction history)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  pool.query(
    'SELECT * FROM transactions WHERE user_id = ?',
    [req.session.user.id],
    (err, transactions) => {
      if (err) {
        console.error(err);
        return res.send('Error fetching transactions.');
      }
      // Pass the user and transactions to the dashboard view
      res.render('dashboard', { user: req.session.user, transactions });
    }
  );
});

// Log in-app purchases / crypto payments
app.post('/payment', (req, res) => {
  const { paymentType, amount, currency } = req.body;
  if (!req.session.user) return res.status(401).send('Unauthorized');
  pool.query(
    'INSERT INTO transactions (user_id, type, amount, currency, status) VALUES (?, ?, ?, ?, ?)',
    [req.session.user.id, paymentType, amount, currency, 'completed'],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Payment logging failed.');
      }
      res.redirect('/payments'); // Redirect back to the payments page after logging
    }
  );
});

// In-app currency exchange between accounts
app.post('/exchange', (req, res) => {
  const { toUserId, amount } = req.body;
  const fromUserId = req.session.user.id;
  if (!fromUserId) return res.status(401).send('Unauthorized');

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
app.get('/redeem', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('redeem');
});

// Log a redemption request
app.post('/redeem', (req, res) => {
  const { amount } = req.body;
  if (!req.session.user) return res.status(401).send('Unauthorized');
  pool.query(
    'INSERT INTO redemption_requests (user_id, amount, status) VALUES (?, ?, ?)',
    [req.session.user.id, amount, 'pending'],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Redemption request failed.');
      }
      res.send('Redemption request submitted.');
    }
  );
});

// Admin: Review redemption requests
app.get('/admin/redemptions', (req, res) => {
  // In production, protect this route with proper admin authentication
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
app.post('/admin/redemptions/:id', (req, res) => {
  const redemptionId = req.params.id;
  const { status } = req.body; // Expected values: 'approved', 'rejected'
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

// GET /payments - Render the payment handling page
app.get('/payments', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  // Fetch previous payment transactions for the user (filtering by relevant payment types)
  pool.query(
    'SELECT * FROM transactions WHERE user_id = ? AND type IN (?, ?, ?)',
    [req.session.user.id, 'purchase', 'crypto', 'subscription'],
    (err, payments) => {
      if (err) {
        console.error(err);
        return res.send('Error fetching payments.');
      }
      // Render the payments page and pass the logged transactions
      res.render('payments', { payments });
    }
  );
});

// A protected profile route example
app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  
  pool.query(
    'SELECT username, email, date_of_birth, last_login, elo_score, xp, games_won, games_draw, games_lost, coins, created_at FROM users WHERE id = ?',
    [req.session.user.id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (results.length === 0) {
        console.log("req id:",req.session.user.id)
        return res.status(404).json({ error: 'User not found' });

      }
      // Instead of returning JSON, you might render a profile page:
      // res.render('profile', { profile: results[0] });
      return res.json({ profile: results[0] });
    }
  );
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const MONGO_URI = "mongodb+srv://analavishnu4_db_user:10dNfPgk8YQiGIqI@krishna.6yy2ndb.mongodb.net/?appName=krishna"; 
const PORT = 5000;
const FRONTEND_URL = "*"; 

// --- 2. SETUP APP & SERVER ---
const app = express();
const server = http.createServer(app);

// --- 3. MIDDLEWARE ---
// Allow Next.js (port 3000) to talk to Express (port 5000)
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "DELETE"]
}));

// Parse JSON bodies (req.body)
app.use(express.json());

// --- 4. SOCKET.IO SETUP (Real-Time) ---
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "DELETE"]
  }
});

// --- 5. DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- 6. DATA MODEL (Schema) ---
const BookmarkSchema = new mongoose.Schema({
  userEmail: { type: String, required: true }, // We group bookmarks by email
  title: String,
  url: String,
  createdAt: { type: Date, default: Date.now }
});

const Bookmark = mongoose.model('Bookmark', BookmarkSchema);

// --- 7. REAL-TIME LOGIC ---
io.on('connection', (socket) => {
  // When a frontend connects, it sends the user's email
  const userEmail = socket.handshake.query.userEmail;
  
  if (userEmail) {
    // Join a specific "room" for this email. 
    // This ensures User A acts in Room A, and User B in Room B.
    socket.join(userEmail);
    console.log(`🔌 User Connected: ${userEmail}`);
  }
});

// --- 8. API ROUTES ---

// Route: Get all bookmarks for a specific user
app.get('/bookmarks', async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) return res.status(400).json({ error: 'User email is required' });

    // Find bookmarks and sort by newest first
    const bookmarks = await Bookmark.find({ userEmail }).sort({ createdAt: -1 });
    res.json(bookmarks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route: Add a new bookmark
app.post('/bookmarks', async (req, res) => {
  try {
    const { userEmail, title, url } = req.body;
    
    // Basic validation
    if (!userEmail || !title || !url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save to MongoDB
    const newBookmark = new Bookmark({ userEmail, title, url });
    await newBookmark.save();

    // REAL-TIME MAGIC:
    // Send a message ONLY to people in this user's "room"
    io.to(userEmail).emit('bookmark-updated', newBookmark);

    res.json(newBookmark);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route: Delete a bookmark
app.delete('/bookmarks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body; // Needed to ensure ownership

    // Find and delete
    const deleted = await Bookmark.findOneAndDelete({ _id: id, userEmail });

    if (deleted) {
      // REAL-TIME MAGIC:
      // Tell the frontend to remove this specific ID
      io.to(userEmail).emit('bookmark-deleted', id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Bookmark not found or unauthorized' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 9. START SERVER ---
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
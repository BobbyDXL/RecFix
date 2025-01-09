require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload'); // Import express-fileupload
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3002;
const HOST = '127.0.0.1'; // Explicitly bind to localhost

// CORS configuration
app.use(cors());

// Middleware for parsing JSON bodies
app.use(express.json({ limit: '10mb' }));

// Middleware for file uploads
app.use(fileUpload()); // Add this line to enable file upload handling

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiKey: !!process.env.YOUTUBE_API_KEY
  });
});

// Routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Handle YouTube API specific errors
  if (err.code === 403) {
    return res.status(403).json({ 
      error: 'YouTube API quota exceeded or invalid API key',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Invalid request data',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }

  // Default error response
  res.status(500).json({ 
    error: 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with explicit host binding
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`API Key configured: ${process.env.YOUTUBE_API_KEY ? 'Yes' : 'No'}`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});

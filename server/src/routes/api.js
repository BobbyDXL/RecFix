const express = require('express');
const multer = require('multer');
const YouTubeController = require('../controllers/youtubeController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Add logging middleware
router.use((req, res, next) => {
  console.log('API Request:', {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query
  });
  next();
});

// Handle URL input
router.post('/recommendations', express.json(), async (req, res) => {
  console.log('Received request body:', req.body);
  
  if (!req.body || !req.body.urls || !Array.isArray(req.body.urls)) {
    return res.status(400).json({ 
      error: 'Invalid request format. Expected { urls: [...] }' 
    });
  }

  return YouTubeController.handleUrlInput(req, res);
});

// Handle file upload
router.post('/upload', upload.single('history'), YouTubeController.handleFileUpload);

// Add this test route
router.get('/test', async (req, res) => {
  try {
    const response = await youtube.videos.list({
      part: ['snippet'],
      id: ['dQw4w9WgXcQ'] // Test with a known video ID
    });
    res.json(response.data);
  } catch (error) {
    console.error('API Test Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
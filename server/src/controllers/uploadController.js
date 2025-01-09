const { processWatchHistory } = require('../services/youtubeService');

const handleFileUpload = async (req, res) => {
  try {
    console.log('Received files:', req.files); // Debugging line to check received files
    console.log('Request body:', req.body); // Log the request body

    if (!req.files || !req.files.history) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.history;
    console.log('Uploaded file:', file); // Debugging line to check the uploaded file

    const watchHistory = JSON.parse(file.data.toString());
    
    // Extract video IDs from watch history
    const videoIds = watchHistory
      .filter(item => item.titleUrl && item.titleUrl.includes('youtube.com/watch'))
      .map(item => {
        const url = new URL(item.titleUrl);
        return url.searchParams.get('v');
      })
      .filter(Boolean);

    // Get recommendations using YouTube API
    const recommendations = await processWatchHistory(videoIds);
    
    res.json({ recommendations });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
};

module.exports = {
  handleFileUpload
};

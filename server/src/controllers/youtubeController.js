const YouTubeService = require('../services/youtubeService');

class YouTubeController {
  static async handleUrlInput(req, res) {
    try {
      const { urls } = req.body;
      const { pageToken } = req.query;
      
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Please provide valid YouTube URLs' });
      }

      if (urls.length > 5) {
        return res.status(400).json({ 
          error: 'Maximum 5 URLs allowed at once for better recommendations' 
        });
      }

      const videoIds = urls
        .map(url => YouTubeService.extractVideoId(url))
        .filter(Boolean);

      if (videoIds.length === 0) {
        return res.status(400).json({ error: 'No valid YouTube URLs found' });
      }

      console.log(`Processing ${videoIds.length} videos with pageToken: ${pageToken || 'none'}`);

      // Get recommendations with pagination support
      const result = await YouTubeService.processVideoUrls(
        urls, 
        process.env.YOUTUBE_API_KEY, 
        pageToken
      );

      if (!result.items || result.items.length === 0) {
        return res.status(404).json({ 
          error: 'No recommendations found. Try different videos.' 
        });
      }

      // Log some stats about the recommendations
      const channelStats = new Map();
      result.items.forEach(video => {
        const channelId = video.snippet.channelId;
        channelStats.set(channelId, (channelStats.get(channelId) || 0) + 1);
      });

      console.log('Recommendation stats:', {
        totalVideos: result.items.length,
        uniqueChannels: channelStats.size,
        channelDistribution: Array.from(channelStats.entries())
          .map(([channel, count]) => `${count} videos`)
          .join(', ')
      });

      res.json({ 
        recommendations: result.items,
        nextPageToken: result.nextPageToken,
        total: result.items.length,
        stats: {
          uniqueChannels: channelStats.size,
          videosPerChannel: Math.round(result.items.length / channelStats.size * 10) / 10
        }
      });
      
    } catch (error) {
      console.error('Controller error:', error);

      // Handle specific error types
      if (error.code === 403) {
        return res.status(403).json({ 
          error: 'YouTube API quota exceeded. Please try again later.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      if (error.code === 404) {
        return res.status(404).json({ 
          error: 'One or more videos not found. They might be private or deleted.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      res.status(500).json({ 
        error: 'Failed to get recommendations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async handleFileUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let watchHistory;
      try {
        watchHistory = JSON.parse(req.file.buffer.toString());
      } catch (err) {
        return res.status(400).json({ 
          error: 'Invalid JSON file format. Please upload a valid Google Takeout watch-history.json file.' 
        });
      }

      if (!Array.isArray(watchHistory)) {
        return res.status(400).json({ 
          error: 'Invalid watch history format. The file should contain an array of watch history entries.' 
        });
      }

      // Validate watch history entries
      const validEntries = watchHistory.filter(entry => 
        entry && 
        typeof entry === 'object' && 
        entry.titleUrl && 
        typeof entry.titleUrl === 'string' &&
        entry.time &&
        typeof entry.time === 'string'
      );

      if (validEntries.length === 0) {
        return res.status(400).json({ 
          error: 'No valid watch history entries found in the file.' 
        });
      }

      console.log(`Processing ${validEntries.length} watch history entries`);

      // Process the watch history
      const result = await YouTubeService.processTakeoutFile(
        validEntries,
        process.env.YOUTUBE_API_KEY
      );

      // Calculate channel diversity
      const channelCounts = new Map();
      result.items.forEach(video => {
        const channelId = video.snippet.channelId;
        channelCounts.set(channelId, (channelCounts.get(channelId) || 0) + 1);
      });

      res.json({
        recommendations: result.items,
        nextPageToken: result.nextPageToken,
        total: result.items.length,
        stats: {
          processedEntries: validEntries.length,
          uniqueChannels: channelCounts.size,
          videosPerChannel: Math.round(result.items.length / channelCounts.size * 10) / 10
        }
      });
    } catch (error) {
      console.error('Error in handleFileUpload:', error);
      
      if (error instanceof SyntaxError) {
        return res.status(400).json({ 
          error: 'Invalid file format. Please upload a valid JSON file from Google Takeout.' 
        });
      }

      if (error.code === 403) {
        return res.status(403).json({ 
          error: 'YouTube API quota exceeded. Please try again later.' 
        });
      }

      res.status(500).json({ 
        error: 'Failed to process watch history',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = YouTubeController;

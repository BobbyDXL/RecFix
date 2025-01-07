const { google } = require('googleapis');

if (!process.env.YOUTUBE_API_KEY) {
  throw new Error('YouTube API key is required');
}

// Create YouTube client
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// Test the configuration
youtube.search.list({
  part: 'snippet',
  q: 'test',
  maxResults: 1
}).then(() => {
  console.log('YouTube API client configured and working');
}).catch(error => {
  console.error('YouTube API configuration test failed:', error.message);
});

module.exports = youtube; 
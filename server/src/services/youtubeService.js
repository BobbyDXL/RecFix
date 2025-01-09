const { google } = require('googleapis');
const youtube = google.youtube('v3');

const MAX_RESULTS = 15; // Reduced limit for development

const isYoutubeShort = (video) => {
  // More aggressive Shorts detection
  if (!video.contentDetails || !video.snippet) return true; // Reject if missing details
  
  const duration = parseDuration(video.contentDetails.duration);
  if (duration < 180) return true; // Filter videos shorter than 3 minutes
  
  // Check for shorts indicators in title, description, and tags
  const shortsKeywords = ['#shorts', '#short', '#ytshorts', 'shorts/', '/shorts', 'youtube.com/shorts'];
  const textContent = `${video.snippet.title} ${video.snippet.description} ${(video.snippet.tags || []).join(' ')}`.toLowerCase();
  if (shortsKeywords.some(keyword => textContent.includes(keyword))) return true;

  // Check URL format
  if (video.id && typeof video.id === 'string' && video.id.includes('/shorts/')) return true;

  // Check for vertical video format
  if (video.contentDetails && video.contentDetails.dimension) {
    const { height, width } = video.contentDetails.dimension;
    if (height > width) return true;
  }

  return false;
};

const parseDuration = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  let seconds = 0;
  
  if (match[1]) seconds += parseInt(match[1]) * 3600;
  if (match[2]) seconds += parseInt(match[2]) * 60;
  if (match[3]) seconds += parseInt(match[3]);
  
  return seconds;
};

const getVideoDetails = async (videoId, apiKey) => {
  try {
    console.log(`Fetching details for video ID: ${videoId}`);
    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
      key: apiKey
    });

    if (!response.data.items || response.data.items.length === 0) {
      console.warn(`No details found for video ID: ${videoId}`);
      return null;
    }

    return response.data.items[0];
  } catch (error) {
    console.error('Error fetching video details:', error);
    return null;
  }
};

const getRelatedVideos = async (videoDetails, apiKey, pageToken = null) => {
  try {
    // First, verify we have a valid video ID
    const videoId = videoDetails.id || videoDetails;
    console.log('Getting related videos for:', videoId);

    const searchParams = {
      part: 'snippet',
      relatedToVideoId: videoId,
      type: 'video',
      maxResults: 50,
      safeSearch: 'none',  // Add this to ensure we get results
      order: 'relevance'   // Add this to get most relevant results
    };

    if (pageToken) {
      searchParams.pageToken = pageToken;
    }

    console.log('Search params:', searchParams);
    const response = await youtube.search.list(searchParams);
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No related videos found');
    }

    return {
      items: response.data.items,
      nextPageToken: response.data.nextPageToken
    };

  } catch (error) {
    console.error('Detailed error:', JSON.stringify(error.response?.data || error, null, 2));
    throw error;
  }
};

const processVideoUrls = async (videoUrls, apiKey, pageToken = null) => {
  try {
    console.log('Processing URLs:', videoUrls);
    
    const results = [];
    for (const url of videoUrls) {
      const videoId = extractVideoId(url);
      if (!videoId) continue;

      console.log('Processing video ID:', videoId);
      
      // Get initial video details
      const videoDetails = await getVideoDetails(videoId, apiKey);
      if (!videoDetails) {
        console.log('No details found for video:', videoId);
        continue;
      }

      // Get related videos
      const relatedVideos = await getRelatedVideos(videoDetails, apiKey, pageToken);
      if (relatedVideos.items && relatedVideos.items.length > 0) {
        results.push(...relatedVideos.items);
      }
    }

    if (results.length === 0) {
      throw new Error('No recommendations found');
    }

    // Filter and process results
    const processedResults = results
      .filter(video => !isYoutubeShort(video))
      .slice(0, MAX_RESULTS);

    return {
      items: processedResults,
      nextPageToken: pageToken
    };
  } catch (error) {
    console.error('Error processing video URLs:', error);
    throw error;
  }
};

const processTakeoutFile = async (watchHistory, apiKey) => {
  try {
    // Extract recent unique video IDs from watch history
    const videoIds = new Set();
    const processedEntries = watchHistory
      .filter(entry => entry.titleUrl && entry.titleUrl.includes('youtube.com/watch'))
      .sort((a, b) => new Date(b.time) - new Date(a.time)) // Sort by most recent
      .slice(0, 10) // Take 10 most recent videos
      .forEach(entry => {
        const videoId = extractVideoId(entry.titleUrl);
        if (videoId) videoIds.add(videoId);
      });

    // Convert to URLs and process
    const videoUrls = Array.from(videoIds)
      .map(id => `https://youtube.com/watch?v=${id}`);

    return processVideoUrls(videoUrls, apiKey);
  } catch (error) {
    console.error('Error processing takeout file:', error);
    throw error;
  }
};

// Helper functions
const extractKeywords = (title, description) => {
  const text = `${title} ${description.slice(0, 100)}`;
  return text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word));
};

const calculateRelevanceScore = (video, sourceVideo, keywords) => {
  let score = 0;
  
  // Title relevance (0-0.3)
  const titleWords = new Set(video.snippet.title.toLowerCase().split(/\s+/));
  const keywordMatches = keywords.filter(keyword => 
    titleWords.has(keyword.toLowerCase())
  ).length;
  score += (keywordMatches / keywords.length) * 0.3;
  
  // Channel diversity (-0.2 to 0.1)
  if (video.snippet.channelId === sourceVideo.snippet.channelId) {
    score -= 0.2;
  } else {
    score += 0.1;
  }
  
  // More aggressive duration-based scoring
  if (video.contentDetails) {
    const duration = parseDuration(video.contentDetails.duration);
    if (duration < 180) { // Strongly penalize videos under 3 minutes
      score -= 0.5;
    } else if (duration < 300) { // Slightly penalize videos under 5 minutes
      score -= 0.2;
    } else if (duration > 600 && duration < 3600) { // Bonus for videos 10-60 minutes
      score += 0.2;
    }
  }

  // Popularity and recency scoring
  if (video.statistics) {
    const viewCount = parseInt(video.statistics.viewCount) || 0;
    const likeCount = parseInt(video.statistics.likeCount) || 0;
    
    // Calculate popularity score (0-0.4)
    const popularityScore = Math.min(0.4, Math.log10(viewCount) / 10);
    score += popularityScore;

    // Calculate engagement score based on like ratio (0-0.2)
    if (viewCount > 0) {
      const engagementScore = Math.min(0.2, (likeCount / viewCount) * 100);
      score += engagementScore;
    }

    // Very popular videos (>1M views) get a bonus and bypass recency penalty
    const isVeryPopular = viewCount > 1000000;
    
    // Recency scoring (-0.3 to 0.2)
    const publishedAt = new Date(video.snippet.publishedAt);
    const ageInDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
    
    if (!isVeryPopular) {
      if (ageInDays > 365) { // Older than a year
        score -= 0.3;
      } else if (ageInDays < 30) { // Less than a month old
        score += 0.2;
      } else if (ageInDays < 90) { // Less than 3 months old
        score += 0.1;
      }
    } else {
      // Bonus for very popular videos
      score += 0.3;
    }
  }
  
  // Random factor for variety (0-0.1)
  score += Math.random() * 0.1;
  
  return score;
};

const shuffleWithRelevance = (videos) => {
  const chunks = [];
  const chunkSize = Math.ceil(videos.length / 3);
  
  // Split into chunks by relevance
  for (let i = 0; i < videos.length; i += chunkSize) {
    chunks.push(videos.slice(i, i + chunkSize));
  }
  
  // Shuffle within each chunk
  chunks.forEach(chunk => {
    for (let i = chunk.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chunk[i], chunk[j]] = [chunk[j], chunk[i]];
    }
  });
  
  // Interleave chunks
  const result = [];
  const maxLength = Math.max(...chunks.map(chunk => chunk.length));
  for (let i = 0; i < maxLength; i++) {
    chunks.forEach(chunk => {
      if (chunk[i]) result.push(chunk[i]);
    });
  }
  
  return result;
};

const extractVideoId = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    } else if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1);
    }
  } catch (error) {
    console.error('Error extracting video ID:', error);
  }
  return null;
};

const commonWords = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'vs', 'new', 'review', 'best',
  'top', 'how', 'why', 'when', 'where', 'what', 'latest', 'update', 'official',
  'full', 'video', 'watch', 'first', 'look', 'hands', 'unboxing'
]);

module.exports = {
  processVideoUrls,
  processTakeoutFile,
  getVideoDetails,
  getRelatedVideos,
  extractVideoId
};

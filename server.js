const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const CrossPlatformService = require('./services/cross-platform');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://fuzic-web-app.vercel.app', 'https://fuzic.vercel.app', 'https://your-new-domain.com']
    : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Spotify API configuration
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://fuzic-web-app.vercel.app/callback'
});

// Token refresh middleware
const refreshTokenIfNeeded = async (req, res, next) => {
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;
  
  if (!accessToken) {
    return res.status(401).json({ error: 'No access token' });
  }
  
  try {
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.setRefreshToken(refreshToken);
    
    // Test the token by making a simple API call
    await spotifyApi.getMe();
    next();
  } catch (error) {
    if (error.statusCode === 401 && refreshToken) {
      try {
        const data = await spotifyApi.refreshAccessToken();
        const newAccessToken = data.body.access_token;
        
        spotifyApi.setAccessToken(newAccessToken);
        
        // Update cookies
        res.cookie('access_token', newAccessToken, { 
          httpOnly: true, 
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
        
        next();
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.status(401).json({ error: 'Authentication expired. Please log in again.' });
      }
    } else {
      next(error);
    }
  }
};

// Generate a random string for state parameter
const generateRandomString = (length) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Login route
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = [
    'user-library-read', 
    'playlist-read-private', 
    'playlist-modify-private', 
    'playlist-modify-public',
    'user-read-private',
    'user-read-email'
  ];
  
  res.cookie('spotify_auth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  const authorizeURL = spotifyApi.createAuthorizeURL(scope, state);
  res.redirect(authorizeURL);
});

// Callback route
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;

  // Log for debugging
  console.log('Callback hit. Query:', req.query);
  console.log('Stored state:', storedState);

  // If code or state is missing, redirect with error
  if (!code || !state) {
    return res.redirect('/#error=invalid_token');
  }

  if (state === null || state !== storedState) {
    return res.redirect('/#error=state_mismatch');
  }

  res.clearCookie('spotify_auth_state');

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token } = data.body;

    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);

    // Store tokens in cookies with proper security settings
    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2592000000 // 30 days
    });

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect('/#error=invalid_token');
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// API Routes

// Get user's liked songs
app.get('/api/liked-songs', refreshTokenIfNeeded, async (req, res) => {
  try {
    const data = await spotifyApi.getMySavedTracks({ limit: 50 });
    res.json(data.body);
  } catch (error) {
    console.error('Error fetching liked songs:', error);
    res.status(500).json({ error: 'Failed to fetch liked songs' });
  }
});

// Convert liked songs to playlist
app.post('/api/convert-liked-to-playlist', refreshTokenIfNeeded, async (req, res) => {
  try {
    console.log('Convert API called');
    
    // Get user info
    console.log('Getting user info...');
    const userInfo = await spotifyApi.getMe();
    const userId = userInfo.body.id;
    console.log('User ID:', userId);
    
    // Get liked songs
    console.log('Getting liked songs...');
    const likedSongs = await spotifyApi.getMySavedTracks({ limit: 50 });
    console.log('Found liked songs:', likedSongs.body.items.length);
    
    if (likedSongs.body.items.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No liked songs found. Please like some songs first!' 
      });
    }
    
    const trackUris = likedSongs.body.items.map(item => item.track.uri);
    
    // Create playlist
    const playlistName = `Liked Songs - ${new Date().toLocaleDateString()}`;
    console.log('Creating playlist:', playlistName);
    
    const playlist = await spotifyApi.createPlaylist(userId, playlistName, {
      description: 'Playlist created from liked songs using Fuzic',
      public: false
    });
    
    console.log('Playlist created:', playlist.body.id);
    
    // Add tracks to playlist
    if (trackUris.length > 0) {
      console.log('Adding tracks to playlist...');
      await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
      console.log('Tracks added successfully');
    }
    
    res.json({ 
      success: true, 
      playlist: playlist.body,
      tracksAdded: trackUris.length 
    });
  } catch (error) {
    console.error('Detailed error converting liked songs:', error);
    console.error('Error status:', error.statusCode);
    console.error('Error body:', error.body);
    
    let errorMessage = 'Failed to convert liked songs to playlist';
    
    if (error.statusCode === 401) {
      errorMessage = 'Authentication expired. Please log in again.';
    } else if (error.statusCode === 403) {
      errorMessage = 'Permission denied. Please check app permissions.';
    } else if (error.body && error.body.error && error.body.error.message) {
      errorMessage = error.body.error.message;
    }
    
    res.status(error.statusCode || 500).json({ 
      success: false,
      error: errorMessage 
    });
  }
});

// Get user's playlists
app.get('/api/playlists', refreshTokenIfNeeded, async (req, res) => {
  try {
    const data = await spotifyApi.getUserPlaylists({ limit: 50 });
    res.json(data.body);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Merge playlists
app.post('/api/merge-playlists', refreshTokenIfNeeded, async (req, res) => {
  try {
    const { playlistIds, newPlaylistName } = req.body;
    
    // Get user info
    const userInfo = await spotifyApi.getMe();
    const userId = userInfo.body.id;
    
    // Get tracks from all playlists
    let allTracks = [];
    const seenTrackIds = new Set();
    
    for (const playlistId of playlistIds) {
      const playlist = await spotifyApi.getPlaylistTracks(playlistId);
      const tracks = playlist.body.items
        .filter(item => item.track && !seenTrackIds.has(item.track.id))
        .map(item => {
          seenTrackIds.add(item.track.id);
          return item.track.uri;
        });
      allTracks = allTracks.concat(tracks);
    }
    
    // Create new playlist
    const playlist = await spotifyApi.createPlaylist(userId, newPlaylistName, {
      description: 'Merged playlist created using Fuzic',
      public: false
    });
    
    // Add tracks to new playlist (Spotify API limits to 100 tracks per request)
    const batchSize = 100;
    for (let i = 0; i < allTracks.length; i += batchSize) {
      const batch = allTracks.slice(i, i + batchSize);
      await spotifyApi.addTracksToPlaylist(playlist.body.id, batch);
    }
    
    res.json({ 
      success: true, 
      playlist: playlist.body,
      tracksAdded: allTracks.length 
    });
  } catch (error) {
    console.error('Error merging playlists:', error);
    res.status(500).json({ error: 'Failed to merge playlists' });
  }
});

// Remove artist's songs from playlist
app.post('/api/remove-artist-songs', refreshTokenIfNeeded, async (req, res) => {
  try {
    const { playlistId, artistName } = req.body;
    
    // Get playlist tracks
    const playlist = await spotifyApi.getPlaylistTracks(playlistId);
    
    // Find tracks by the specified artist
    const tracksToRemove = playlist.body.items
      .filter(item => 
        item.track && 
        item.track.artists.some(artist => 
          artist.name.toLowerCase().includes(artistName.toLowerCase())
        )
      )
      .map(item => ({ uri: item.track.uri }));
    
    // Remove tracks from playlist
    if (tracksToRemove.length > 0) {
      await spotifyApi.removeTracksFromPlaylist(playlistId, tracksToRemove);
    }
    
    res.json({ 
      success: true, 
      tracksRemoved: tracksToRemove.length 
    });
  } catch (error) {
    console.error('Error removing artist songs:', error);
    res.status(500).json({ error: 'Failed to remove artist songs' });
  }
});

// Get user profile
app.get('/api/user', refreshTokenIfNeeded, async (req, res) => {
  try {
    const userInfo = await spotifyApi.getMe();
    res.json(userInfo.body);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Cross-platform playlist features
app.post('/api/import-playlist', refreshTokenIfNeeded, async (req, res) => {
  try {
    const { playlistUrl, playlistName } = req.body;
    
    const crossPlatformService = new CrossPlatformService();
    crossPlatformService.initSpotify(req.cookies.access_token);
    
    // Parse the playlist URL to determine platform
    const { platform, playlistId } = crossPlatformService.parsePlaylistUrl(playlistUrl);
    
    // Get tracks from source platform
    let tracks;
    if (platform === 'spotify') {
      tracks = await crossPlatformService.getSpotifyPlaylistTracks(playlistId);
    } else if (platform === 'apple') {
      // Initialize Apple Music API if needed
      if (req.cookies.apple_music_token) {
        await crossPlatformService.initAppleMusic(
          process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
          req.cookies.apple_music_token
        );
        tracks = await crossPlatformService.getAppleMusicPlaylistTracks(playlistId);
      } else {
        return res.status(401).json({ 
          success: false, 
          error: 'Apple Music authentication required. Please log in to Apple Music first.' 
        });
      }
    } else if (platform === 'amazon') {
      // Initialize Amazon Music API if needed
      if (req.cookies.amazon_music_token) {
        await crossPlatformService.initAmazonMusic(req.cookies.amazon_music_token);
        tracks = await crossPlatformService.getAmazonMusicPlaylistTracks(playlistId);
      } else {
        return res.status(401).json({ 
          success: false, 
          error: 'Amazon Music authentication required. Please log in to Amazon Music first.' 
        });
      }
    }
    
    // Search for tracks on Spotify and create playlist
    const spotifyTrackUris = await crossPlatformService.searchSpotifyTracks(tracks);
    
    if (spotifyTrackUris.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No tracks found on Spotify. Please check the playlist URL.' 
      });
    }
    
    // Get user info and create playlist
    const userInfo = await spotifyApi.getMe();
    const result = await crossPlatformService.createSpotifyPlaylist(
      userInfo.body.id,
      playlistName,
      spotifyTrackUris
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error importing playlist:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to import playlist' 
    });
  }
});

// Export playlist to other platforms
app.post('/api/export-playlist', refreshTokenIfNeeded, async (req, res) => {
  try {
    const { platform, playlistId } = req.body;
    
    const crossPlatformService = new CrossPlatformService();
    crossPlatformService.initSpotify(req.cookies.access_token);
    
    // Get playlist tracks from Spotify
    const tracks = await crossPlatformService.getSpotifyPlaylistTracks(playlistId);
    const playlist = await spotifyApi.getPlaylist(playlistId);
    const playlistName = playlist.body.name;
    
    let result;
    
    if (platform === 'apple') {
      if (!req.cookies.apple_music_token) {
        return res.status(401).json({ 
          success: false, 
          error: 'Apple Music authentication required. Please log in to Apple Music first.' 
        });
      }
      
      await crossPlatformService.initAppleMusic(
        process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
        req.cookies.apple_music_token
      );
      result = await crossPlatformService.exportToAppleMusic(playlistName, tracks);
    } else if (platform === 'amazon') {
      if (!req.cookies.amazon_music_token) {
        return res.status(401).json({ 
          success: false, 
          error: 'Amazon Music authentication required. Please log in to Amazon Music first.' 
        });
      }
      
      await crossPlatformService.initAmazonMusic(req.cookies.amazon_music_token);
      result = await crossPlatformService.exportToAmazonMusic(playlistName, tracks);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported platform' 
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error exporting playlist:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to export playlist' 
    });
  }
});

// Apple Music authentication
app.get('/apple-music-login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'playlist-read-private playlist-modify-private';
  
  res.cookie('apple_music_auth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  const authorizeURL = `https://music.apple.com/authorize?client_id=${process.env.APPLE_MUSIC_CLIENT_ID}&redirect_uri=${process.env.APPLE_MUSIC_REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
  res.redirect(authorizeURL);
});

// Apple Music callback
app.get('/apple-music-callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies['apple_music_auth_state'] : null;
  
  if (state === null || state !== storedState) {
    res.redirect('/#error=state_mismatch');
    return;
  }
  
  res.clearCookie('apple_music_auth_state');
  
  try {
    // Exchange code for token (you'll need to implement this based on Apple Music API)
    const tokenResponse = await axios.post('https://music.apple.com/token', {
      client_id: process.env.APPLE_MUSIC_CLIENT_ID,
      client_secret: process.env.APPLE_MUSIC_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.APPLE_MUSIC_REDIRECT_URI
    });
    
    const { access_token } = tokenResponse.data;
    
    res.cookie('apple_music_token', access_token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    res.redirect('/dashboard?feature=cross-platform');
  } catch (error) {
    console.error('Error getting Apple Music tokens:', error);
    res.redirect('/#error=apple_music_auth_failed');
  }
});

// Amazon Music authentication
app.get('/amazon-music-login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'music:playlist_read music:playlist_write';
  
  res.cookie('amazon_music_auth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  const authorizeURL = `https://www.amazon.com/ap/oa?client_id=${process.env.AMAZON_MUSIC_CLIENT_ID}&scope=${scope}&response_type=code&redirect_uri=${process.env.AMAZON_MUSIC_REDIRECT_URI}&state=${state}`;
  res.redirect(authorizeURL);
});

// Amazon Music callback
app.get('/amazon-music-callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies['amazon_music_auth_state'] : null;
  
  if (state === null || state !== storedState) {
    res.redirect('/#error=state_mismatch');
    return;
  }
  
  res.clearCookie('amazon_music_auth_state');
  
  try {
    // Exchange code for token (you'll need to implement this based on Amazon Music API)
    const tokenResponse = await axios.post('https://api.amazon.com/auth/o2/token', {
      client_id: process.env.AMAZON_MUSIC_CLIENT_ID,
      client_secret: process.env.AMAZON_MUSIC_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.AMAZON_MUSIC_REDIRECT_URI
    });
    
    const { access_token } = tokenResponse.data;
    
    res.cookie('amazon_music_token', access_token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    res.redirect('/dashboard?feature=cross-platform');
  } catch (error) {
    console.error('Error getting Amazon Music tokens:', error);
    res.redirect('/#error=amazon_music_auth_failed');
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Fuzic web app listening at http://localhost:${port}`);
});

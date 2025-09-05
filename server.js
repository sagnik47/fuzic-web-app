const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const CrossPlatformService = require('./services/cross-platform');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://fuzic.vercel.app/callback'
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
          sameSite: 'lax',
          maxAge: 2592000000, // 30 days
          path: '/',
          // domain: '.yourdomain.com',
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
      maxAge: 2592000000, // 30 days
      path: '/', // ensure cookie is sent for all routes
      // domain: '.yourdomain.com', // uncomment and set if using a custom domain
    });
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2592000000, // 30 days
      path: '/',
      // domain: '.yourdomain.com',
    });
    // Add a client-accessible cookie for authentication status checks
    res.cookie('fuzic_auth', 'true', {
      httpOnly: false, // This allows client-side access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2592000000, // 30 days
      path: '/',
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

// Transfer playlists route
app.get('/transfer', (req, res) => {
  res.sendFile(__dirname + '/public/transfer.html');
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
app.post('/api/convert-liked-to-playlist', async (req, res) => {
  try {
    console.log('Starting convert-liked-to-playlist process...');
    
    // Ensure access token is set
    const token = req.cookies.access_token;
    if (!token) {
      console.error('No access token found in cookies');
      return res.status(401).json({ 
        success: false,
        error: 'No access token available. Please log in again.' 
      });
    }

    spotifyApi.setAccessToken(token);
    console.log('Access token set successfully');

    // Step 1: Get ALL liked songs with sequential pagination to preserve order
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let allLikedSongs = [];

    console.log('Starting to fetch liked songs...');
    while (hasMore) {
      console.log(`Fetching liked songs batch (offset: ${offset}, limit: ${limit})`);
      const response = await spotifyApi.getMySavedTracks({ limit, offset });
      
      if (!response || !response.body) {
        console.error('getMySavedTracks() failed: No response body');
        return res.status(500).json({
          success: false,
          error: 'Failed to get liked songs from Spotify'
        });
      }
      
      // Store all items to preserve order
      allLikedSongs.push(...response.body.items);
      console.log(`Fetched ${response.body.items.length} songs (total so far: ${allLikedSongs.length})`);
      
      // Check if we've reached the end
      if (response.body.items.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
    
    // Extract track URIs in the exact order they were fetched
    const allTracks = allLikedSongs.map(item => item.track.uri);

    console.log(`Total liked songs found: ${allTracks.length}`);

    if (allTracks.length === 0) {
      console.log('No liked songs found');
      return res.status(400).json({ 
        success: false,
        error: 'No liked songs found. Please like some songs first!' 
      });
    }

    // Step 2: Get user info and create public playlist
    const me = await spotifyApi.getMe();
    if (!me || !me.body) {
      console.error('getMe() failed: No user info returned');
      return res.status(500).json({
        success: false,
        error: 'Failed to get user information from Spotify'
      });
    }
    
    const playlistName = `Liked Songs - ${new Date().toLocaleDateString()}`;
    console.log('Creating playlist:', playlistName);
    
    const playlistResponse = await spotifyApi.createPlaylist(me.body.id, {
      name: playlistName,
      description: 'Converted from Liked Songs via Fuzic.vercel.app',
      public: true, // Make it a public playlist
    });

    if (!playlistResponse || !playlistResponse.body) {
      console.error('createPlaylist() failed: No playlist object returned');
      return res.status(500).json({
        success: false,
        error: 'Spotify API did not return a valid playlist object.'
      });
    }

    const playlistId = playlistResponse.body.id;
    if (!playlistId) {
      console.error('createPlaylist() failed: No playlist ID returned');
      return res.status(500).json({
        success: false,
        error: 'Spotify API did not return a valid playlist object.'
      });
    }

    console.log('Playlist created successfully with ID:', playlistId);

    // Step 3: Add tracks in batches of 100
    if (allTracks.length > 0) {
      console.log(`Adding ${allTracks.length} tracks to playlist...`);
      
      for (let i = 0; i < allTracks.length; i += 100) {
        const batch = allTracks.slice(i, i + 100);
        console.log(`Adding batch ${Math.floor(i/100) + 1} (${batch.length} tracks)`);
        
        const addTracksResponse = await spotifyApi.addTracksToPlaylist(playlistId, batch);
        if (!addTracksResponse || !addTracksResponse.body) {
          console.error('addTracksToPlaylist() failed: No response body');
          return res.status(500).json({
            success: false,
            error: 'Failed to add tracks to playlist'
          });
        }
      }
      
      console.log('All tracks added successfully');
    }

    console.log('Convert-liked-to-playlist process completed successfully');
    return res.json({ 
      success: true, 
      playlist: playlistResponse.body,
      tracksAdded: allTracks.length 
    });

  } catch (error) {
    console.error('Error creating playlist:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal Server Error' 
    });
  }
});

// Get user information
app.get('/api/me', refreshTokenIfNeeded, async (req, res) => {
  try {
    const userInfo = await spotifyApi.getMe();
    res.json(userInfo.body);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      error: 'Failed to fetch user information'
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
    res.status(500).json({
      error: 'Failed to fetch playlists',
      details: error.body || error.message || error
    });
  }
});

// Test endpoint to check if an image exists on the server
app.get('/api/image-exists/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, 'public', 'images', filename);
  fs.access(imagePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ exists: false, message: 'Image not found on server', path: imagePath });
    }
    res.json({ exists: true, message: 'Image found on server', path: imagePath });
  });
});

// Merge playlists (fix 0.3 of merge playlists)
app.post('/api/merge-playlists', async (req, res) => {
  try {
    console.log('Starting merge playlists process...');
    console.log('Raw request body:', req.body);
    console.log('Request headers:', req.headers);

    // -- Basic validation & payload normalization
    let { name, selectedPlaylists } = req.body;
    if (!name && req.body.newPlaylistName) name = req.body.newPlaylistName;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.error('Playlist name missing or invalid. Request body keys:', Object.keys(req.body));
      return res.status(400).json({ success: false, error: 'Playlist name is required and must be a non-empty string' });
    }
    const playlistName = name.trim();

    if (!selectedPlaylists || !Array.isArray(selectedPlaylists) || selectedPlaylists.length < 2) {
      console.error('selectedPlaylists missing/invalid:', selectedPlaylists);
      return res.status(400).json({ success: false, error: 'Please provide a name and at least 2 playlists to merge.' });
    }

    // Validate each playlist id
    for (const pid of selectedPlaylists) {
      if (!pid || typeof pid !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid playlist ID provided' });
      }
    }

    // -- Ensure access token present
    const accessToken = req.cookies && req.cookies.access_token;
    const refreshToken = req.cookies && req.cookies.refresh_token;
    if (!accessToken) {
      console.error('No access token in cookies');
      return res.status(401).json({ success: false, error: 'No access token available. Please log in again.' });
    }
    spotifyApi.setAccessToken(accessToken);

    // Helper: try to refresh token if 401 and cookie refresh token exists
    async function tryRefreshAccessTokenIfNeeded(err) {
      if (err && err.statusCode === 401 && refreshToken) {
        console.log('Access token expired — attempting refresh using refresh token...');
        try {
          spotifyApi.setRefreshToken(refreshToken);
          const refreshRes = await spotifyApi.refreshAccessToken();
          const newAccessToken = refreshRes.body.access_token;
          spotifyApi.setAccessToken(newAccessToken);

          // Update cookie (make sure cookie config matches your production settings)
          res.cookie('access_token', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 2592000000,
            path: '/'
          });

          console.log('Access token refreshed successfully');
          return true;
        } catch (refreshErr) {
          console.error('Refresh failed:', refreshErr);
          return false;
        }
      }
      return false;
    }

    // Helper: robust createPlaylist with fallbacks
    async function createPlaylistWithFallback(userId, name, options) {
      const attempts = [];
      // Candidate call signatures in order:
      const callCandidates = [
        async () => spotifyApi.createPlaylist(userId, name, options),
        async () => spotifyApi.createPlaylist(name, options),
        async () => spotifyApi.createPlaylist({ name, ...options }),
        async () => spotifyApi.createPlaylist(undefined, { name, ...options })
      ];

      for (const call of callCandidates) {
        try {
          const response = await call();
          attempts.push({ ok: true, response });
          // If we got a response object with a body that has an id — success
          if (response && response.body && response.body.id) {
            return response;
          } else {
            // If response exists but missing body or id, log and continue to next signature
            console.warn('createPlaylist returned but missing body.id; continuing to next signature. Response snapshot:', JSON.stringify(response && response.body).slice(0, 500));
          }
        } catch (err) {
          attempts.push({ ok: false, error: err });
          // If 401, attempt refresh once and then retry this same call after refresh
          if (err && err.statusCode === 401) {
            const refreshed = await tryRefreshAccessTokenIfNeeded(err);
            if (refreshed) {
              try {
                const retryResp = await call();
                if (retryResp && retryResp.body && retryResp.body.id) return retryResp;
              } catch (retryErr) {
                // fall through to try other signatures
                console.error('Retry after refresh failed:', retryErr);
              }
            }
          }
          // log and move to next candidate
          console.warn('createPlaylist candidate failed:', err && err.statusCode, err && err.body && err.body.error && err.body.error.message);
        }
      }

      // If none succeeded, throw a descriptive error with attempt details
      const consolidated = attempts.map(a => a.ok ? `OK:${a.response && (a.response.statusCode || 'resp')}` : `ERR:${a.error && (a.error.statusCode || a.error.message)}`).join(' | ');
      const error = new Error('All createPlaylist signatures failed. Attempts: ' + consolidated);
      error.attempts = attempts;
      throw error;
    }

    // -- Get user info
    let me;
    try {
      me = await spotifyApi.getMe();
      if (!me || !me.body || !me.body.id) {
        console.error('getMe() returned invalid user object:', me && me.body);
        return res.status(500).json({ success: false, error: 'Failed to get user information from Spotify' });
      }
    } catch (err) {
      console.error('getMe() error:', err);
      // Try refresh token flow if 401
      const refreshed = await tryRefreshAccessTokenIfNeeded(err);
      if (refreshed) {
        try {
          me = await spotifyApi.getMe();
        } catch (err2) {
          console.error('getMe() after refresh failed:', err2);
          return res.status(500).json({ success: false, error: 'Failed to get user information from Spotify after token refresh' });
        }
      } else {
        return res.status(500).json({ success: false, error: 'Failed to get user information from Spotify' });
      }
    }

    const userId = me.body.id;
    console.log('Merging playlists for user:', me.body.display_name || userId);

    // -- Gather tracks in order (preserve ordering)
    const allTracks = [];
    const seenTrackIds = new Set();

    for (let idx = 0; idx < selectedPlaylists.length; idx++) {
      const pid = selectedPlaylists[idx];
      console.log(`Processing (${idx + 1}/${selectedPlaylists.length}):`, pid);

      if (pid === 'liked-songs') {
        // Sequential pagination to preserve order
        let offset = 0;
        const limit = 50;
        let keepGoing = true;
        const liked = [];

        while (keepGoing) {
          const response = await spotifyApi.getMySavedTracks({ limit, offset });
          if (!response || !response.body || !Array.isArray(response.body.items)) {
            throw new Error('Failed to fetch liked songs from Spotify');
          }
          liked.push(...response.body.items);
          if (response.body.items.length < limit) keepGoing = false;
          else offset += limit;
        }

        for (const item of liked) {
          if (item.track && item.track.id && !seenTrackIds.has(item.track.id)) {
            seenTrackIds.add(item.track.id);
            if (item.track.uri) allTracks.push(item.track.uri);
          }
        }

        console.log(`Added ${liked.length} liked songs (unique added ${allTracks.length})`);
      } else {
        // Regular playlist — paginate playlist tracks as well to be safe
        let offset = 0;
        const limit = 100;
        let keepGoing = true;

        while (keepGoing) {
          const response = await spotifyApi.getPlaylistTracks(pid, { limit, offset });
          if (!response || !response.body || !Array.isArray(response.body.items)) {
            throw new Error(`Failed to fetch tracks for playlist ${pid}`);
          }

          for (const item of response.body.items) {
            if (item.track && item.track.id && !seenTrackIds.has(item.track.id)) {
              seenTrackIds.add(item.track.id);
              if (item.track.uri) allTracks.push(item.track.uri);
            }
          }

          if (response.body.items.length < limit) keepGoing = false;
          else offset += limit;
        }

        console.log(`Playlist ${pid} processed — total tracks so far: ${allTracks.length}`);
      }
    }

    console.log(`Total unique tracks to add: ${allTracks.length}`);
    if (allTracks.length === 0) {
      return res.status(400).json({ success: false, error: 'No tracks found in the selected playlists' });
    }

    // -- Create playlist robustly with fallback & refresh attempt
    console.log('Creating new playlist:', playlistName);
    const playlistOptions = { description: 'Merged playlist via Fuzic', public: true };

    let newPlaylistResponse;
    try {
      newPlaylistResponse = await createPlaylistWithFallback(userId, playlistName, playlistOptions);
    } catch (err) {
      console.error('createPlaylistWithFallback failed:', err);
      // If err.attempts exist, include the most relevant Spotify error message if present
      const firstError = (err.attempts && err.attempts.find(a => !a.ok && a.error)) ? err.attempts.find(a => !a.ok && a.error).error : null;
      if (firstError) {
        console.error('Underlying spotify error details:', firstError.statusCode, firstError.body);
        if (firstError.statusCode === 403) {
          return res.status(403).json({ success: false, error: 'Permission denied. Ensure your app has playlist-modify-public or playlist-modify-private scopes and user consented.' });
        }
        if (firstError.statusCode === 401) {
          return res.status(401).json({ success: false, error: 'Authentication expired. Please log in again.' });
        }
      }
      return res.status(500).json({ success: false, error: 'Failed to create playlist' });
    }

    if (!newPlaylistResponse || !newPlaylistResponse.body || !newPlaylistResponse.body.id) {
      console.error('createPlaylist returned no valid body after fallback attempts:', JSON.stringify(newPlaylistResponse && newPlaylistResponse.body).slice(0, 1000));
      return res.status(500).json({ success: false, error: 'Spotify API did not return a valid playlist object.' });
    }

    const newPlaylistId = newPlaylistResponse.body.id;
    console.log('New playlist created:', newPlaylistId, newPlaylistResponse.body.name);

    // -- Add tracks in batches of 100 preserving order
    try {
      for (let i = 0; i < allTracks.length; i += 100) {
        const batch = allTracks.slice(i, i + 100);
        console.log(`Adding batch ${Math.floor(i / 100) + 1} (${batch.length} tracks)`);
        await spotifyApi.addTracksToPlaylist(newPlaylistId, batch);
      }
      console.log('All tracks added.');
    } catch (err) {
      console.error('Error while adding tracks to playlist:', err && err.statusCode, err && err.body || err && err.message);
      return res.status(500).json({ success: false, error: 'Failed to add tracks to playlist' });
    }

    // -- Success
    return res.json({
      success: true,
      playlist: {
        id: newPlaylistResponse.body.id,
        name: newPlaylistResponse.body.name,
        uri: newPlaylistResponse.body.uri,
        external_urls: newPlaylistResponse.body.external_urls
      },
      tracksAdded: allTracks.length
    });

  } catch (error) {
    console.error('Unexpected error in merge-playlists:', error);
    const errMsg = (error && error.message) ? error.message : 'Failed to merge playlists';
    return res.status(500).json({ success: false, error: errMsg });
  }
});


// Remove artist's songs from playlist
app.post('/api/remove-artist-songs', refreshTokenIfNeeded, async (req, res) => {
  try {
    const { playlistId, artistName } = req.body;
    
    // Get playlist tracks
    const playlistResponse = await spotifyApi.getPlaylistTracks(playlistId);
    if (!playlistResponse || !playlistResponse.body) {
      throw new Error('Spotify API did not return playlist tracks for playlist: ' + playlistId);
    }
    
    // Find tracks by the specified artist
    const tracksToRemove = playlistResponse.body.items
      .filter(item => 
        item.track && 
        item.track.artists.some(artist => 
          artist.name.toLowerCase().includes(artistName.toLowerCase())
        )
      )
      .map(item => ({ uri: item.track.uri }));
    
    // Remove tracks from playlist
    if (tracksToRemove.length > 0) {
      const removeTracksResponse = await spotifyApi.removeTracksFromPlaylist(playlistId, tracksToRemove);
      if (!removeTracksResponse || !removeTracksResponse.body) {
        throw new Error('Failed to remove tracks from playlist');
      }
    }
    
    res.json({ 
      success: true, 
      tracksRemoved: tracksToRemove.length 
    });
  } catch (error) {
    console.error('Error removing artist songs:', error);
    console.error('Error status:', error.statusCode);
    console.error('Error body:', error.body);
    console.error('Error message:', error.message);
    
    let errorMessage = 'Failed to remove artist songs';
    
    if (error.statusCode === 401) {
      errorMessage = 'Authentication expired. Please log in again.';
    } else if (error.statusCode === 403) {
      errorMessage = 'Permission denied. Please check app permissions.';
    } else if (error.body && error.body.error && error.body.error.message) {
      errorMessage = error.body.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(error.statusCode || 500).json({ 
      success: false,
      error: errorMessage 
    });
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
  res.clearCookie('fuzic_auth');
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Fuzic web app listening at http://localhost:${port}`);
});

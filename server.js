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

// Merge playlists
app.post('/api/merge-playlists', async (req, res) => {
  try {
    console.log('Starting merge playlists process...');
    
    // Step 1: Parse and validate request body
    console.log('Raw request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { name, selectedPlaylists } = req.body;
    console.log('Parsed payload:', { name, selectedPlaylists });
    console.log('Name type:', typeof name);
    console.log('Name length:', name ? name.length : 'undefined');
    
    // Validate playlist name with fallback checks
    let playlistName = name;
    
    // Check if name is in a different field (fallback)
    if (!playlistName && req.body.newPlaylistName) {
      playlistName = req.body.newPlaylistName;
      console.log('Using fallback newPlaylistName:', playlistName);
    }
    
    if (!playlistName || typeof playlistName !== 'string' || playlistName.trim() === '') {
      console.error('Playlist name is missing, empty, or not a string');
      console.error('Available fields in req.body:', Object.keys(req.body));
      return res.status(400).json({
        success: false,
        error: 'Playlist name is required and must be a non-empty string'
      });
    }
    
    // Trim the name
    playlistName = playlistName.trim();
    console.log('Final playlist name:', playlistName);
    
    // Validate selected playlists
    if (!selectedPlaylists || !Array.isArray(selectedPlaylists) || selectedPlaylists.length < 2) {
      console.error('Invalid selected playlists:', selectedPlaylists);
      return res.status(400).json({
        success: false,
        error: 'Please provide a name and at least 2 playlists to merge.'
      });
    }
    
    console.log('Playlist name:', playlistName);
    console.log('Selected playlists:', selectedPlaylists);
    
    // Validate selected playlists
    if (!selectedPlaylists || !Array.isArray(selectedPlaylists) || selectedPlaylists.length < 2) {
      console.error('Invalid selectedPlaylists: missing, not array, or insufficient playlists');
      return res.status(400).json({
        success: false,
        error: 'Please select at least 2 playlists to merge'
      });
    }
    
    // Validate each playlist ID
    for (const playlistId of selectedPlaylists) {
      if (!playlistId || typeof playlistId !== 'string') {
        console.error('Invalid playlist ID:', playlistId);
        return res.status(400).json({
          success: false,
          error: 'Invalid playlist ID provided'
        });
      }
    }
    
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
    
    // Step 2: Get user info
    let userInfo;
    try {
      console.log('Fetching user information...');
      userInfo = await spotifyApi.getMe();
      if (!userInfo || !userInfo.body) {
        console.error('getMe() failed: No user info returned');
        return res.status(500).json({
          success: false,
          error: 'Failed to get user information from Spotify'
        });
      }
      console.log('Merging playlists for user:', userInfo.body.display_name);
    } catch (error) {
      console.error('getMe() error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get user information from Spotify'
      });
    }
    
    const userId = userInfo.body.id;
    console.log('User ID:', userId);
    
    // Validate user ID
    if (!userId) {
      console.error('No user ID returned from Spotify');
      return res.status(500).json({
        success: false,
        error: 'Failed to get user ID from Spotify'
      });
    }
    
    // Step 3: Get tracks from all playlists with proper error handling
    let allTracks = [];
    const seenTrackIds = new Set();
    
    for (let i = 0; i < selectedPlaylists.length; i++) {
      const playlistId = selectedPlaylists[i];
      console.log(`Processing playlist ${i + 1}/${selectedPlaylists.length}: ${playlistId}`);
      
      try {
        // Check if this is "Liked Songs" (special handling)
        if (playlistId === 'liked-songs') {
          console.log('Processing Liked Songs...');
          
          // Get liked songs with sequential pagination to preserve order
          let offset = 0;
          const limit = 50;
          let hasMore = true;
          let likedSongsBatch = [];
          
          // Fetch all liked songs sequentially to preserve order
          while (hasMore) {
            console.log(`Fetching liked songs batch (offset: ${offset}, limit: ${limit})`);
            const likedSongsResponse = await spotifyApi.getMySavedTracks({ limit, offset });
            if (!likedSongsResponse || !likedSongsResponse.body) {
              console.error('getMySavedTracks() failed for Liked Songs');
              return res.status(500).json({
                success: false,
                error: 'Failed to get liked songs from Spotify'
              });
            }
            
            // Store the entire batch to preserve order
            likedSongsBatch.push(...likedSongsResponse.body.items);
            console.log(`Fetched ${likedSongsResponse.body.items.length} liked songs (total so far: ${likedSongsBatch.length})`);
            
            // Check if we've reached the end
            if (likedSongsResponse.body.items.length < limit) {
              hasMore = false;
            } else {
              offset += limit;
            }
          }
          
          // Process all liked songs in order, removing duplicates
          const uniqueTracks = [];
          const likedSongsSeenIds = new Set();
          
          for (const item of likedSongsBatch) {
            if (item.track && !likedSongsSeenIds.has(item.track.id)) {
              likedSongsSeenIds.add(item.track.id);
              uniqueTracks.push(item.track.uri);
            }
          }
          
          allTracks.push(...uniqueTracks);
          console.log(`Added ${uniqueTracks.length} unique liked songs in original order`);
        } else {
          // Regular playlist
          console.log(`Fetching tracks for playlist: ${playlistId}`);
          const playlistResponse = await spotifyApi.getPlaylistTracks(playlistId);
          
          if (!playlistResponse || !playlistResponse.body) {
            console.error(`getPlaylistTracks() failed for playlist: ${playlistId}`);
            return res.status(500).json({
              success: false,
              error: `Failed to get tracks for playlist: ${playlistId}`
            });
          }
          
          const tracks = playlistResponse.body.items
            .filter(item => item.track && !seenTrackIds.has(item.track.id))
            .map(item => {
              seenTrackIds.add(item.track.id);
              return item.track.uri;
            });
          allTracks.push(...tracks);
          console.log(`Fetched ${playlistResponse.body.items.length} tracks from playlist ${playlistId} (total so far: ${allTracks.length})`);
        }
      } catch (error) {
        console.error(`Error processing playlist ${playlistId}:`, error);
        return res.status(500).json({
          success: false,
          error: `Failed to process playlist: ${playlistId}`
        });
      }
    }
    
    console.log(`Total unique tracks found: ${allTracks.length}`);
    
    if (allTracks.length === 0) {
      console.log('No tracks found in selected playlists');
      return res.status(400).json({
        success: false,
        error: 'No tracks found in the selected playlists'
      });
    }
    
    // Step 4: Create new playlist with proper validation
    console.log('Creating new merged playlist:', playlistName);
    console.log('User ID:', userId);
    
    let newPlaylistResponse;
    try {
      // Create playlist with proper options object
      const playlistOptions = {
        description: 'Merged playlist via Fuzic',
        public: true
      };
      
      console.log('Creating playlist with options:', playlistOptions);
      
      newPlaylistResponse = await spotifyApi.createPlaylist(userId, playlistName, playlistOptions);
      
      console.log('Created Playlist Response:', JSON.stringify(newPlaylistResponse, null, 2));
      
      // Validate the response structure
      if (!newPlaylistResponse) {
        console.error('createPlaylist() failed: No response returned');
        return res.status(500).json({
          success: false,
          error: 'Spotify API did not return a valid playlist object.'
        });
      }
      
      if (!newPlaylistResponse.body) {
        console.error('createPlaylist() failed: No body in response');
        console.error('Full response:', JSON.stringify(newPlaylistResponse));
        return res.status(500).json({
          success: false,
          error: 'Spotify API did not return a valid playlist object.'
        });
      }
      
      // Validate required fields
      if (!newPlaylistResponse.body.id) {
        console.error('createPlaylist() failed: Missing playlist ID');
        console.error('Response body:', JSON.stringify(newPlaylistResponse.body));
        return res.status(500).json({
          success: false,
          error: 'Spotify API did not return a valid playlist object.'
        });
      }
      
      if (!newPlaylistResponse.body.name) {
        console.error('createPlaylist() failed: Missing playlist name');
        console.error('Response body:', JSON.stringify(newPlaylistResponse.body));
        return res.status(500).json({
          success: false,
          error: 'Spotify API did not return a valid playlist object.'
        });
      }
      
      console.log('Playlist created successfully:', {
        id: newPlaylistResponse.body.id,
        name: newPlaylistResponse.body.name,
        uri: newPlaylistResponse.body.uri,
        external_urls: newPlaylistResponse.body.external_urls
      });
    } catch (error) {
      console.error('createPlaylist() error:', error);
      console.error('Error details:', {
        statusCode: error.statusCode,
        body: error.body,
        message: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create playlist'
      });
    }
    
    const newPlaylistId = newPlaylistResponse.body.id;
    
    // Step 5: Add tracks to new playlist in batches of 100
    if (allTracks.length > 0) {
      try {
        console.log(`Tracks to add:`, allTracks);
        console.log(`Adding ${allTracks.length} tracks to new playlist...`);
        
        // Validate track URIs
        if (!Array.isArray(allTracks) || allTracks.length === 0) {
          console.error('No valid tracks to add');
          return res.status(400).json({
            success: false,
            error: 'No valid tracks found to add to playlist'
          });
        }
        
        // Check if all tracks are valid Spotify URIs
        const validTracks = allTracks.filter(track => track && track.startsWith('spotify:track:'));
        if (validTracks.length !== allTracks.length) {
          console.error('Some tracks are not valid Spotify URIs');
          console.error('Invalid tracks:', allTracks.filter(track => !track || !track.startsWith('spotify:track:')));
        }
        
        for (let i = 0; i < allTracks.length; i += 100) {
          const batch = allTracks.slice(i, i + 100);
          console.log(`Adding batch ${Math.floor(i/100) + 1} (${batch.length} tracks)`);
          
          const addTracksResponse = await spotifyApi.addTracksToPlaylist(newPlaylistId, batch);
          if (!addTracksResponse || !addTracksResponse.body) {
            console.error('addTracksToPlaylist() failed: No response body');
            return res.status(500).json({
              success: false,
              error: 'Failed to add tracks to playlist'
            });
          }
        }
        
        console.log('All tracks added successfully');
      } catch (error) {
        console.error('addTracksToPlaylist() error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to add tracks to playlist'
        });
      }
    } else {
      console.log('No tracks to add to playlist');
    }
    
    console.log('Merge playlists process completed successfully');
    res.json({ 
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
    console.error('Unexpected error in merge playlists:', error);
    
    let errorMessage = 'Failed to merge playlists';
    
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

const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Spotify API configuration
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

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
  const scope = ['user-library-read', 'playlist-read-private', 'playlist-modify-private', 'playlist-modify-public'];
  
  res.cookie('spotify_auth_state', state);
  
  const authorizeURL = spotifyApi.createAuthorizeURL(scope, state);
  res.redirect(authorizeURL);
});

// Callback route
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;
  
  if (state === null || state !== storedState) {
    res.redirect('/#error=state_mismatch');
    return;
  }
  
  res.clearCookie('spotify_auth_state');
  
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token } = data.body;
    
    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);
    
    // Store tokens in cookies (in production, use secure storage)
    res.cookie('access_token', access_token, { httpOnly: true });
    res.cookie('refresh_token', refresh_token, { httpOnly: true });
    
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
app.get('/api/liked-songs', async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
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
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
    
    // Get user info
    const userInfo = await spotifyApi.getMe();
    const userId = userInfo.body.id;
    
    // Get liked songs
    const likedSongs = await spotifyApi.getMySavedTracks({ limit: 50 });
    const trackUris = likedSongs.body.items.map(item => item.track.uri);
    
    // Create playlist
    const playlistName = `Liked Songs - ${new Date().toLocaleDateString()}`;
    const playlist = await spotifyApi.createPlaylist(userId, playlistName, {
      description: 'Playlist created from liked songs using Fuzic',
      public: false
    });
    
    // Add tracks to playlist
    if (trackUris.length > 0) {
      await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    }
    
    res.json({ 
      success: true, 
      playlist: playlist.body,
      tracksAdded: trackUris.length 
    });
  } catch (error) {
    console.error('Error converting liked songs to playlist:', error);
    res.status(500).json({ error: 'Failed to convert liked songs to playlist' });
  }
});

// Get user's playlists
app.get('/api/playlists', async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
    const data = await spotifyApi.getUserPlaylists({ limit: 50 });
    res.json(data.body);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Merge playlists
app.post('/api/merge-playlists', async (req, res) => {
  try {
    const { playlistIds, newPlaylistName } = req.body;
    const accessToken = req.cookies.access_token;
    
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
    
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
app.post('/api/remove-artist-songs', async (req, res) => {
  try {
    const { playlistId, artistName } = req.body;
    const accessToken = req.cookies.access_token;
    
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
    
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
app.get('/api/user', async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }
    
    spotifyApi.setAccessToken(accessToken);
    const userInfo = await spotifyApi.getMe();
    res.json(userInfo.body);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
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

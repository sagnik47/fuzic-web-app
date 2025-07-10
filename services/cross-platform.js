const axios = require('axios');
const MusicKit = require('music-kit');

class CrossPlatformService {
  constructor() {
    this.spotifyApi = null;
    this.appleMusicApi = null;
    this.amazonMusicApi = null;
  }

  // Initialize Spotify API
  initSpotify(accessToken) {
    const SpotifyWebApi = require('spotify-web-api-node');
    this.spotifyApi = new SpotifyWebApi({
      accessToken: accessToken
    });
  }

  // Initialize Apple Music API
  async initAppleMusic(developerToken, userToken) {
    try {
      this.appleMusicApi = new MusicKit({
        developerToken: developerToken,
        userToken: userToken
      });
      await this.appleMusicApi.authorize();
    } catch (error) {
      console.error('Apple Music initialization failed:', error);
      throw error;
    }
  }

  // Initialize Amazon Music API
  async initAmazonMusic(accessToken) {
    this.amazonMusicApi = {
      accessToken: accessToken,
      baseURL: 'https://api.amazon.com/music'
    };
  }

  // Parse playlist URL to extract platform and playlist ID
  parsePlaylistUrl(url) {
    const urlObj = new URL(url);
    
    // Spotify playlist URL
    if (urlObj.hostname.includes('spotify.com') && urlObj.pathname.includes('/playlist/')) {
      const playlistId = urlObj.pathname.split('/playlist/')[1].split('?')[0];
      return { platform: 'spotify', playlistId };
    }
    
    // Apple Music playlist URL
    if (urlObj.hostname.includes('music.apple.com') && urlObj.pathname.includes('/playlist/')) {
      const playlistId = urlObj.pathname.split('/playlist/')[1].split('?')[0];
      return { platform: 'apple', playlistId };
    }
    
    // Amazon Music playlist URL
    if (urlObj.hostname.includes('music.amazon.com') && urlObj.pathname.includes('/playlists/')) {
      const playlistId = urlObj.pathname.split('/playlists/')[1].split('?')[0];
      return { platform: 'amazon', playlistId };
    }
    
    throw new Error('Unsupported playlist URL format');
  }

  // Get playlist tracks from different platforms
  async getPlaylistTracks(platform, playlistId) {
    try {
      switch (platform) {
        case 'spotify':
          return await this.getSpotifyPlaylistTracks(playlistId);
        case 'apple':
          return await this.getAppleMusicPlaylistTracks(playlistId);
        case 'amazon':
          return await this.getAmazonMusicPlaylistTracks(playlistId);
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      console.error(`Error getting playlist tracks from ${platform}:`, error);
      throw error;
    }
  }

  // Get Spotify playlist tracks
  async getSpotifyPlaylistTracks(playlistId) {
    if (!this.spotifyApi) {
      throw new Error('Spotify API not initialized');
    }

    const response = await this.spotifyApi.getPlaylistTracks(playlistId);
    return response.body.items.map(item => ({
      name: item.track.name,
      artist: item.track.artists[0].name,
      album: item.track.album.name,
      uri: item.track.uri,
      platform: 'spotify'
    }));
  }

  // Get Apple Music playlist tracks
  async getAppleMusicPlaylistTracks(playlistId) {
    if (!this.appleMusicApi) {
      throw new Error('Apple Music API not initialized');
    }

    try {
      const playlist = await this.appleMusicApi.api.playlist(playlistId);
      const tracks = await this.appleMusicApi.api.playlist(playlistId, { include: 'tracks' });
      
      return tracks.data[0].relationships.tracks.data.map(track => ({
        name: track.attributes.name,
        artist: track.attributes.artistName,
        album: track.attributes.albumName,
        uri: track.id,
        platform: 'apple'
      }));
    } catch (error) {
      console.error('Apple Music API error:', error);
      throw new Error('Failed to fetch Apple Music playlist');
    }
  }

  // Get Amazon Music playlist tracks
  async getAmazonMusicPlaylistTracks(playlistId) {
    if (!this.amazonMusicApi) {
      throw new Error('Amazon Music API not initialized');
    }

    try {
      const response = await axios.get(`${this.amazonMusicApi.baseURL}/playlists/${playlistId}/tracks`, {
        headers: {
          'Authorization': `Bearer ${this.amazonMusicApi.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.tracks.map(track => ({
        name: track.name,
        artist: track.artist,
        album: track.album,
        uri: track.id,
        platform: 'amazon'
      }));
    } catch (error) {
      console.error('Amazon Music API error:', error);
      throw new Error('Failed to fetch Amazon Music playlist');
    }
  }

  // Search for tracks on Spotify
  async searchSpotifyTracks(tracks) {
    if (!this.spotifyApi) {
      throw new Error('Spotify API not initialized');
    }

    const foundTracks = [];
    
    for (const track of tracks) {
      try {
        const searchQuery = `${track.name} artist:${track.artist}`;
        const searchResult = await this.spotifyApi.searchTracks(searchQuery, { limit: 1 });
        
        if (searchResult.body.tracks.items.length > 0) {
          foundTracks.push(searchResult.body.tracks.items[0].uri);
        }
      } catch (error) {
        console.error(`Error searching for track: ${track.name}`, error);
      }
    }

    return foundTracks;
  }

  // Create playlist on Spotify
  async createSpotifyPlaylist(userId, playlistName, trackUris) {
    if (!this.spotifyApi) {
      throw new Error('Spotify API not initialized');
    }

    try {
      // Create playlist
      const playlist = await this.spotifyApi.createPlaylist(userId, playlistName, {
        description: 'Playlist imported using Fuzic',
        public: false
      });

      // Add tracks in batches (Spotify limit: 100 tracks per request)
      const batchSize = 100;
      for (let i = 0; i < trackUris.length; i += batchSize) {
        const batch = trackUris.slice(i, i + batchSize);
        await this.spotifyApi.addTracksToPlaylist(playlist.body.id, batch);
      }

      return {
        success: true,
        playlist: playlist.body,
        tracksAdded: trackUris.length
      };
    } catch (error) {
      console.error('Error creating Spotify playlist:', error);
      throw error;
    }
  }

  // Export playlist to Apple Music
  async exportToAppleMusic(playlistName, tracks) {
    if (!this.appleMusicApi) {
      throw new Error('Apple Music API not initialized');
    }

    try {
      // Create playlist
      const playlist = await this.appleMusicApi.api.createPlaylist({
        attributes: {
          name: playlistName,
          description: 'Playlist exported from Spotify using Fuzic'
        }
      });

      // Add tracks
      const trackIds = tracks.map(track => track.uri);
      await this.appleMusicApi.api.addToPlaylist(playlist.data[0].id, trackIds);

      return {
        success: true,
        playlist: playlist.data[0],
        tracksAdded: trackIds.length
      };
    } catch (error) {
      console.error('Error exporting to Apple Music:', error);
      throw error;
    }
  }

  // Export playlist to Amazon Music
  async exportToAmazonMusic(playlistName, tracks) {
    if (!this.amazonMusicApi) {
      throw new Error('Amazon Music API not initialized');
    }

    try {
      // Create playlist
      const createResponse = await axios.post(`${this.amazonMusicApi.baseURL}/playlists`, {
        name: playlistName,
        description: 'Playlist exported from Spotify using Fuzic'
      }, {
        headers: {
          'Authorization': `Bearer ${this.amazonMusicApi.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const playlistId = createResponse.data.id;

      // Add tracks
      const trackIds = tracks.map(track => track.uri);
      await axios.post(`${this.amazonMusicApi.baseURL}/playlists/${playlistId}/tracks`, {
        trackIds: trackIds
      }, {
        headers: {
          'Authorization': `Bearer ${this.amazonMusicApi.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        playlist: createResponse.data,
        tracksAdded: trackIds.length
      };
    } catch (error) {
      console.error('Error exporting to Amazon Music:', error);
      throw error;
    }
  }
}

module.exports = CrossPlatformService; 
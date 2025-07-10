# Fuzic 🎵

A powerful web application that helps you manage your music library across multiple platforms with advanced playlist management features.

## Features

### 🎯 Core Features
* **Convert Liked Songs to Playlist**: Transform your liked songs into organized playlists
* **Merge Playlists**: Combine multiple playlists while automatically removing duplicates
* **Remove Artist's Songs**: Remove all songs by specific artists from any playlist

### 🔄 Cross-Platform Features (NEW!)
* **Multi-Platform Authentication**: Connect to Spotify, Apple Music, and Amazon Music
* **Import Playlists**: Import playlists from Apple Music or Amazon Music to Spotify
* **Export Playlists**: Export your Spotify playlists to Apple Music or Amazon Music
* **Smart Track Matching**: Automatically find and match tracks across platforms

## Tech Stack

* **Backend**: Node.js, Express.js
* **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS
* **APIs**: Spotify Web API, Apple Music API, Amazon Music API
* **Deployment**: Vercel

## Setup Instructions

### 1. Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Spotify Developer Account
- Apple Music Developer Account (optional)
- Amazon Music Developer Account (optional)

### 2. Clone and Install
```bash
git clone https://github.com/sagnik47/fuzic-web-app.git
cd fuzic-web-app
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:

```env
# Spotify Configuration
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://your-domain.com/callback

# Apple Music Configuration (Optional)
APPLE_MUSIC_CLIENT_ID=your_apple_music_client_id
APPLE_MUSIC_CLIENT_SECRET=your_apple_music_client_secret
APPLE_MUSIC_DEVELOPER_TOKEN=your_apple_music_developer_token
APPLE_MUSIC_REDIRECT_URI=https://your-domain.com/apple-music-callback

# Amazon Music Configuration (Optional)
AMAZON_MUSIC_CLIENT_ID=your_amazon_music_client_id
AMAZON_MUSIC_CLIENT_SECRET=your_amazon_music_client_secret
AMAZON_MUSIC_REDIRECT_URI=https://your-domain.com/amazon-music-callback

# Environment
NODE_ENV=production
PORT=3000
```

### 4. API Setup

#### Spotify API Setup
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add your redirect URI: `https://your-domain.com/callback`
4. Copy Client ID and Client Secret to your `.env` file

#### Apple Music API Setup (Optional)
1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Create a MusicKit app
3. Generate a developer token
4. Add your redirect URI: `https://your-domain.com/apple-music-callback`
5. Copy credentials to your `.env` file

#### Amazon Music API Setup (Optional)
1. Go to [Amazon Developer Portal](https://developer.amazon.com)
2. Create a Music API app
3. Add your redirect URI: `https://your-domain.com/amazon-music-callback`
4. Copy credentials to your `.env` file

### 5. Development
```bash
npm run dev
```
The app will be available at `http://localhost:3000`

### 6. Production Deployment
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `GET /login` - Spotify OAuth login
- `GET /callback` - Spotify OAuth callback
- `GET /apple-music-login` - Apple Music OAuth login
- `GET /apple-music-callback` - Apple Music OAuth callback
- `GET /amazon-music-login` - Amazon Music OAuth login
- `GET /amazon-music-callback` - Amazon Music OAuth callback

### Playlist Management
- `GET /api/liked-songs` - Get user's liked songs
- `POST /api/convert-liked-to-playlist` - Convert liked songs to playlist
- `GET /api/playlists` - Get user's playlists
- `POST /api/merge-playlists` - Merge multiple playlists
- `POST /api/remove-artist-songs` - Remove artist's songs from playlist

### Cross-Platform Features
- `POST /api/import-playlist` - Import playlist from other platforms
- `POST /api/export-playlist` - Export playlist to other platforms

## Usage

### Basic Features
1. **Login with Spotify**: Click "Log In" to authenticate with Spotify
2. **Convert Liked Songs**: Create a playlist from your liked songs
3. **Merge Playlists**: Select multiple playlists to merge into one
4. **Remove Artist Songs**: Remove all songs by a specific artist

### Cross-Platform Features
1. **Connect Platforms**: Click "Connect Apple Music" or "Connect Amazon Music"
2. **Import Playlists**: Paste a playlist URL from Apple Music or Amazon Music
3. **Export Playlists**: Select a Spotify playlist and choose target platform

## Security Features

- Secure token storage with httpOnly cookies
- Automatic token refresh
- CORS protection
- State parameter validation for OAuth
- Environment-based security settings

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

1. **"Failed to convert liked songs to playlist"**
   - Check if you're logged in to Spotify
   - Verify your Spotify app has the correct permissions
   - Ensure your redirect URI is correctly configured

2. **Cross-platform features not working**
   - Make sure you've connected to the required platforms
   - Check if the platform APIs are properly configured
   - Verify your environment variables are set correctly

3. **Authentication issues**
   - Clear your browser cookies
   - Check if your redirect URIs match exactly
   - Verify your client IDs and secrets are correct

### Debug Mode
Enable debug logging by setting `NODE_ENV=development` in your `.env` file.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information

## Roadmap

- [ ] YouTube Music integration
- [ ] Deezer integration
- [ ] Playlist analytics
- [ ] Collaborative playlist features
- [ ] Mobile app version
- [ ] Advanced track matching algorithms

---

Built with ❤️ for music lovers everywhere

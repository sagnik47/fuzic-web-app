# Fuzic 🎵

A web application that helps you manage your Spotify music library with three powerful features:

- **Convert Liked Songs to Playlist**: Transform your liked songs into a custom playlist
- **Merge Playlists**: Combine multiple playlists into one, removing duplicates
- **Remove Artist's Songs**: Remove all songs by a specific artist from any playlist

## Features

### 🎯 Convert Liked Songs to Playlist
- Automatically creates a playlist from your liked songs
- Includes all your currently saved tracks
- Names the playlist with the current date for easy identification

### 🔄 Merge Playlists
- Select multiple playlists to merge
- Automatically removes duplicate tracks
- Creates a new playlist with all unique songs

### 🚫 Remove Artist's Songs
- Remove all songs by a specific artist from any playlist
- Case-insensitive artist name matching
- Bulk removal for efficient playlist cleanup

## Setup

### Prerequisites
- Node.js (v14 or higher)
- A Spotify Developer Account
- Spotify App credentials (Client ID and Client Secret)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fuzic-web-app.git
cd fuzic-web-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` file with your Spotify credentials:
```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### Getting Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://localhost:3000/callback` to your Redirect URIs
4. Copy your Client ID and Client Secret to the `.env` file

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and go to `http://localhost:3000`

3. Click "Log In" to authenticate with Spotify

4. Use the dashboard to access the three main features

## API Endpoints

- `GET /api/liked-songs` - Get user's liked songs
- `POST /api/convert-liked-to-playlist` - Convert liked songs to playlist
- `GET /api/playlists` - Get user's playlists
- `POST /api/merge-playlists` - Merge multiple playlists
- `POST /api/remove-artist-songs` - Remove artist's songs from playlist

## Technologies Used

- **Backend**: Node.js, Express.js
- **Spotify Integration**: spotify-web-api-node
- **Frontend**: HTML, CSS, JavaScript
- **Styling**: Tailwind CSS

## Project Structure

```
fuzic-web-app/
├── server.js              # Main server file
├── package.json          # Dependencies and scripts
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore rules
├── README.md            # This file
├── public/              # Static files
│   ├── index.html       # Landing page
│   ├── dashboard.html   # Main dashboard
│   └── styles/          # Compiled CSS
└── src/                 # Source files
    └── styles/          # Source stylesheets
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

Made with ❤️ for music lovers who want better playlist management!

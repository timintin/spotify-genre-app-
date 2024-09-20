const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8888;

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:8888/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables');
  process.exit(1);
}

app.get('/login', (req, res) => {
  const scope = 'playlist-modify-public playlist-modify-private user-read-playback-state user-modify-playback-state user-read-currently-playing streaming';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
    }));
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }), {
      headers: {
        'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token } = response.data;
    res.redirect(`http://localhost:3000?access_token=${access_token}&refresh_token=${refresh_token}`);
  } catch (error) {
    console.error('Error during authentication:', error.response ? error.response.data : error.message);
    res.status(500).send('Error during authentication');
  }
});

app.post('/create-playlist', async (req, res) => {
  const { accessToken, userId, name, tracks } = req.body;
  
  if (!accessToken || !userId || !name || !tracks || tracks.length === 0) {
    console.error('Invalid request data:', { userId, name, trackCount: tracks ? tracks.length : 0 });
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    console.log('Creating playlist:', { userId, name, trackCount: tracks.length });
    
    // Create a new playlist
    const createPlaylistResponse = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      name: name,
      public: false
    }, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const playlistId = createPlaylistResponse.data.id;
    console.log('Playlist created:', playlistId);

    // Add tracks to the playlist
    await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      uris: tracks
    }, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    console.log('Tracks added to playlist');
    res.json({ success: true, playlistId });
  } catch (error) {
    console.error('Error in /create-playlist:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to create playlist', details: error.response ? error.response.data : error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Client ID: ${CLIENT_ID}`);
});
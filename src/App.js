import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8888';

function App() {
  const [token, setToken] = useState('');
  const [tracks, setTracks] = useState([]);
  const [keptTracks, setKeptTracks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [offsets, setOffsets] = useState({});
  const [playlistName, setPlaylistName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyPlayingTrack, setCurrentlyPlayingTrack] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const error = params.get('error');
    
    if (error) {
      console.error('Authentication error:', error);
      setError(`Authentication error: ${error}`);
    } else if (accessToken) {
      setToken(accessToken);
      fetchUserProfile(accessToken);
    }
  }, []);

  const fetchUserProfile = async (accessToken) => {
    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      setUserId(response.data.id);
    } catch (error) {
      console.error('Error fetching user profile:', error.response ? error.response.data : error.message);
      setError('Failed to fetch user profile. Please try logging in again.');
    }
  };

  const fetchTracks = async (genre) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const currentOffset = offsets[genre] || 0;
      const response = await axios.get(`https://api.spotify.com/v1/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          seed_genres: getGenreSeed(genre),
          limit: 10,
          offset: currentOffset,
        }
      });
      setTracks(response.data.tracks);
      setOffsets(prev => ({ ...prev, [genre]: currentOffset + 10 }));
    } catch (error) {
      console.error('Error fetching tracks:', error.response ? error.response.data : error.message);
      setError('Failed to fetch tracks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getGenreSeed = (genre) => {
    switch(genre.toLowerCase()) {
      case 'rap': return 'hip-hop';
      case 'r&b': return 'r-n-b';
      default: return genre;
    }
  };

  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    fetchTracks(genre);
  };

  const resetSelections = () => {
    setSelectedGenre('');
    setTracks([]);
    setKeptTracks([]);
    setError(null);
    setOffsets({});
  };

  const keepTrack = (track) => {
    setKeptTracks(prev => [...prev, track]);
    setTracks(prev => prev.filter(t => t.id !== track.id));
  };

  const removeTrack = (trackId) => {
    setTracks(prev => prev.filter(track => track.id !== trackId));
    setKeptTracks(prev => prev.filter(track => track.id !== trackId));
  };

  const handleTrackClick = async (track) => {
    try {
      const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!devicesResponse.data.devices.length) {
        setError('No active Spotify devices found. Please open Spotify on any device and try again.');
        return;
      }

      const activeDevice = devicesResponse.data.devices.find(device => device.is_active) || devicesResponse.data.devices[0];

      const playerState = await axios.get('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!playerState.data || !playerState.data.is_playing) {
        await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${activeDevice.id}`, 
          { uris: [track.uri] },
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        setIsPlaying(true);
        setCurrentlyPlayingTrack(track);
      } else {
        await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(track.uri)}&device_id=${activeDevice.id}`,
          null,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      }
    } catch (error) {
      console.error('Error handling track click:', error.response ? error.response.data : error);
      if (error.response && error.response.status === 403) {
        setError('Unable to control playback. Make sure you have an active Spotify Premium account.');
      } else if (error.response && error.response.status === 404) {
        setError('No active device found. Please start playing Spotify on any device and try again.');
      } else {
        setError('Failed to play or queue the track. Please try again or refresh the page.');
      }
    }
  };

  const savePlaylist = async () => {
    if (!token || !userId || keptTracks.length === 0 || !playlistName.trim()) {
      setError('Please enter a playlist name and keep at least one track before saving.');
      return;
    }
    try {
      console.log('Attempting to save playlist:', { userId, playlistName, trackCount: keptTracks.length });
      const response = await axios.post(`${BACKEND_URL}/create-playlist`, {
        accessToken: token,
        userId,
        name: playlistName,
        tracks: keptTracks.map(track => track.uri)
      });
      console.log('Server response:', response.data);
      if (response.data.success) {
        alert('Playlist created successfully!');
        setPlaylistName('');
        setKeptTracks([]);
      } else {
        throw new Error('Server indicated failure');
      }
    } catch (error) {
      console.error('Error saving playlist:', error.response ? error.response.data : error.message);
      setError('Failed to save playlist. Please try again.');
    }
  };

  const getSpotifyLink = (track) => {
    const spotifyUri = track.uri;
    const webUrl = track.external_urls.spotify;
    return `spotify:${spotifyUri},${webUrl}`;
  };

  const genres = ['pop', 'hip-hop', 'jazz', 'rock', 'edm', 'country', 'k-pop', 'rap', 'r&b', 'acoustic'];

  return (
    <div className="App">
      <h1>Genre-Based Music Recommendation</h1>
      {error && <p className="error">{error}</p>}
      {!token ? (
        <a href={`${BACKEND_URL}/login`} id="login-button">Login with Spotify</a>
      ) : (
        <>
          <div className="genre-selection">
            <h2>Select a Genre:</h2>
            <div className="genre-buttons">
              {genres.map((genre) => (
                <button key={genre} onClick={() => handleGenreSelect(genre)} disabled={loading}>
                  {genre.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button onClick={resetSelections} className="start-over">Start Over</button>

          {loading && <p>Loading tracks...</p>}
          {isPlaying && currentlyPlayingTrack && (
            <p>Now Playing: {currentlyPlayingTrack.name} by {currentlyPlayingTrack.artists.map(artist => artist.name).join(', ')}</p>
          )}

          {!loading && !error && tracks.length > 0 && (
            <>
              <h2>Recommended Tracks for {selectedGenre} genre:</h2>
              <ul className="track-list">
                {tracks.map((track) => (
                  <li key={track.id}>
                    <a 
                      href={getSpotifyLink(track)} 
                      className="track-name"
                      onClick={(e) => {
                        e.preventDefault();
                        handleTrackClick(track);
                      }}
                    >
                      {track.name} by {track.artists.map(artist => artist.name).join(', ')}
                    </a>
                    <div className="track-buttons">
                      <button onClick={() => keepTrack(track)} className="keep-track">Keep</button>
                      <button onClick={() => removeTrack(track.id)} className="remove-track">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {keptTracks.length > 0 && (
            <>
              <h2>Kept Tracks:</h2>
              <ul className="track-list">
                {keptTracks.map((track) => (
                  <li key={track.id}>
                    <a 
                      href={getSpotifyLink(track)} 
                      className="track-name"
                      onClick={(e) => {
                        e.preventDefault();
                        handleTrackClick(track);
                      }}
                    >
                      {track.name} by {track.artists.map(artist => artist.name).join(', ')}
                    </a>
                    <button onClick={() => removeTrack(track.id)} className="remove-track">Remove</button>
                  </li>
                ))}
              </ul>
              <div className="playlist-form">
                <input
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="Enter playlist name"
                />
                <button onClick={savePlaylist} className="save-playlist">Save Playlist</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
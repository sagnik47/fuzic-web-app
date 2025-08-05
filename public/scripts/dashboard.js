// Dashboard JavaScript functionality for Fuzic web app

let userPlaylists = [];
let currentFeature = 'convert';

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
  checkAuthentication();
  loadUserInfo();
  loadPlaylists();
  
  // Check URL for specific feature
  const urlParams = new URLSearchParams(window.location.search);
  const feature = urlParams.get('feature');
  if (feature) {
    showFeature(feature);
  } else {
    showFeature('convert');
  }
});

// Check if user is authenticated
function checkAuthentication() {
  if (!document.cookie.includes('access_token')) {
    window.location.href = '/login';
    return;
  }
}

// Load user information
async function loadUserInfo() {
  try {
    const response = await fetch('/api/me', {
      credentials: 'include'
    });
    if (response.ok) {
      const userData = await response.json();
      document.getElementById('user-info').textContent = userData.display_name || 'User';
    } else {
      document.getElementById('user-info').textContent = 'User';
    }
  } catch (error) {
    console.error('Error loading user info:', error);
    document.getElementById('user-info').textContent = 'User';
  }
}

// Load user's playlists
async function loadPlaylists() {
  try {
    const response = await fetch('/api/playlists', {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      userPlaylists = data.items || [];
      populatePlaylistSelectors();
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load playlists');
    }
  } catch (error) {
    console.error('Error loading playlists:', error);
    showError(error.message || 'Failed to load playlists. Please try again.');
  }
}

// Populate playlist selectors
function populatePlaylistSelectors() {
  // Populate merge playlists checkboxes
  const playlistList = document.getElementById('playlist-list');
  playlistList.innerHTML = '';
  
  if (userPlaylists.length === 0) {
    playlistList.innerHTML = '<p class="text-white">No playlists found.</p>';
  } else {
    userPlaylists.forEach(playlist => {
      const checkbox = document.createElement('label');
      checkbox.className = 'flex items-center space-x-2 text-white cursor-pointer';
      checkbox.innerHTML = `
        <input type="checkbox" value="${playlist.id}" class="form-checkbox text-[#38e07b] bg-[#111714] border-[#38e07b]">
        <span>${playlist.name} (${playlist.tracks.total} tracks)</span>
      `;
      playlistList.appendChild(checkbox);
    });
  }
  
  // Populate remove artist playlist selector
  const removeSelect = document.getElementById('remove-playlist-select');
  removeSelect.innerHTML = '<option value="">Select a playlist...</option>';
  
  userPlaylists.forEach(playlist => {
    const option = document.createElement('option');
    option.value = playlist.id;
    option.textContent = `${playlist.name} (${playlist.tracks.total} tracks)`;
    removeSelect.appendChild(option);
  });
}

// Show specific feature
function showFeature(feature) {
  currentFeature = feature;
  
  // Hide all feature content
  document.querySelectorAll('.feature-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  // Remove .active from all dashboard buttons
  document.querySelectorAll('.dashboard-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected feature and highlight button
  const featureElement = document.getElementById(`${feature}-feature`);
  const buttonElement = document.getElementById(`${feature}-btn`);
  
  if (featureElement) {
    featureElement.classList.remove('hidden');
  }
  
  if (buttonElement) {
    buttonElement.classList.add('active');
  }
}

// Convert liked songs to playlist
async function convertLikedSongs() {
  const button = document.getElementById('convert-action-btn');
  const resultDiv = document.getElementById('convert-result');
  
  try {
    showLoading(button);
    resultDiv.innerHTML = '<p class="text-yellow-400">Creating playlist...</p>';
    
    const response = await fetch('/api/convert-liked-to-playlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (response.ok) {
      resultDiv.innerHTML = `
        <div class="text-green-400">
          <p class="font-bold">✅ Success!</p>
          <p>Created playlist: "${data.playlist.name}"</p>
          <p>Added ${data.tracksAdded} tracks</p>
          <a href="${data.playlist.external_urls.spotify}" target="_blank" class="text-[#38e07b] underline">View on Spotify</a>
        </div>
      `;
      // Reload playlists to include the new one
      setTimeout(loadPlaylists, 1000);
    } else {
      throw new Error(data.error || 'Failed to convert liked songs');
    }
  } catch (error) {
    console.error('Error converting liked songs:', error);
    resultDiv.innerHTML = `<p class="text-red-400">❌ Error: ${error.message}</p>`;
  } finally {
    hideLoading(button);
  }
}

// Merge playlists
async function mergePlaylists() {
  const button = document.getElementById('merge-action-btn');
  const resultDiv = document.getElementById('merge-result');
  const playlistName = document.getElementById('merge-playlist-name').value.trim();
  
  // Get selected playlists
  const selectedPlaylists = Array.from(document.querySelectorAll('#playlist-list input[type="checkbox"]:checked'))
    .map(checkbox => checkbox.value);
  
  if (!playlistName) {
    resultDiv.innerHTML = '<p class="text-red-400">❌ Please enter a playlist name</p>';
    return;
  }
  
  if (selectedPlaylists.length < 2) {
    resultDiv.innerHTML = '<p class="text-red-400">❌ Please select at least 2 playlists to merge</p>';
    return;
  }
  
  try {
    showLoading(button);
    resultDiv.innerHTML = '<p class="text-yellow-400">Merging playlists...</p>';
    
    const payload = {
      playlistIds: selectedPlaylists,
      newPlaylistName: playlistName
    };
    console.log('Sending merge request with payload:', payload);
    
    const response = await fetch('/api/merge-playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      resultDiv.innerHTML = `
        <div class="text-green-400">
          <p class="font-bold">✅ Success!</p>
          <p>Created merged playlist: "${data.playlist.name}"</p>
          <p>Added ${data.tracksAdded} unique tracks</p>
          <a href="${data.playlist.external_urls.spotify}" target="_blank" class="text-[#38e07b] underline">View on Spotify</a>
        </div>
      `;
      // Clear form
      document.getElementById('merge-playlist-name').value = '';
      document.querySelectorAll('#playlist-list input[type="checkbox"]').forEach(cb => cb.checked = false);
      // Reload playlists to include the new one
      setTimeout(loadPlaylists, 1000);
    } else {
      throw new Error(data.error || 'Failed to merge playlists');
    }
  } catch (error) {
    console.error('Error merging playlists:', error);
    resultDiv.innerHTML = `<p class="text-red-400">❌ Error: ${error.message}</p>`;
  } finally {
    hideLoading(button);
  }
}

// Remove artist's songs
async function removeArtistSongs() {
  const button = document.getElementById('remove-action-btn');
  const resultDiv = document.getElementById('remove-result');
  const playlistId = document.getElementById('remove-playlist-select').value;
  const artistName = document.getElementById('artist-name').value.trim();
  
  if (!playlistId) {
    resultDiv.innerHTML = '<p class="text-red-400">❌ Please select a playlist</p>';
    return;
  }
  
  if (!artistName) {
    resultDiv.innerHTML = '<p class="text-red-400">❌ Please enter an artist name</p>';
    return;
  }
  
  try {
    showLoading(button);
    resultDiv.innerHTML = '<p class="text-yellow-400">Removing songs...</p>';
    
    const response = await fetch('/api/remove-artist-songs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        playlistId: playlistId,
        artistName: artistName
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      if (data.tracksRemoved > 0) {
        resultDiv.innerHTML = `
          <div class="text-green-400">
            <p class="font-bold">✅ Success!</p>
            <p>Removed ${data.tracksRemoved} songs by "${artistName}"</p>
          </div>
        `;
      } else {
        resultDiv.innerHTML = `
          <div class="text-yellow-400">
            <p class="font-bold">ℹ️ No songs found</p>
            <p>No songs by "${artistName}" were found in the selected playlist</p>
          </div>
        `;
      }
      // Clear form
      document.getElementById('artist-name').value = '';
      // Reload playlists to show updated track counts
      setTimeout(loadPlaylists, 1000);
    } else {
      throw new Error(data.error || 'Failed to remove artist songs');
    }
  } catch (error) {
    console.error('Error removing artist songs:', error);
    resultDiv.innerHTML = `<p class="text-red-400">❌ Error: ${error.message}</p>`;
  } finally {
    hideLoading(button);
  }
}

// Logout function
async function logout() {
  try {
    await fetch('/api/logout', { 
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Error logging out:', error);
  } finally {
    window.location.href = '/';
  }
}

// Toggle user dropdown
function toggleUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('user-dropdown');
  const userSection = document.getElementById('user-profile-section');
  
  if (!userSection.contains(event.target)) {
    dropdown.classList.add('hidden');
  }
});

// Utility functions
function showLoading(button) {
  button.disabled = true;
  button.style.opacity = '0.7';
  const originalText = button.textContent;
  button.setAttribute('data-original-text', originalText);
  button.textContent = 'Loading...';
}

function hideLoading(button) {
  button.disabled = false;
  button.style.opacity = '1';
  const originalText = button.getAttribute('data-original-text');
  button.textContent = originalText;
  button.removeAttribute('data-original-text');
}

function showError(message) {
  // Remove any existing toast
  const existingToast = document.getElementById('fuzic-toast');
  if (existingToast) existingToast.remove();

  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'fuzic-toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '30px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'rgba(30,41,59,0.95)';
  toast.style.color = '#fff';
  toast.style.padding = '14px 28px';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '1rem';
  toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
  toast.style.zIndex = '9999';
  toast.style.opacity = '1';
  toast.style.transition = 'opacity 0.5s';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3500);
}

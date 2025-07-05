// Main JavaScript functionality for Fuzic web app

// Make functions globally available
window.handleFeatureClick = function(feature) {
  console.log('Feature clicked:', feature);
  
  // Add click animation
  const button = event.target.closest('button');
  if (button) {
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 150);
  }
  
  // Check if user is logged in (has access token)
  if (!isAuthenticated()) {
    // Redirect to login if not authenticated
    setTimeout(() => {
      alert('Please log in to use this feature.');
      window.location.href = '/login';
    }, 200);
    return;
  }
  
  // Redirect to dashboard with the specific feature
  setTimeout(() => {
    window.location.href = `/dashboard?feature=${feature}`;
  }, 300);
};

// Handle login button click
window.handleLoginClick = function() {
  console.log('Login button clicked');
  
  // Add click animation
  const button = event.target.closest('button');
  if (button) {
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
      window.location.href = '/login';
    }, 150);
  } else {
    window.location.href = '/login';
  }
};

// Make logout function globally available
window.logout = async function() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
  } catch (error) {
    console.error('Error logging out:', error);
    window.location.reload();
  }
};

// Handle navigation
document.addEventListener('DOMContentLoaded', function() {
  // Load user profile first
  loadUserProfile();
  
  // Handle About link
  const aboutLink = document.querySelector('a[href="#about"]');
  const aboutSection = document.querySelector('#about');
  const mainContent = document.querySelector('.layout-container > div:nth-child(2)');
  
  if (aboutLink && aboutSection) {
    aboutLink.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Toggle about section visibility
      if (aboutSection.classList.contains('hidden')) {
        aboutSection.classList.remove('hidden');
        mainContent.style.display = 'none';
        aboutLink.textContent = 'Home';
        aboutLink.setAttribute('href', '#');
      } else {
        aboutSection.classList.add('hidden');
        mainContent.style.display = 'flex';
        aboutLink.textContent = 'About';
        aboutLink.setAttribute('href', '#about');
      }
    });
  }
  
  // Handle Home link
  const homeLink = document.querySelector('a[href="#"]:not([href="#about"])');
  if (homeLink) {
    homeLink.addEventListener('click', function(e) {
      if (homeLink.textContent === 'Home' && !aboutSection.classList.contains('hidden')) {
        e.preventDefault();
        aboutSection.classList.add('hidden');
        mainContent.style.display = 'flex';
        aboutLink.textContent = 'About';
        aboutLink.setAttribute('href', '#about');
      }
    });
  }
});

// Utility function to check if user is authenticated
function isAuthenticated() {
  return document.cookie.includes('access_token');
}


// Load user profile and update UI
async function loadUserProfile() {
  if (!isAuthenticated()) {
    return;
  }
  
  try {
    const response = await fetch('/api/user');
    if (response.ok) {
      const user = await response.json();
      updateLoginButton(user);
    } else {
      console.log('User not authenticated');
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
  }
}

// Update login button to show user profile
function updateLoginButton(user) {
  const loginButton = document.querySelector('button[onclick="handleLoginClick()"]');
  if (loginButton && user) {
    // Create profile button
    const profileButton = document.createElement('div');
    profileButton.className = 'flex items-center gap-2 cursor-pointer';
    profileButton.innerHTML = `
      <img src="${user.images && user.images[0] ? user.images[0].url : '/default-avatar.png'}" 
           alt="${user.display_name}" 
           class="profile-image w-8 h-8 rounded-full border-2 border-[#38e07b]">
      <span class="text-white text-sm font-medium">${user.display_name}</span>
      <button onclick="logout()" 
              class="ml-2 text-xs text-[#38e07b] hover:text-white transition-colors">
        Logout
      </button>
    `;
    
    // Replace login button with profile
    loginButton.parentNode.replaceChild(profileButton, loginButton);
  }
}



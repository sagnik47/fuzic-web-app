// Main JavaScript functionality for Fuzic web app

// Simple utility function to check authentication
function isAuthenticated() {
  return document.cookie.includes('access_token');
}

// Simple feature button handler
function handleFeatureClick(feature) {
  console.log('Feature clicked:', feature);
  
  // Check if user is logged in
  if (!isAuthenticated()) {
    alert('Please log in to use this feature.');
    window.location.href = '/login';
    return;
  }
  
  // Redirect to dashboard with feature
  window.location.href = `/dashboard?feature=${feature}`;
}

// Simple login button handler
function handleLoginClick() {
  console.log('Login button clicked');
  window.location.href = '/login';
}

// Simple logout function
function logout() {
  fetch('/api/logout', { method: 'POST' })
    .then(() => window.location.reload())
    .catch(() => window.location.reload());
}

// Make all functions globally available
window.handleFeatureClick = handleFeatureClick;
window.handleLoginClick = handleLoginClick;
window.logout = logout;
window.isAuthenticated = isAuthenticated;

// Handle navigation when page loads
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded - JavaScript is working!');
  
  // Try to load user profile if authenticated
  if (isAuthenticated()) {
    loadUserProfile();
  }
  
  // Simple about link handler
  const aboutLink = document.querySelector('a[href="#about"]');
  const aboutSection = document.querySelector('#about');
  const mainContent = document.querySelector('.layout-container > div:nth-child(2)');
  
  if (aboutLink && aboutSection && mainContent) {
    aboutLink.addEventListener('click', function(e) {
      e.preventDefault();
      
      if (aboutSection.classList.contains('hidden')) {
        aboutSection.classList.remove('hidden');
        mainContent.style.display = 'none';
        aboutLink.textContent = 'Home';
      } else {
        aboutSection.classList.add('hidden');
        mainContent.style.display = 'flex';
        aboutLink.textContent = 'About';
      }
    });
  }
});

// Simple profile loading
function loadUserProfile() {
  if (!isAuthenticated()) {
    return;
  }
  
  fetch('/api/user')
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Not authenticated');
    })
    .then(user => {
      updateLoginButton(user);
    })
    .catch(error => {
      console.log('Error loading profile:', error);
    });
}

// Simple profile button update
function updateLoginButton(user) {
  const loginButton = document.querySelector('button[onclick="handleLoginClick()"]');
  if (loginButton && user && user.display_name) {
    const profileHTML = `
      <div class="flex items-center gap-2">
        <img src="${user.images && user.images[0] ? user.images[0].url : ''}" 
             alt="${user.display_name}" 
             class="w-8 h-8 rounded-full border-2 border-[#38e07b]" 
             style="display: ${user.images && user.images[0] ? 'block' : 'none'}">
        <span class="text-white text-sm font-medium">${user.display_name}</span>
        <button onclick="logout()" 
                class="ml-2 text-xs text-[#38e07b] hover:text-white">
          Logout
        </button>
      </div>
    `;
    loginButton.outerHTML = profileHTML;
  }
}



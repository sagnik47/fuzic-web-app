// Main JavaScript functionality for Fuzic web app

// Handle feature button clicks
function handleFeatureClick(feature) {
  // Check if user is logged in (has access token)
  if (!document.cookie.includes('access_token')) {
    // Redirect to login if not authenticated
    alert('Please log in to use this feature.');
    window.location.href = '/login';
    return;
  }
  
  // Redirect to dashboard with the specific feature
  window.location.href = `/dashboard?feature=${feature}`;
}

// Handle navigation
document.addEventListener('DOMContentLoaded', function() {
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

// Show loading state for buttons
function showLoading(button) {
  const originalText = button.querySelector('span').textContent;
  button.setAttribute('data-original-text', originalText);
  button.querySelector('span').textContent = 'Loading...';
  button.disabled = true;
  button.style.opacity = '0.7';
}

// Hide loading state for buttons
function hideLoading(button) {
  const originalText = button.getAttribute('data-original-text');
  button.querySelector('span').textContent = originalText;
  button.disabled = false;
  button.style.opacity = '1';
  button.removeAttribute('data-original-text');
}

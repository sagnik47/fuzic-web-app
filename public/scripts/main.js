// Fuzic Web App - Simple JavaScript
console.log('Loading Fuzic JavaScript...');

// LOGIN BUTTON FUNCTION
function handleLoginClick() {
  alert('Login button clicked! Redirecting to Spotify...');
  window.location.href = '/login';
}

// FEATURE BUTTON FUNCTION  
function handleFeatureClick(feature) {
  alert('Feature clicked: ' + feature + '. Checking login status...');
  
  // Simple cookie check
  if (document.cookie.indexOf('access_token') === -1) {
    alert('Please log in first!');
    window.location.href = '/login';
  } else {
    window.location.href = '/dashboard?feature=' + feature;
  }
}

// LOGOUT FUNCTION
function logout() {
  alert('Logging out...');
  fetch('/api/logout', { 
    method: 'POST',
    credentials: 'include'
  })
    .then(function() { window.location.reload(); })
    .catch(function() { window.location.reload(); });
}

// MAKE FUNCTIONS GLOBAL - CRITICAL!
window.handleLoginClick = handleLoginClick;
window.handleFeatureClick = handleFeatureClick; 
window.logout = logout;

console.log('JavaScript functions loaded!');
console.log('handleLoginClick:', typeof handleLoginClick);
console.log('handleFeatureClick:', typeof handleFeatureClick);

// Simple DOM ready handler
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded - Fuzic is ready!');
  
  // Test button accessibility
  setTimeout(function() {
    var loginBtn = document.querySelector('button[onclick*="handleLoginClick"]');
    var convertBtn = document.querySelector('button[onclick*="convert"]');
    
    console.log('Login button found:', !!loginBtn);
    console.log('Convert button found:', !!convertBtn);
    
    if (loginBtn) {
      console.log('Login button onclick:', loginBtn.getAttribute('onclick'));
    }
  }, 1000);
});

// About page navigation
function toggleAbout() {
  var aboutSection = document.getElementById('about');
  var mainContent = document.querySelector('.layout-container > div:nth-child(2)');
  var aboutLink = document.querySelector('a[href="#about"]');
  
  if (aboutSection && mainContent && aboutLink) {
    if (aboutSection.classList.contains('hidden')) {
      aboutSection.classList.remove('hidden');
      mainContent.style.display = 'none';
      aboutLink.textContent = 'Home';
    } else {
      aboutSection.classList.add('hidden');
      mainContent.style.display = 'flex';
      aboutLink.textContent = 'About';
    }
  }
}

window.toggleAbout = toggleAbout;



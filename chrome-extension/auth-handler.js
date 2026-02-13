/**
 * Authentication Handler for Chrome Extension
 * Handles Supabase sign in/up/out
 */

// Initialize auth state on load
let currentUser = null;

function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent('kbyg-auth-changed', {
    detail: { user: currentUser || null }
  }));
}

async function initAuth() {
  await supabase.initialize();
  currentUser = supabase.getUser();
  
  updateAuthUI();
  
  // Set up event listeners
  setupAuthListeners();
}

function updateAuthUI() {
  const signedInSection = document.getElementById('auth-signed-in');
  const signedOutSection = document.getElementById('auth-signed-out');
  
  if (currentUser) {
    // Show signed in state
    signedInSection.classList.remove('hidden');
    signedOutSection.classList.add('hidden');
    
    // Update user details
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-id').textContent = `User ID: ${currentUser.id.substring(0, 8)}...`;
    document.getElementById('sync-status-text').textContent = 'Synced';
    document.getElementById('sync-status-icon').textContent = '🟢';
  } else {
    // Show signed out state
    signedInSection.classList.add('hidden');
    signedOutSection.classList.remove('hidden');
  }

  notifyAuthChanged();
}

function setupAuthListeners() {
  // OAuth Sign In via web app - opens kbyg.ai auth page and extension picks up session
  const handleWebOAuth = async (provider, btnId, errorId) => {
    const btn = document.getElementById(btnId);
    const originalText = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<span>Opening kbyg.ai for sign in...</span>';
      
      console.log(`[Auth] Opening web app for ${provider} OAuth...`);
      
      const authUrl = provider === 'linkedin'
        ? 'https://kbyg.ai/auth?oauth=linkedin&source=extension'
        : 'https://kbyg.ai/auth?oauth=google&source=extension';

      // Open kbyg.ai auth in a new tab (callback happens on web, extension picks up resulting session)
      const authTab = await chrome.tabs.create({
        url: authUrl,
        active: true
      });
      
      console.log(`[Auth] Waiting for ${provider} authentication...`);
      
      // Poll for session from the web app's tab
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes
      
      const checkSession = setInterval(async () => {
        attempts++;
        
        try {
          // Check if the tab redirected away from /auth (sign in completed)
          const tab = await chrome.tabs.get(authTab.id);
          
          if (!tab.url.includes('/auth')) {
            // User signed in! Try to get session from the web app
            console.log(`[Auth] Tab redirected, fetching ${provider} session...`);
            
            // Execute script in the tab to get Supabase session from localStorage
            const results = await chrome.scripting.executeScript({
              target: { tabId: authTab.id },
              func: () => {
                // Get Supabase session from the web app's localStorage
                const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('-auth-token'));
                if (key) {
                  return localStorage.getItem(key);
                }
                return null;
              }
            });
            
            const sessionData = results?.[0]?.result;
            
            if (sessionData) {
              clearInterval(checkSession);
              
              // Parse and store session in extension
              const session = JSON.parse(sessionData);
              console.log('[Auth] Session retrieved:', session.user?.email);
              
              await supabase.saveSession(session);
              supabase.session = session;
              
              // Close the auth tab
              try {
                await chrome.tabs.remove(authTab.id);
              } catch (e) {
                // Tab might already be closed
              }
              
              currentUser = session.user;
              updateAuthUI();
              
              // Reinitialize backend API
              if (window.backendAPI) {
                await backendAPI.initialize();
              }
              
              btn.disabled = false;
              btn.innerHTML = originalText;
              showSuccess('Successfully signed in! Your data will now sync across devices.');
            }
          }
        } catch (e) {
          // Tab might be closed or navigated away
          if (e.message?.includes('No tab with id')) {
            clearInterval(checkSession);
            console.log('[Auth] Tab closed by user');
            showError(errorId, 'Sign in cancelled');
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkSession);
          console.log('[Auth] Authentication timeout');
          showError(errorId, 'Authentication timeout. Please try again.');
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }, 1000);
      
    } catch (err) {
      console.error('[Auth] Web app OAuth exception:', err);
      showError(errorId, 'Sign in error: ' + (err.message || 'Unknown error'));
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  };
  
  document.getElementById('google-signin-btn')?.addEventListener('click', () => 
    handleWebOAuth('google', 'google-signin-btn', 'signin-error')
  );
  
  document.getElementById('google-signup-btn')?.addEventListener('click', () => 
    handleWebOAuth('google', 'google-signup-btn', 'signup-error')
  );

  document.getElementById('linkedin-signin-btn')?.addEventListener('click', () => 
    handleWebOAuth('linkedin', 'linkedin-signin-btn', 'signin-error')
  );

  document.getElementById('linkedin-signup-btn')?.addEventListener('click', () => 
    handleWebOAuth('linkedin', 'linkedin-signup-btn', 'signup-error')
  );
  
  // Toggle between sign in and sign up forms
  document.getElementById('show-signin-btn')?.addEventListener('click', () => {
    document.getElementById('signin-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('show-signin-btn').classList.add('active');
    document.getElementById('show-signup-btn').classList.remove('active');
  });
  
  document.getElementById('show-signup-btn')?.addEventListener('click', () => {
    document.getElementById('signin-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('show-signin-btn').classList.remove('active');
    document.getElementById('show-signup-btn').classList.add('active');
  });
  
  // Sign in
  document.getElementById('signin-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    
    if (!email || !password) {
      showError('signin-error', 'Please enter email and password');
      return;
    }
    
    const btn = document.getElementById('signin-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    
    const { data, error } = await supabase.signInWithPassword(email, password);
    
    if (error) {
      showError('signin-error', error.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    } else {
      currentUser = data.user;
      updateAuthUI();
      
      // Clear form
      document.getElementById('signin-email').value = '';
      document.getElementById('signin-password').value = '';
      
      // Reinitialize backend API with new user ID
      if (window.backendAPI) {
        await backendAPI.initialize();
      }
      
      // Show success message
      showSuccess('Successfully signed in! Your data will now sync across devices.');
    }
  });
  
  // Sign up
  document.getElementById('signup-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-password-confirm').value;
    
    if (!email || !password) {
      showError('signup-error', 'Please enter email and password');
      return;
    }
    
    if (password !== confirmPassword) {
      showError('signup-error', 'Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      showError('signup-error', 'Password must be at least 6 characters');
      return;
    }
    
    const btn = document.getElementById('signup-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    
    const { data, error } = await supabase.signUp(email, password);
    
    if (error) {
      showError('signup-error', error.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    } else {
      currentUser = data.user;
      updateAuthUI();
      
      // Clear form
      document.getElementById('signup-email').value = '';
      document.getElementById('signup-password').value = '';
      document.getElementById('signup-password-confirm').value = '';
      
      // Reinitialize backend API with new user ID
      if (window.backendAPI) {
        await backendAPI.initialize();
      }
      
      // Show success message
      showSuccess('Account created! Your data will now sync across devices.');
    }
  });
  
  // Sign out
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    const confirmed = confirm('Are you sure you want to sign out? Your local data will remain, but will not sync until you sign in again.');
    
    if (!confirmed) return;
    
    await supabase.signOut();
    currentUser = null;
    updateAuthUI();
    
    // Reinitialize backend API with anonymous ID
    if (window.backendAPI) {
      await backendAPI.initialize();
    }
    
    showSuccess('Signed out successfully. You are now in anonymous mode.');
  });
}

function showError(elementId, message) {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => {
      errorEl.classList.add('hidden');
    }, 5000);
  }
}

function showSuccess(message) {
  // You can implement a toast notification here
  console.log('[Auth] Success:', message);
  alert(message); // Simple for now
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

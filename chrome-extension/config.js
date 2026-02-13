// KBYG Backend Configuration
const CONFIG = {
  // Backend API base URL - using Railway production endpoint for testing
  API_BASE_URL: 'https://unified-mcp-server-production.up.railway.app/api',
  
  // Bearer token for authentication (optional, set if backend requires it)
  BEARER_TOKEN: null, // Set this if MCP_BEARER_TOKEN is configured on backend
  
  // User ID (from Supabase auth or auto-generated)
  USER_ID: null,
};

/**
 * Get user ID from Supabase auth or generate anonymous ID
 * Priority: Supabase user ID > Anonymous ID
 */
async function getUserId() {
  // Check if user is authenticated with Supabase
  const session = await supabase.getStoredSession();
  
  if (session && session.user) {
    console.log('[Config] Using Supabase user ID:', session.user.id);
    return session.user.id;
  }
  
  // Fall back to anonymous user ID
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId'], (result) => {
      if (result.userId) {
        console.log('[Config] Using anonymous user ID:', result.userId);
        resolve(result.userId);
      } else {
        // Generate a unique user ID
        const newUserId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        chrome.storage.local.set({ userId: newUserId });
        console.log('[Config] Generated anonymous user ID:', newUserId);
        resolve(newUserId);
      }
    });
  });
}

/**
 * Get authentication token (Supabase access token if authenticated)
 */
async function getAuthToken() {
  const session = await supabase.getStoredSession();
  if (!session?.access_token) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = (() => {
    try {
      const parts = session.access_token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch (_) {
      return null;
    }
  })();

  const expiresAt = Number(session.expires_at || tokenPayload?.exp || 0);
  const willExpireSoon = expiresAt > 0 && expiresAt <= (now + 60);

  if (willExpireSoon && session.refresh_token) {
    try {
      supabase.session = session;
      const { data, error } = await supabase.refreshSession();
      if (!error && data?.access_token) {
        return data.access_token;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  return session.access_token;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, getUserId, getAuthToken };
}

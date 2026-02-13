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
  return session?.access_token || null;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, getUserId, getAuthToken };
}

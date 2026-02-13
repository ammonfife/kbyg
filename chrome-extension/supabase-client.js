/**
 * Supabase Client for Chrome Extension
 * Enables authentication and cross-device sync
 */

// Supabase configuration (from main app .env)
const SUPABASE_CONFIG = {
  url: 'https://etscbyzexyptgnppwyzv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c2NieXpleHlwdGducHB3eXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNzIyOTUsImV4cCI6MjA4NTY0ODI5NX0.sqGFlsQbMvqKmq2lyM2azCP16ns22hnrjTeqBBZngEE'
};

/**
 * Simple Supabase client for Chrome extensions
 * Uses chrome.storage for session persistence
 */
class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.session = null;
  }

  /**
   * Initialize and restore session from storage
   */
  async initialize() {
    const stored = await this.getStoredSession();
    if (stored) {
      this.session = stored;
      console.log('[Supabase] Session restored:', this.session.user.email);
    }
    return this.session;
  }

  /**
   * Sign in with email and password
   */
  async signInWithPassword(email, password) {
    try {
      const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Better error messages
        let errorMsg = 'Login failed';
        if (response.status === 400) {
          errorMsg = data.error_description || data.msg || 'Invalid email or password';
        } else if (response.status === 422) {
          errorMsg = 'Email not confirmed. Check your inbox.';
        }
        throw new Error(errorMsg);
      }

      this.session = data;
      await this.saveSession(data);
      
      console.log('[Supabase] Signed in:', data.user.email);
      return { data, error: null };
    } catch (error) {
      console.error('[Supabase] Sign in error:', error);
      return { data: null, error };
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    try {
      // Build OAuth URL
      const redirectUrl = chrome.identity.getRedirectURL();
      console.log('[Supabase] Extension redirect URL:', redirectUrl);
      
      const authUrl = `${this.url}/auth/v1/authorize?` + new URLSearchParams({
        provider: 'google',
        redirect_to: redirectUrl
      });
      
      console.log('[Supabase] OAuth URL:', authUrl);

      // Launch OAuth flow
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      // Extract tokens from redirect URL
      const params = new URL(responseUrl).hash.substring(1);
      const urlParams = new URLSearchParams(params);
      
      const accessToken = urlParams.get('access_token');
      const refreshToken = urlParams.get('refresh_token');

      if (!accessToken) {
        throw new Error('No access token received from Google');
      }

      // Get user info with token
      const userResponse = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': this.anonKey
        }
      });

      const user = await userResponse.json();

      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: user
      };

      this.session = session;
      await this.saveSession(session);
      
      console.log('[Supabase] Signed in with Google:', user.email);
      return { data: session, error: null };
    } catch (error) {
      console.error('[Supabase] Google sign in error:', error);
      return { data: null, error };
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(email, password) {
    try {
      const response = await fetch(`${this.url}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Better error messages for signup
        let errorMsg = 'Signup failed';
        if (response.status === 422) {
          errorMsg = data.msg || 'Email already registered';
        } else if (response.status === 400) {
          errorMsg = data.error_description || data.msg || 'Invalid email or password format';
        }
        throw new Error(errorMsg);
      }

      this.session = data;
      await this.saveSession(data);
      
      console.log('[Supabase] Signed up:', data.user.email);
      return { data, error: null };
    } catch (error) {
      console.error('[Supabase] Sign up error:', error);
      return { data: null, error };
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    try {
      if (this.session?.access_token) {
        await fetch(`${this.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'apikey': this.anonKey
          }
        });
      }
    } catch (error) {
      console.error('[Supabase] Sign out error:', error);
    }

    this.session = null;
    await chrome.storage.local.remove(['supabaseSession']);
    console.log('[Supabase] Signed out');
  }

  /**
   * Get current session
   */
  getSession() {
    return this.session;
  }

  /**
   * Get current user
   */
  getUser() {
    return this.session?.user || null;
  }

  /**
   * Get access token for API calls
   */
  getAccessToken() {
    return this.session?.access_token || null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.session?.user;
  }

  /**
   * Save session to Chrome storage
   */
  async saveSession(session) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ supabaseSession: session }, resolve);
    });
  }

  /**
   * Get stored session from Chrome storage
   */
  async getStoredSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['supabaseSession'], (result) => {
        resolve(result.supabaseSession || null);
      });
    });
  }

  /**
   * Refresh access token
   */
  async refreshSession() {
    if (!this.session?.refresh_token) {
      return { data: null, error: new Error('No refresh token') };
    }

    try {
      const response = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({
          refresh_token: this.session.refresh_token
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || 'Token refresh failed');
      }

      this.session = data;
      await this.saveSession(data);
      
      console.log('[Supabase] Session refreshed');
      return { data, error: null };
    } catch (error) {
      console.error('[Supabase] Refresh error:', error);
      return { data: null, error };
    }
  }
}

// Create global instance
const supabase = new SupabaseClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { supabase, SupabaseClient };
}

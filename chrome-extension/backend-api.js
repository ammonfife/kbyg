/**
 * KBYG Backend API Client
 * Handles all communication with the backend command center
 */

class BackendAPI {
  constructor(baseUrl, bearerToken = null) {
    this.baseUrl = baseUrl;
    this.bearerToken = bearerToken;
    this.userId = null;
  }

  /**
   * Initialize the API client (call on startup)
   */
  async initialize() {
    this.userId = await getUserId();
    this.authToken = await getAuthToken();
    
    if (this.authToken) {
      console.log('[KBYG Backend] Initialized with authenticated user:', this.userId);
    } else {
      console.log('[KBYG Backend] Initialized with anonymous user:', this.userId);
    }
  }

  /**
   * Get headers for API requests
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Priority: Supabase auth token > Bearer token
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    return headers;
  }

  /**
   * Save event analysis to backend
   * @param {Object} eventData - Event data from Gemini analysis
   * @returns {Promise<Object>} - Result with eventId
   */
  async saveEvent(eventData) {
    try {
      const response = await fetch(`${this.baseUrl}/events`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(eventData),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save event');
      }

      console.log('[KBYG Backend] Event saved:', result.eventId);
      return result;
    } catch (error) {
      console.error('[KBYG Backend] Error saving event:', error);
      throw error;
    }
  }

  /**
   * Get all events for the current user
   * @param {Object} options - Query options (limit, offset, startDate, endDate)
   * @returns {Promise<Array>} - Array of events
   */
  async getEvents(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit);
      if (options.offset) params.append('offset', options.offset);
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);

      const url = `${this.baseUrl}/events?${params.toString()}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load events');
      }

      console.log('[KBYG Backend] Loaded', result.events.length, 'events');
      return result.events;
    } catch (error) {
      console.error('[KBYG Backend] Error loading events:', error);
      throw error;
    }
  }

  /**
   * Get a specific event by URL
   * @param {string} url - Event URL
   * @returns {Promise<Object|null>} - Event data or null if not found
   */
  async getEvent(url) {
    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`${this.baseUrl}/events/${encodedUrl}`, {
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        return null; // Event not found
      }

      return result.event;
    } catch (error) {
      console.error('[KBYG Backend] Error getting event:', error);
      return null;
    }
  }

  /**
   * Delete an event
   * @param {string} url - Event URL
   * @returns {Promise<Object>} - Result
   */
  async deleteEvent(url) {
    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`${this.baseUrl}/events/${encodedUrl}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete event');
      }

      console.log('[KBYG Backend] Event deleted');
      return result;
    } catch (error) {
      console.error('[KBYG Backend] Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Save user profile to backend
   * @param {Object} profile - User profile data
   * @returns {Promise<Object>} - Result
   */
  async saveProfile(profile) {
    try {
      const response = await fetch(`${this.baseUrl}/profile`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(profile),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save profile');
      }

      console.log('[KBYG Backend] Profile saved');
      return result;
    } catch (error) {
      console.error('[KBYG Backend] Error saving profile:', error);
      throw error;
    }
  }

  /**
   * Get user profile from backend
   * @returns {Promise<Object|null>} - User profile or null
   */
  async getProfile() {
    try {
      const response = await fetch(`${this.baseUrl}/profile`, {
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        return null; // Profile not found
      }

      return result.profile;
    } catch (error) {
      console.error('[KBYG Backend] Error getting profile:', error);
      return null;
    }
  }

  /**
   * Search for people across all events
   * @param {string} query - Search query
   * @returns {Promise<Array>} - Array of people
   */
  async searchPeople(query) {
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`${this.baseUrl}/people/search?${params.toString()}`, {
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to search people');
      }

      return result.people;
    } catch (error) {
      console.error('[KBYG Backend] Error searching people:', error);
      throw error;
    }
  }

  /**
   * Get analytics summary
   * @returns {Promise<Object>} - Analytics data
   */
  async getAnalyticsSummary() {
    try {
      const response = await fetch(`${this.baseUrl}/analytics/summary`, {
        headers: this.getHeaders(),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get analytics');
      }

      return result.summary;
    } catch (error) {
      console.error('[KBYG Backend] Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Bulk import events
   * @param {Array} events - Array of event data objects
   * @returns {Promise<Object>} - Import results
   */
  async bulkImport(events) {
    try {
      const response = await fetch(`${this.baseUrl}/events/bulk`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ events }),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to bulk import events');
      }

      console.log('[KBYG Backend] Bulk import:', result.message);
      return result;
    } catch (error) {
      console.error('[KBYG Backend] Error bulk importing:', error);
      throw error;
    }
  }
}

// Create global instance
const backendAPI = new BackendAPI(CONFIG.API_BASE_URL, CONFIG.BEARER_TOKEN);

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BackendAPI, backendAPI };
}

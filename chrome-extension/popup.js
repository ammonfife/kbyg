// DOM Elements
const setupSection = document.getElementById('setup-section');
const mainSection = document.getElementById('main-section');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const updateKeyInput = document.getElementById('update-key-input');
const updateKeyBtn = document.getElementById('update-key-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');
const errorDiv = document.getElementById('error');
const retryBtn = document.getElementById('retry-btn');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  const apiKey = await getApiKey();
  if (apiKey) {
    showMainSection();
  } else {
    showSetupSection();
  }
});

// API Key Management
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || null);
    });
  });
}

async function saveApiKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      resolve();
    });
  });
}

// UI State Management
function showSetupSection() {
  setupSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
}

function showMainSection() {
  setupSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

function showLoading() {
  loadingDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');
  analyzeBtn.disabled = true;
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
  analyzeBtn.disabled = false;
}

function showResults(data) {
  hideLoading();
  resultsDiv.classList.remove('hidden');
  renderResults(data);
}

function showError(message) {
  hideLoading();
  errorDiv.classList.remove('hidden');
  errorDiv.querySelector('.error-message').textContent = message;
}

// Event Listeners
saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert('Please enter an API key');
    return;
  }
  await saveApiKey(key);
  showMainSection();
});

analyzeBtn.addEventListener('click', async () => {
  showLoading();
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Extract page content via content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
    
    if (!response || !response.content) {
      throw new Error('Could not extract page content. Make sure you\'re on an event page.');
    }
    
    // Send to background for API processing
    const result = await chrome.runtime.sendMessage({
      action: 'analyzeEvent',
      content: response.content,
      url: tab.url,
      title: tab.title
    });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    showResults(result.data);
  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message || 'Failed to analyze event. Please try again.');
  }
});

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  updateKeyInput.value = '';
});

updateKeyBtn.addEventListener('click', async () => {
  const key = updateKeyInput.value.trim();
  if (!key) {
    alert('Please enter an API key');
    return;
  }
  await saveApiKey(key);
  settingsModal.classList.add('hidden');
  updateKeyInput.value = '';
  alert('API key updated successfully');
});

retryBtn.addEventListener('click', () => {
  analyzeBtn.click();
});

// Render Results
function renderResults(data) {
  // Event Overview
  const overviewHtml = `
    <div class="event-detail">
      <span class="label">Event:</span>
      <span class="value">${escapeHtml(data.eventName || 'Unknown')}</span>
    </div>
    <div class="event-detail">
      <span class="label">Date:</span>
      <span class="value">${escapeHtml(data.date || 'Not found')}</span>
    </div>
    <div class="event-detail">
      <span class="label">Location:</span>
      <span class="value">${escapeHtml(data.location || 'Not found')}</span>
    </div>
    ${data.description ? `
    <div class="event-detail">
      <span class="label">About:</span>
      <span class="value">${escapeHtml(data.description)}</span>
    </div>
    ` : ''}
  `;
  document.getElementById('event-overview').innerHTML = overviewHtml;

  // Speakers
  const speakersContainer = document.getElementById('speakers-list');
  if (data.speakers && data.speakers.length > 0) {
    speakersContainer.innerHTML = data.speakers.map(speaker => `
      <div class="person-item">
        <div class="person-avatar">${getInitials(speaker.name)}</div>
        <div class="person-info">
          <div class="person-name">${escapeHtml(speaker.name)}</div>
          ${speaker.title ? `<div class="person-title">${escapeHtml(speaker.title)}</div>` : ''}
          ${speaker.company ? `<div class="person-company">${escapeHtml(speaker.company)}</div>` : ''}
        </div>
      </div>
    `).join('');
  } else {
    speakersContainer.innerHTML = '<p class="empty-state">No speakers found</p>';
  }

  // Sponsors
  const sponsorsContainer = document.getElementById('sponsors-list');
  if (data.sponsors && data.sponsors.length > 0) {
    sponsorsContainer.innerHTML = data.sponsors.map(sponsor => `
      <div class="sponsor-item">
        <div class="person-avatar">🏢</div>
        <div class="person-info">
          <div class="person-name">${escapeHtml(sponsor.name)}</div>
          ${sponsor.tier ? `<div class="person-title">${escapeHtml(sponsor.tier)} Sponsor</div>` : ''}
        </div>
      </div>
    `).join('');
  } else {
    sponsorsContainer.innerHTML = '<p class="empty-state">No sponsors found</p>';
  }

  // GTM Insights
  const insightsContainer = document.getElementById('gtm-insights');
  if (data.gtmInsights) {
    const insights = data.gtmInsights;
    insightsContainer.innerHTML = `
      ${insights.targetAccounts ? `
      <div class="insight-item">
        <div class="insight-label">🎯 Potential Target Accounts</div>
        <div class="insight-value">${escapeHtml(insights.targetAccounts)}</div>
      </div>
      ` : ''}
      ${insights.competitorPresence ? `
      <div class="insight-item">
        <div class="insight-label">⚔️ Competitor Presence</div>
        <div class="insight-value">${escapeHtml(insights.competitorPresence)}</div>
      </div>
      ` : ''}
      ${insights.keyPersonas ? `
      <div class="insight-item">
        <div class="insight-label">👥 Key Personas</div>
        <div class="insight-value">${escapeHtml(insights.keyPersonas)}</div>
      </div>
      ` : ''}
      ${insights.talkingPoints ? `
      <div class="insight-item">
        <div class="insight-label">💬 Suggested Talking Points</div>
        <div class="insight-value">${escapeHtml(insights.talkingPoints)}</div>
      </div>
      ` : ''}
      ${insights.recommendations ? `
      <div class="insight-item">
        <div class="insight-label">✅ Recommendations</div>
        <div class="insight-value">${escapeHtml(insights.recommendations)}</div>
      </div>
      ` : ''}
    `;
  } else {
    insightsContainer.innerHTML = '<p class="empty-state">No insights available</p>';
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ').filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

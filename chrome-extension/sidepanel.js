// DOM Elements - Onboarding
const onboardingApi = document.getElementById('onboarding-api');
const onboardingCompany = document.getElementById('onboarding-company');
const onboardingGoals = document.getElementById('onboarding-goals');
const mainSection = document.getElementById('main-section');

// Onboarding buttons
const onboardingApiNext = document.getElementById('onboarding-api-next');
const onboardingCompanyBack = document.getElementById('onboarding-company-back');
const onboardingCompanyNext = document.getElementById('onboarding-company-next');
const onboardingGoalsBack = document.getElementById('onboarding-goals-back');
const onboardingGoalsFinish = document.getElementById('onboarding-goals-finish');
const importProfileBtn = document.getElementById('import-profile-btn');
const importFileInput = document.getElementById('import-file-input');

// Main section elements
const analyzeBtn = document.getElementById('analyze-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsSection = document.getElementById('settings-section');
const settingsBackBtn = document.getElementById('settings-back-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const exportSettingsBtn = document.getElementById('export-settings-btn');
const importSettingsBtn = document.getElementById('import-settings-btn');
const settingsImportFile = document.getElementById('settings-import-file');
const resetExtensionBtn = document.getElementById('reset-extension-btn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');
const errorDiv = document.getElementById('error');
const emptyState = document.getElementById('empty-state');
const retryBtn = document.getElementById('retry-btn');
const copyBtn = document.getElementById('copy-btn');
const csvBtn = document.getElementById('csv-btn');
const reanalyzeBtn = document.getElementById('reanalyze-btn');
const currentUrlSpan = document.getElementById('current-url');
const exportAllBtn = document.getElementById('export-all-btn');
const viewTargetsBtn = document.getElementById('view-targets-btn');

// Store current analysis data for copying
let currentAnalysisData = null;
let userProfile = null;
let currentFilter = 'all';

// Default profile structure
const defaultProfile = {
  geminiApiKey: '',
  companyName: '',
  yourRole: '',
  product: '',
  valueProp: '',
  targetPersonas: '',
  targetIndustries: '',
  competitors: '',
  dealSize: '',
  conversionRate: '',
  oppWinRate: '',
  eventGoal: '',
  notes: '',
  onboardingComplete: false
};

// Initialize side panel
document.addEventListener('DOMContentLoaded', async () => {
  userProfile = await loadProfile();
  
  if (userProfile.onboardingComplete && userProfile.geminiApiKey) {
    showMainSection();
    updateCurrentUrl();
  } else {
    showOnboardingStep(1);
  }
});

// Profile Management
async function loadProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userProfile'], (result) => {
      resolve({ ...defaultProfile, ...(result.userProfile || {}) });
    });
  });
}

async function saveProfile(profile) {
  userProfile = profile;
  return new Promise((resolve) => {
    chrome.storage.local.set({ userProfile: profile }, resolve);
  });
}

// Onboarding Navigation
function showOnboardingStep(step) {
  onboardingApi.classList.add('hidden');
  onboardingCompany.classList.add('hidden');
  onboardingGoals.classList.add('hidden');
  mainSection.classList.add('hidden');
  
  if (step === 1) {
    onboardingApi.classList.remove('hidden');
    document.getElementById('api-key-input').value = userProfile.geminiApiKey || '';
  } else if (step === 2) {
    onboardingCompany.classList.remove('hidden');
    document.getElementById('ob-company-name').value = userProfile.companyName || '';
    document.getElementById('ob-your-role').value = userProfile.yourRole || '';
    document.getElementById('ob-product').value = userProfile.product || '';
    document.getElementById('ob-value-prop').value = userProfile.valueProp || '';
  } else if (step === 3) {
    onboardingGoals.classList.remove('hidden');
    document.getElementById('ob-target-personas').value = userProfile.targetPersonas || '';
    document.getElementById('ob-target-industries').value = userProfile.targetIndustries || '';
    document.getElementById('ob-competitors').value = userProfile.competitors || '';
    document.getElementById('ob-deal-size').value = userProfile.dealSize || '';
    document.getElementById('ob-conversion-rate').value = userProfile.conversionRate || '';
    document.getElementById('ob-opp-win-rate').value = userProfile.oppWinRate || '';
    document.getElementById('ob-event-goal').value = userProfile.eventGoal || '';
    document.getElementById('ob-notes').value = userProfile.notes || '';
  }
}

function showMainSection() {
  onboardingApi.classList.add('hidden');
  onboardingCompany.classList.add('hidden');
  onboardingGoals.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

// Onboarding Event Listeners
onboardingApiNext.addEventListener('click', async () => {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) {
    showToast('Please enter your API key');
    return;
  }
  userProfile.geminiApiKey = apiKey;
  await saveProfile(userProfile);
  showOnboardingStep(2);
});

onboardingCompanyBack.addEventListener('click', () => showOnboardingStep(1));

onboardingCompanyNext.addEventListener('click', async () => {
  const companyName = document.getElementById('ob-company-name').value.trim();
  if (!companyName) {
    showToast('Please enter your company name');
    return;
  }
  userProfile.companyName = companyName;
  userProfile.yourRole = document.getElementById('ob-your-role').value.trim();
  userProfile.product = document.getElementById('ob-product').value.trim();
  userProfile.valueProp = document.getElementById('ob-value-prop').value.trim();
  await saveProfile(userProfile);
  showOnboardingStep(3);
});

onboardingGoalsBack.addEventListener('click', () => showOnboardingStep(2));

onboardingGoalsFinish.addEventListener('click', async () => {
  userProfile.targetPersonas = document.getElementById('ob-target-personas').value.trim();
  userProfile.targetIndustries = document.getElementById('ob-target-industries').value.trim();
  userProfile.competitors = document.getElementById('ob-competitors').value.trim();
  userProfile.dealSize = document.getElementById('ob-deal-size').value.trim();
  userProfile.conversionRate = document.getElementById('ob-conversion-rate').value.trim();
  userProfile.oppWinRate = document.getElementById('ob-opp-win-rate').value.trim();
  userProfile.eventGoal = document.getElementById('ob-event-goal').value.trim();
  userProfile.notes = document.getElementById('ob-notes').value.trim();
  userProfile.onboardingComplete = true;
  await saveProfile(userProfile);
  showToast('Setup complete!');
  showMainSection();
  updateCurrentUrl();
});

// Import/Export Profile
importProfileBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', handleImportProfile);

async function handleImportProfile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    // Validate it has the expected structure
    if (typeof imported !== 'object') {
      throw new Error('Invalid profile format');
    }
    
    // Merge with defaults to ensure all fields exist
    userProfile = { ...defaultProfile, ...imported, onboardingComplete: true };
    await saveProfile(userProfile);
    showToast('Profile imported successfully!');
    showMainSection();
    updateCurrentUrl();
  } catch (err) {
    showToast('Failed to import: Invalid file format');
  }
  
  e.target.value = ''; // Reset file input
}

// Settings Section
settingsBtn.addEventListener('click', () => {
  populateSettingsModal();
  mainSection.classList.add('hidden');
  settingsSection.classList.remove('hidden');
});

settingsBackBtn.addEventListener('click', () => {
  settingsSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
});

function populateSettingsModal() {
  document.getElementById('set-company-name').value = userProfile.companyName || '';
  document.getElementById('set-your-role').value = userProfile.yourRole || '';
  document.getElementById('set-product').value = userProfile.product || '';
  document.getElementById('set-value-prop').value = userProfile.valueProp || '';
  document.getElementById('set-target-personas').value = userProfile.targetPersonas || '';
  document.getElementById('set-target-industries').value = userProfile.targetIndustries || '';
  document.getElementById('set-competitors').value = userProfile.competitors || '';
  document.getElementById('set-deal-size').value = userProfile.dealSize || '';
  document.getElementById('set-conversion-rate').value = userProfile.conversionRate || '';
  document.getElementById('set-opp-win-rate').value = userProfile.oppWinRate || '';
  document.getElementById('set-event-goal').value = userProfile.eventGoal || '';
  document.getElementById('set-notes').value = userProfile.notes || '';
  document.getElementById('set-api-key').value = userProfile.geminiApiKey || '';
}

saveSettingsBtn.addEventListener('click', async () => {
  userProfile.companyName = document.getElementById('set-company-name').value.trim();
  userProfile.yourRole = document.getElementById('set-your-role').value.trim();
  userProfile.product = document.getElementById('set-product').value.trim();
  userProfile.valueProp = document.getElementById('set-value-prop').value.trim();
  userProfile.targetPersonas = document.getElementById('set-target-personas').value.trim();
  userProfile.targetIndustries = document.getElementById('set-target-industries').value.trim();
  userProfile.competitors = document.getElementById('set-competitors').value.trim();
  userProfile.dealSize = document.getElementById('set-deal-size').value.trim();
  userProfile.conversionRate = document.getElementById('set-conversion-rate').value.trim();
  userProfile.oppWinRate = document.getElementById('set-opp-win-rate').value.trim();
  userProfile.eventGoal = document.getElementById('set-event-goal').value.trim();
  userProfile.notes = document.getElementById('set-notes').value.trim();
  
  const newApiKey = document.getElementById('set-api-key').value.trim();
  if (newApiKey) {
    userProfile.geminiApiKey = newApiKey;
  }
  
  await saveProfile(userProfile);
  settingsSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  showToast('Settings saved!');
});

// Settings Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// Export/Import in Settings
exportSettingsBtn.addEventListener('click', () => {
  const exportData = { ...userProfile };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `conference-intel-profile-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Settings exported!');
});

importSettingsBtn.addEventListener('click', () => settingsImportFile.click());
settingsImportFile.addEventListener('change', async (e) => {
  await handleImportProfile(e);
  populateSettingsModal();
});

// Reset Extension
if (resetExtensionBtn) {
  resetExtensionBtn.addEventListener('click', async () => {
    if (confirm('Reset the extension? This will clear all settings and show the onboarding flow.')) {
      await chrome.storage.local.clear();
      userProfile = { ...defaultProfile };
      currentAnalysisData = null;
      currentFilter = 'all';
      
      // Hide all sections and show onboarding
      settingsSection.classList.add('hidden');
      mainSection.classList.add('hidden');
      onboardingApi.classList.remove('hidden');
      onboardingCompany.classList.add('hidden');
      onboardingGoals.classList.add('hidden');
      
      // Reset onboarding progress indicators
      document.querySelectorAll('.progress-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i === 0) step.classList.add('active');
      });
      document.querySelectorAll('.progress-line').forEach(line => {
        line.classList.remove('completed');
      });
      
      // Clear form fields
      document.getElementById('api-key').value = '';
      
      showToast('Extension reset!');
    }
  });
}

// Listen for tab changes to update current URL
chrome.tabs.onActivated.addListener(() => updateCurrentUrl());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) updateCurrentUrl();
});

async function updateCurrentUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentUrlSpan.textContent = url.hostname + url.pathname;
    }
  } catch (e) {
    currentUrlSpan.textContent = 'Unable to get URL';
  }
}

// UI State Management
function showLoading() {
  loadingDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');
  emptyState.classList.add('hidden');
  analyzeBtn.disabled = true;
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
  analyzeBtn.disabled = false;
}

async function showResults(data) {
  hideLoading();
  resultsDiv.classList.remove('hidden');
  emptyState.classList.add('hidden');
  currentAnalysisData = data;
  renderResults(data);
  
  // Auto-save to MCP server in background
  try {
    const saveResult = await autoSaveAnalysis(data, userProfile);
    if (saveResult.saved) {
      console.log('✅ Analysis auto-saved to MCP server:', saveResult);
      showToast(`💾 Saved ${saveResult.companies.length} companies to database`);
    } else {
      console.warn('⚠️ Could not save to MCP server:', saveResult.reason);
    }
  } catch (error) {
    console.error('Failed to auto-save analysis:', error);
    // Don't show error to user - this is background operation
  }
}

function showError(message) {
  hideLoading();
  errorDiv.classList.remove('hidden');
  emptyState.classList.add('hidden');
  errorDiv.querySelector('.error-message').textContent = message;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Analysis
analyzeBtn.addEventListener('click', runAnalysis);
reanalyzeBtn.addEventListener('click', runAnalysis);
retryBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  showLoading();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
    } catch (e) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(r => setTimeout(r, 100));
      response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
    }
    
    if (!response || !response.content) {
      throw new Error('Could not extract page content. Make sure you\'re on an event page.');
    }
    
    const result = await chrome.runtime.sendMessage({
      action: 'analyzeEvent',
      content: response.content,
      url: tab.url,
      title: tab.title,
      userProfile: userProfile
    });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    showResults(result.data);
  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message || 'Failed to analyze event. Please try again.');
  }
}

// Copy and CSV
copyBtn.addEventListener('click', () => {
  if (!currentAnalysisData) return;
  
  const summary = generateTextSummary(currentAnalysisData);
  navigator.clipboard.writeText(summary).then(() => {
    showToast('Summary copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy');
  });
});

csvBtn.addEventListener('click', () => {
  if (!currentAnalysisData) return;
  downloadCSV(currentAnalysisData, currentFilter);
});

// Export All and View Targets buttons
if (exportAllBtn) {
  exportAllBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    downloadCSV(currentAnalysisData, 'all');
  });
}

if (viewTargetsBtn) {
  viewTargetsBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    currentFilter = 'targets';
    updateFilterButtons();
    const people = currentAnalysisData.people || currentAnalysisData.speakers || [];
    renderPeopleList(currentAnalysisData, people, currentFilter);
    // Scroll to people section
    document.getElementById('people-list')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// Filter buttons for people list
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    currentFilter = btn.dataset.filter;
    updateFilterButtons();
    const people = currentAnalysisData.people || currentAnalysisData.speakers || [];
    renderPeopleList(currentAnalysisData, people, currentFilter);
  });
});

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });
}

// Generate and download CSV
function downloadCSV(data, filterType = 'all') {
  const rows = [];
  
  rows.push(['Role', 'Persona', 'Name', 'Title', 'Company', 'LinkedIn', 'Event', 'Date', 'Location']);
  
  let people = data.people || data.speakers || [];
  
  // Apply filter
  if (filterType === 'targets') {
    people = people.filter(p => isTargetPersona(p));
  } else if (filterType === 'speakers') {
    people = people.filter(p => p.role && p.role.toLowerCase().includes('speaker'));
  }
  
  if (people.length > 0) {
    people.forEach(person => {
      rows.push([
        person.role || 'Unknown',
        person.persona || '',
        person.name || '',
        person.title || '',
        person.company || '',
        person.linkedin || generateLinkedInSearch(person.name, person.company),
        data.eventName || '',
        data.date || '',
        data.location || ''
      ]);
    });
  }
  
  if (filterType === 'all' && data.sponsors && data.sponsors.length > 0) {
    data.sponsors.forEach(sponsor => {
      rows.push([
        sponsor.tier ? `${sponsor.tier} Sponsor` : 'Sponsor',
        'Sponsor',
        sponsor.name || '',
        '',
        sponsor.name || '',
        '',
        data.eventName || '',
        data.date || '',
        data.location || ''
      ]);
    });
  }
  
  const csvContent = rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const suffix = filterType !== 'all' ? `_${filterType}` : '';
  link.setAttribute('download', `${sanitizeFilename(data.eventName || 'event')}${suffix}_contacts.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('CSV downloaded!');
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

function generateLinkedInSearch(name, company) {
  if (!name) return '';
  const query = company ? `${name} ${company}` : name;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

// Generate text summary
function generateTextSummary(data) {
  let summary = `# ${data.eventName || 'Event Analysis'}\n\n`;
  
  if (data.date) summary += `📅 Date: ${data.date}\n`;
  if (data.location) summary += `📍 Location: ${data.location}\n`;
  if (data.description) summary += `\n${data.description}\n`;
  
  const people = data.people || data.speakers || [];
  if (people.length > 0) {
    summary += `\n## People (${people.length})\n`;
    people.forEach(s => {
      summary += `- ${s.name}`;
      if (s.role) summary += ` [${s.role}]`;
      if (s.title) summary += `, ${s.title}`;
      if (s.company) summary += ` @ ${s.company}`;
      summary += '\n';
    });
  }
  
  if (data.sponsors && data.sponsors.length > 0) {
    summary += `\n## Sponsors (${data.sponsors.length})\n`;
    data.sponsors.forEach(s => {
      summary += `- ${s.name}`;
      if (s.tier) summary += ` (${s.tier})`;
      summary += '\n';
    });
  }
  
  if (data.nextBestActions && data.nextBestActions.length > 0) {
    summary += `\n## Next Best Actions\n`;
    data.nextBestActions.forEach((action, i) => {
      summary += `${i + 1}. ${action.action}\n`;
      if (action.reason) summary += `   → ${action.reason}\n`;
    });
  }
  
  if (data.expectedPersonas && data.expectedPersonas.length > 0) {
    summary += `\n## Expected Personas\n`;
    data.expectedPersonas.forEach(p => {
      summary += `- ${p.persona}`;
      if (p.likelihood) summary += ` (${p.likelihood})`;
      if (p.count) summary += ` - Est. ${p.count}`;
      summary += '\n';
    });
  }
  
  return summary;
}

// Render Results
function renderResults(data) {
  const people = data.people || data.speakers || [];
  
  // Determine default filter: show targets if any exist, otherwise all
  const hasTargets = people.some(p => isTargetPersona(p));
  currentFilter = hasTargets ? 'targets' : 'all';
  updateFilterButtons();
  
  // ROI Estimate (FIRST - top priority)
  renderROIEstimate(data, people);
  
  // Next Best Actions
  renderNextActions(data);
  
  // Expected Personas
  renderPersonas(data);
  
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

  // People
  renderPeopleList(data, people, currentFilter);

  // Sponsors
  const sponsorsContainer = document.getElementById('sponsors-list');
  const sponsorsCount = document.getElementById('sponsors-count');
  if (data.sponsors && data.sponsors.length > 0) {
    sponsorsCount.textContent = data.sponsors.length;
    sponsorsContainer.innerHTML = data.sponsors.map(sponsor => {
      const isCompetitor = isCompetitorCompany(sponsor.name);
      return `
      <div class="sponsor-item ${isCompetitor ? 'competitor-match' : ''}">
        <div class="person-avatar">🏢</div>
        <div class="person-info">
          <div class="person-name">${escapeHtml(sponsor.name)}${isCompetitor ? ' <span class="competitor-badge">⚔️ Competitor</span>' : ''}</div>
          ${sponsor.tier ? `<div class="person-title">${escapeHtml(sponsor.tier)} Sponsor</div>` : ''}
        </div>
      </div>
    `}).join('');
  } else {
    sponsorsCount.textContent = '0';
    sponsorsContainer.innerHTML = '<p class="empty-state-small">No sponsors found</p>';
  }
}

function renderNextActions(data) {
  const container = document.getElementById('next-actions');
  if (!container) return;
  
  if (data.nextBestActions && data.nextBestActions.length > 0) {
    container.innerHTML = data.nextBestActions.map((action, i) => `
      <div class="action-item priority-${action.priority || 'medium'}">
        <div class="action-number">${i + 1}</div>
        <div class="action-content">
          <div class="action-text">${escapeHtml(action.action)}</div>
          ${action.reason ? `<div class="action-reason">${escapeHtml(action.reason)}</div>` : ''}
        </div>
      </div>
    `).join('');
  } else {
    container.innerHTML = '<p class="empty-state-small">No actions available</p>';
  }
}

function renderPersonas(data) {
  const container = document.getElementById('personas-list');
  if (!container) return;
  
  if (data.expectedPersonas && data.expectedPersonas.length > 0) {
    container.innerHTML = data.expectedPersonas.map((p, index) => `
      <div class="persona-item clickable" data-persona-index="${index}">
        <div class="persona-icon">👤</div>
        <div class="persona-content">
          <div class="persona-name">${escapeHtml(p.persona)}</div>
          <div class="persona-meta">
            ${p.likelihood ? `<span class="persona-likelihood ${p.likelihood.toLowerCase()}">${p.likelihood}</span>` : ''}
            ${p.count ? `<span class="persona-count">~${p.count} expected</span>` : ''}
          </div>
          ${p.conversationStarters && p.conversationStarters.length > 0 ? `
            <div class="persona-preview">
              <span class="preview-label">💬</span> "${escapeHtml(p.conversationStarters[0])}"
            </div>
          ` : ''}
        </div>
        <div class="persona-action">
          <span class="dive-in-btn">Dive In →</span>
        </div>
      </div>
    `).join('');
    
    // Add click handlers for persona deep dive
    container.querySelectorAll('.persona-item.clickable').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.personaIndex);
        openPersonaModal(data.expectedPersonas[index], data);
      });
    });
  } else {
    container.innerHTML = '<p class="empty-state-small">No persona predictions available</p>';
  }
}

function renderPeopleList(data, people, filter) {
  const peopleContainer = document.getElementById('people-list');
  const peopleCount = document.getElementById('people-count');
  const filterBar = document.getElementById('people-filter');
  
  // Show filter bar if there are people
  if (filterBar) {
    filterBar.classList.toggle('hidden', people.length === 0);
  }
  
  let filtered = people;
  if (filter === 'targets') {
    filtered = people.filter(p => isTargetPersona(p));
  } else if (filter === 'speakers') {
    filtered = people.filter(p => p.role && p.role.toLowerCase().includes('speaker'));
  }
  
  if (filtered.length > 0) {
    peopleCount.textContent = filter === 'all' ? people.length : `${filtered.length}/${people.length}`;
    peopleContainer.innerHTML = filtered.map(person => {
      const linkedinUrl = person.linkedin || generateLinkedInSearch(person.name, person.company);
      const isTarget = isTargetPersona(person);
      return `
      <div class="person-item ${isTarget ? 'target-match' : ''}">
        <div class="person-avatar">${getInitials(person.name)}</div>
        <div class="person-info">
          <div class="person-name">
            ${escapeHtml(person.name)}
            ${person.role ? ` <span class="person-role">${escapeHtml(person.role)}</span>` : ''}
            ${isTarget ? ' <span class="target-badge">🎯 Target</span>' : ''}
          </div>
          ${person.title ? `<div class="person-title">${escapeHtml(person.title)}</div>` : ''}
          ${person.company ? `<div class="person-company">${escapeHtml(person.company)}</div>` : ''}
          ${person.persona ? `<div class="person-persona">👤 ${escapeHtml(person.persona)}</div>` : ''}
          
          <div class="person-actions-box">
            ${person.linkedinMessage ? `
              <div class="action-message linkedin-msg">
                <div class="action-header">
                  <span class="action-icon">💼</span>
                  <span class="action-title">LinkedIn Request</span>
                  <button class="copy-btn-small" data-copy="${escapeHtml(person.linkedinMessage)}">📋</button>
                </div>
                <div class="action-text">${escapeHtml(person.linkedinMessage)}</div>
              </div>
            ` : ''}
            ${person.iceBreaker ? `
              <div class="action-message ice-breaker">
                <div class="action-header">
                  <span class="action-icon">🗣️</span>
                  <span class="action-title">In-Person Opener</span>
                  <button class="copy-btn-small" data-copy="${escapeHtml(person.iceBreaker)}">📋</button>
                </div>
                <div class="action-text">${escapeHtml(person.iceBreaker)}</div>
              </div>
            ` : ''}
          </div>
          
          <a href="${linkedinUrl}" target="_blank" class="linkedin-link">🔗 Open LinkedIn</a>
        </div>
      </div>
    `}).join('');
    
    // Add copy handlers
    peopleContainer.querySelectorAll('.copy-btn-small').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy);
        showToast('Copied to clipboard!');
      });
    });
  } else {
    peopleCount.textContent = filter === 'all' ? '0' : `0/${people.length}`;
    peopleContainer.innerHTML = `<p class="empty-state-small">${filter === 'all' ? 'No people found' : 'No matches for this filter'}</p>`;
  }
}

function renderROIEstimate(data, people) {
  const roiCard = document.getElementById('roi-card');
  const roiContent = document.getElementById('roi-content');
  
  if (!userProfile.dealSize || !userProfile.conversionRate) {
    roiCard.classList.add('hidden');
    return;
  }
  
  const targetPeople = people.filter(p => isTargetPersona(p)).length;
  const dealSize = parseFloat(userProfile.dealSize) || 0;
  const convRate = parseFloat(userProfile.conversionRate) / 100 || 0;
  const winRate = parseFloat(userProfile.oppWinRate) / 100 || 0.25;
  
  const potentialOpps = targetPeople * convRate;
  const potentialDeals = potentialOpps * winRate;
  const potentialRevenue = potentialDeals * dealSize;
  
  roiCard.classList.remove('hidden');
  roiContent.innerHTML = `
    <div class="roi-grid">
      <div class="roi-stat">
        <div class="roi-value">${targetPeople}</div>
        <div class="roi-label">Target Personas</div>
      </div>
      <div class="roi-stat">
        <div class="roi-value">${potentialOpps.toFixed(1)}</div>
        <div class="roi-label">Est. Opportunities</div>
      </div>
      <div class="roi-stat">
        <div class="roi-value">${potentialDeals.toFixed(1)}</div>
        <div class="roi-label">Est. Deals</div>
      </div>
      <div class="roi-stat highlight">
        <div class="roi-value">$${formatNumber(potentialRevenue)}</div>
        <div class="roi-label">Potential Revenue</div>
      </div>
    </div>
    <p class="roi-disclaimer">Based on ${userProfile.conversionRate}% lead→opp rate, ${userProfile.oppWinRate || 25}% win rate, $${formatNumber(dealSize)} avg deal</p>
  `;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toFixed(0);
}

function isTargetPersona(person) {
  if (!userProfile.targetPersonas || !person.title) return false;
  const targets = userProfile.targetPersonas.toLowerCase().split(',').map(t => t.trim());
  const title = person.title.toLowerCase();
  return targets.some(t => title.includes(t) || t.includes(title.split(' ')[0]));
}

function isCompetitorCompany(companyName) {
  if (!userProfile.competitors || !companyName) return false;
  const competitors = userProfile.competitors.toLowerCase().split(',').map(c => c.trim());
  const name = companyName.toLowerCase();
  return competitors.some(c => name.includes(c) || c.includes(name));
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

// Persona Modal
let currentPersonaContext = null;
let personaChatHistory = [];

function openPersonaModal(persona, eventData) {
  currentPersonaContext = { persona, eventData };
  personaChatHistory = [];
  
  const modal = document.getElementById('persona-modal');
  const title = document.getElementById('persona-modal-title');
  const info = document.getElementById('persona-info');
  const startersList = document.getElementById('persona-starters-list');
  const keywordsList = document.getElementById('persona-keywords-list');
  const painPointsList = document.getElementById('persona-pain-points-list');
  const chatMessages = document.getElementById('persona-chat-messages');
  
  title.textContent = `👤 ${persona.persona}`;
  
  info.innerHTML = `
    <div class="persona-detail-row">
      <span class="detail-label">Likelihood:</span>
      <span class="persona-likelihood ${(persona.likelihood || 'medium').toLowerCase()}">${persona.likelihood || 'Unknown'}</span>
    </div>
    <div class="persona-detail-row">
      <span class="detail-label">Expected at event:</span>
      <span>~${persona.count || 'Unknown'}</span>
    </div>
    
    ${persona.linkedinMessage ? `
    <div class="persona-action-card">
      <div class="action-card-header">
        <span>💼 LinkedIn Request Message</span>
        <button class="copy-btn-inline" data-copy="${escapeHtml(persona.linkedinMessage)}">📋 Copy</button>
      </div>
      <div class="action-card-body">${escapeHtml(persona.linkedinMessage)}</div>
    </div>
    ` : ''}
    
    ${persona.iceBreaker ? `
    <div class="persona-action-card highlight">
      <div class="action-card-header">
        <span>🗣️ In-Person Ice Breaker</span>
        <button class="copy-btn-inline" data-copy="${escapeHtml(persona.iceBreaker)}">📋 Copy</button>
      </div>
      <div class="action-card-body">${escapeHtml(persona.iceBreaker)}</div>
    </div>
    ` : ''}
  `;
  
  // Add copy handlers for action cards
  info.querySelectorAll('.copy-btn-inline').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.copy);
      showToast('Copied to clipboard!');
    });
  });
  
  // Conversation Starters (follow-ups)
  if (persona.conversationStarters && persona.conversationStarters.length > 0) {
    startersList.innerHTML = `<p class="starters-intro">After breaking the ice, try these follow-ups:</p>` + 
      persona.conversationStarters.map(s => `
      <div class="starter-item">
        <span class="starter-quote">${escapeHtml(s)}</span>
        <button class="copy-starter-btn" data-text="${escapeHtml(s)}">📋</button>
      </div>
    `).join('');
    
    startersList.querySelectorAll('.copy-starter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.text);
        showToast('Copied to clipboard!');
      });
    });
  } else {
    startersList.innerHTML = '<p class="empty-state-small">No starters available</p>';
  }
  
  // Keywords
  if (persona.keywords && persona.keywords.length > 0) {
    keywordsList.innerHTML = persona.keywords.map(k => `
      <span class="keyword-tag">${escapeHtml(k)}</span>
    `).join('');
  } else {
    keywordsList.innerHTML = '<p class="empty-state-small">No keywords available</p>';
  }
  
  // Pain Points
  if (persona.painPoints && persona.painPoints.length > 0) {
    painPointsList.innerHTML = persona.painPoints.map(p => `
      <div class="pain-point-item">• ${escapeHtml(p)}</div>
    `).join('');
  } else {
    painPointsList.innerHTML = '<p class="empty-state-small">No pain points available</p>';
  }
  
  // Clear chat
  chatMessages.innerHTML = `
    <div class="chat-message assistant">
      <p>I can help you refine your approach for <strong>${escapeHtml(persona.persona)}</strong> at <strong>${escapeHtml(eventData.eventName || 'this event')}</strong>.</p>
      <p>Ask me things like:</p>
      <ul>
        <li>"How do I open if they seem busy?"</li>
        <li>"What objections might they have?"</li>
        <li>"How do I transition to talking about ${escapeHtml(userProfile.product || 'our product')}?"</li>
      </ul>
    </div>
  `;
  
  modal.classList.remove('hidden');
}

// Close persona modal
document.getElementById('persona-modal-close')?.addEventListener('click', () => {
  document.getElementById('persona-modal').classList.add('hidden');
  currentPersonaContext = null;
  personaChatHistory = [];
});

// Click outside modal to close
document.getElementById('persona-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'persona-modal') {
    document.getElementById('persona-modal').classList.add('hidden');
    currentPersonaContext = null;
    personaChatHistory = [];
  }
});

// Persona Chat
document.getElementById('persona-chat-send')?.addEventListener('click', sendPersonaChatMessage);
document.getElementById('persona-chat-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendPersonaChatMessage();
});

async function sendPersonaChatMessage() {
  const input = document.getElementById('persona-chat-input');
  const messagesContainer = document.getElementById('persona-chat-messages');
  const message = input.value.trim();
  
  if (!message || !currentPersonaContext) return;
  
  // Add user message
  messagesContainer.innerHTML += `
    <div class="chat-message user">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  input.value = '';
  
  // Add loading indicator
  messagesContainer.innerHTML += `
    <div class="chat-message assistant loading">
      <p>Thinking...</p>
    </div>
  `;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Build chat context
  personaChatHistory.push({ role: 'user', content: message });
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'personaChat',
      persona: currentPersonaContext.persona,
      eventData: currentPersonaContext.eventData,
      userProfile: userProfile,
      chatHistory: personaChatHistory,
      userMessage: message
    });
    
    // Remove loading indicator
    messagesContainer.querySelector('.chat-message.loading')?.remove();
    
    if (response.error) {
      messagesContainer.innerHTML += `
        <div class="chat-message assistant error">
          <p>Error: ${escapeHtml(response.error)}</p>
        </div>
      `;
    } else {
      personaChatHistory.push({ role: 'assistant', content: response.reply });
      messagesContainer.innerHTML += `
        <div class="chat-message assistant">
          <p>${escapeHtml(response.reply)}</p>
        </div>
      `;
    }
  } catch (error) {
    messagesContainer.querySelector('.chat-message.loading')?.remove();
    messagesContainer.innerHTML += `
      <div class="chat-message assistant error">
        <p>Failed to get response. Please try again.</p>
      </div>
    `;
  }
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

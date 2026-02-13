// DOM Elements - Onboarding
const onboardingMode = document.getElementById('onboarding-mode');
const onboardingPreview = document.getElementById('onboarding-preview');
const onboardingApi = document.getElementById('onboarding-api');
const onboardingCompany = document.getElementById('onboarding-company');
const onboardingGoals = document.getElementById('onboarding-goals');
const mainSection = document.getElementById('main-section');

// Onboarding mode selection buttons
const selectProBtn = document.getElementById('select-pro-btn');
const selectByokBtn = document.getElementById('select-byok-btn');
const selectPreviewBtn = document.getElementById('select-preview-btn');
const selectImportBtn = document.getElementById('select-import-btn');
const importFileInputMode = document.getElementById('import-file-input-mode');

// Onboarding buttons
const onboardingPreviewBack = document.getElementById('onboarding-preview-back');
const onboardingApiBack = document.getElementById('onboarding-api-back');
const onboardingApiNext = document.getElementById('onboarding-api-next');
const onboardingCompanyBack = document.getElementById('onboarding-company-back');
const onboardingCompanyNext = document.getElementById('onboarding-company-next');
const onboardingGoalsBack = document.getElementById('onboarding-goals-back');
const onboardingGoalsFinish = document.getElementById('onboarding-goals-finish');
const importProfileBtn = document.getElementById('import-profile-btn');
const importFileInput = document.getElementById('import-file-input');

// Embedded Pro API Key
const PRO_API_KEY = 'AIzaSyBFuyc6djAr1OXiBQhU7rluXOkWNxcVPfc';

// Navigation history
let navigationHistory = [];
let historyIndex = -1;
let isNavigatingHistory = false;

// Demo profiles configuration
const DEMO_PROFILES = {
  'demo-gtm-team-corporate-saas': 'demo-profiles/demo-gtm-team-corporate-saas.json',
  'demo-individual-product-director': 'demo-profiles/demo-individual-product-director.json',
  'demo-individual-job-hunter': 'demo-profiles/demo-individual-job-hunter.json'
};

// Main section elements
const analyzeBtn = document.getElementById('analyze-btn');
const settingsBtn = document.getElementById('settings-btn-header');
const recordToggleBtn = document.getElementById('record-toggle-btn');
const headerNav = document.getElementById('header-nav');
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
let savedEvents = {}; // Store analyzed events by URL
let skippedUrls = {}; // Store URLs that are not events (to avoid re-checking)
let pendingAnalyses = {}; // Track events currently being analyzed
let currentTabUrl = null;
let eventsSortBy = 'date'; // Default sort by last analyzed

// People display state
let peopleDisplayCount = 3; // How many people to show

// Onboarding mode tracking
let onboardingUsedProKey = false; // Track if user selected Pro mode

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
  savedEvents = await loadSavedEvents();
  skippedUrls = await loadSkippedUrls();
  
  if (userProfile.onboardingComplete && userProfile.geminiApiKey) {
    showMainSection();
    updateProfileIndicator();
    await updateCurrentUrl();
    await checkForCachedAnalysis();
    updateEventsCount();
  } else {
    showOnboardingStep('mode');
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

// Events Storage
async function loadSavedEvents() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['savedEvents'], (result) => {
      resolve(result.savedEvents || {});
    });
  });
}

// Skipped URLs Storage (non-event pages)
async function loadSkippedUrls() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['skippedUrls'], (result) => {
      resolve(result.skippedUrls || {});
    });
  });
}

async function saveSkippedUrl(url, reason) {
  const urlKey = normalizeUrl(url);
  skippedUrls[urlKey] = {
    url: url,
    reason: reason,
    skippedAt: new Date().toISOString()
  };
  return new Promise((resolve) => {
    chrome.storage.local.set({ skippedUrls }, resolve);
  });
}

function isUrlSkipped(url) {
  const urlKey = normalizeUrl(url);
  return !!skippedUrls[urlKey];
}

async function saveEvent(url, data) {
  const eventKey = normalizeUrl(url);
  savedEvents[eventKey] = {
    ...data,
    url: url,
    analyzedAt: new Date().toISOString(),
    lastViewed: new Date().toISOString()
  };
  return new Promise((resolve) => {
    chrome.storage.local.set({ savedEvents }, resolve);
  });
}

async function deleteEvent(url) {
  const eventKey = normalizeUrl(url);
  delete savedEvents[eventKey];
  return new Promise((resolve) => {
    chrome.storage.local.set({ savedEvents }, resolve);
  });
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function getEventByUrl(url) {
  const eventKey = normalizeUrl(url);
  return savedEvents[eventKey] || null;
}

async function checkForCachedAnalysis() {
  if (!currentTabUrl) return;
  
  // Hide saved event banner when checking current page
  hideSavedEventBanner();
  
  const cached = getEventByUrl(currentTabUrl);
  const reanalyzeBtn = document.getElementById('reanalyze-fresh-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const shareBtn = document.getElementById('share-btn-header');
  
  if (cached) {
    // Show cached results
    reanalyzeBtn?.classList.remove('hidden');
    shareBtn?.classList.remove('hidden');
    analyzeBtn?.classList.add('hidden'); // Hide main analyze button
    showResults(cached);
  } else {
    // Reset to empty state for new/unanalyzed page
    reanalyzeBtn?.classList.add('hidden');
    shareBtn?.classList.add('hidden');
    analyzeBtn?.classList.remove('hidden'); // Show main analyze button
    resultsDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    emptyState.classList.remove('hidden');
    currentAnalysisData = null;
    
    // Reset pre-check result for new URL
    if (lastPreCheckUrl !== currentTabUrl) {
      lastPreCheckResult = null;
      lastPreCheckUrl = null;
    }
  }
}

// Track pre-check state to avoid duplicate checks
let lastPreCheckUrl = null;
let lastPreCheckResult = null; // Store the pre-check result for use by analyze button

function updateEventsCount() {
  const countEl = document.getElementById('events-count');
  if (countEl) {
    const count = Object.keys(savedEvents).length;
    countEl.textContent = count;
    countEl.classList.toggle('hidden', count === 0);
  }
  // Also update people count
  updatePeopleCount();
}

// Profile Indicator
function updateProfileIndicator() {
  const indicator = document.getElementById('profile-indicator');
  const badge = document.getElementById('profile-badge');
  const name = document.getElementById('profile-name');
  const resetBtn = document.getElementById('profile-reset-btn');
  
  if (!indicator || !badge || !name || !resetBtn || !userProfile) return;
  
  // Only show if onboarding is complete
  if (!userProfile.onboardingComplete) {
    indicator.classList.add('hidden');
    return;
  }
  
  indicator.classList.remove('hidden');
  
  // Build profile text: "Know Before You Go - Company - Job Title"
  let profileText = 'Know Before You Go';
  if (userProfile.companyName) {
    profileText += ` - ${userProfile.companyName}`;
  }
  if (userProfile.yourRole) {
    profileText += ` - ${userProfile.yourRole}`;
  }
  
  badge.textContent = '';
  badge.className = 'profile-badge hidden';
  name.textContent = profileText;
  
  if (userProfile.isDemoMode) {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }
}

// Reset demo and go back to welcome
async function resetDemo() {
  // Clear all storage
  userProfile = { ...defaultProfile };
  savedEvents = {};
  skippedUrls = {};
  pendingAnalyses = {};
  await chrome.storage.local.clear();
  
  // Hide profile indicator and reset UI state
  document.getElementById('profile-indicator')?.classList.add('hidden');
  headerNav?.classList.add('hidden');
  updateEventsCount();
  
  // Go back to welcome screen
  showOnboardingStep('mode');
  showToast('Demo reset complete');
}

// Attach reset button handler
document.getElementById('profile-reset-btn')?.addEventListener('click', resetDemo);

// Onboarding Navigation
function showOnboardingStepInternal(step) {
  onboardingMode?.classList.add('hidden');
  onboardingPreview?.classList.add('hidden');
  onboardingApi.classList.add('hidden');
  onboardingCompany.classList.add('hidden');
  onboardingGoals.classList.add('hidden');
  mainSection.classList.add('hidden');
  headerNav?.classList.add('hidden');
  settingsSection?.classList.add('hidden');
  
  if (step === 'mode') {
    onboardingMode?.classList.remove('hidden');
  } else if (step === 'preview') {
    onboardingPreview?.classList.remove('hidden');
  } else if (step === 1) {
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

function showOnboardingStep(step) {
  showOnboardingStepInternal(step);
  
  // Push to navigation history
  let viewName;
  if (step === 'mode') viewName = 'onboarding-mode';
  else if (step === 'preview') viewName = 'onboarding-preview';
  else if (step === 1) viewName = 'onboarding-api';
  else if (step === 2) viewName = 'onboarding-company';
  else if (step === 3) viewName = 'onboarding-goals';
  
  if (viewName) {
    pushToHistory(viewName);
  }
}

function showMainSection() {
  onboardingMode?.classList.add('hidden');
  onboardingPreview?.classList.add('hidden');
  onboardingApi.classList.add('hidden');
  onboardingCompany.classList.add('hidden');
  onboardingGoals.classList.add('hidden');
  mainSection.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
  updateProfileIndicator();
  showCurrentPageView(); // Default to current page view
}

// Back/Forward Navigation
document.getElementById('nav-back-btn')?.addEventListener('click', () => {
  navigateBack();
});

document.getElementById('nav-forward-btn')?.addEventListener('click', () => {
  navigateForward();
});

// Main Navigation (Current Page vs Events Index)
document.getElementById('nav-getting-started')?.addEventListener('click', () => {
  showGettingStartedView();
});

document.getElementById('nav-current')?.addEventListener('click', () => {
  showCurrentPageView();
});

document.getElementById('nav-events')?.addEventListener('click', () => {
  showEventsIndexView();
});

document.getElementById('nav-personas')?.addEventListener('click', () => {
  showPersonasIndexView();
});

document.getElementById('nav-people')?.addEventListener('click', () => {
  showPeopleIndexView();
});

// Quick Start links from empty states
document.getElementById('personas-quickstart-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showGettingStartedView();
});

document.getElementById('events-quickstart-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showGettingStartedView();
});

document.getElementById('current-quickstart-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showGettingStartedView();
});

function hideAllViews() {
  document.getElementById('current-page-view')?.classList.add('hidden');
  document.getElementById('events-index-view')?.classList.add('hidden');
  document.getElementById('personas-index-view')?.classList.add('hidden');
  document.getElementById('people-index-view')?.classList.add('hidden');
  document.getElementById('getting-started-view')?.classList.add('hidden');
  document.getElementById('nav-current')?.classList.remove('active');
  document.getElementById('nav-events')?.classList.remove('active');
  document.getElementById('nav-personas')?.classList.remove('active');
  document.getElementById('nav-people')?.classList.remove('active');
  document.getElementById('nav-getting-started')?.classList.remove('active');
}

// Navigation history functions
function pushToHistory(viewName, context = null) {
  if (isNavigatingHistory) return;
  
  // If we're not at the end of history, truncate forward history
  if (historyIndex < navigationHistory.length - 1) {
    navigationHistory = navigationHistory.slice(0, historyIndex + 1);
  }
  
  // Don't push duplicate consecutive entries
  const lastEntry = navigationHistory[navigationHistory.length - 1];
  if (lastEntry && lastEntry.view === viewName && JSON.stringify(lastEntry.context) === JSON.stringify(context)) {
    return;
  }
  
  navigationHistory.push({ view: viewName, context });
  historyIndex = navigationHistory.length - 1;
  updateNavButtons();
}

function updateNavButtons() {
  const backBtn = document.getElementById('nav-back-btn');
  const forwardBtn = document.getElementById('nav-forward-btn');
  
  if (backBtn) {
    backBtn.disabled = historyIndex <= 0;
  }
  if (forwardBtn) {
    forwardBtn.disabled = historyIndex >= navigationHistory.length - 1;
  }
}

function navigateBack() {
  if (historyIndex > 0) {
    historyIndex--;
    isNavigatingHistory = true;
    const entry = navigationHistory[historyIndex];
    navigateToView(entry.view, entry.context);
    isNavigatingHistory = false;
    updateNavButtons();
  }
}

function navigateForward() {
  if (historyIndex < navigationHistory.length - 1) {
    historyIndex++;
    isNavigatingHistory = true;
    const entry = navigationHistory[historyIndex];
    navigateToView(entry.view, entry.context);
    isNavigatingHistory = false;
    updateNavButtons();
  }
}

function navigateToView(viewName, context = null) {
  switch (viewName) {
    case 'getting-started':
      showGettingStartedViewInternal();
      break;
    case 'current-page':
      showCurrentPageViewInternal();
      break;
    case 'events-index':
      showEventsIndexViewInternal();
      break;
    case 'personas-index':
      showPersonasIndexViewInternal();
      break;
    case 'people-index':
      showPeopleIndexViewInternal();
      break;
    case 'settings':
      showSettingsInternal();
      break;
    case 'onboarding-mode':
      showOnboardingStepInternal('mode');
      break;
    case 'onboarding-preview':
      showOnboardingStepInternal('preview');
      break;
    case 'onboarding-api':
      showOnboardingStepInternal(1);
      break;
    case 'onboarding-company':
      showOnboardingStepInternal(2);
      break;
    case 'onboarding-goals':
      showOnboardingStepInternal(3);
      break;
  }
}

// Internal view functions (don't push to history)
function showGettingStartedViewInternal() {
  hideAllViews();
  document.getElementById('getting-started-view')?.classList.remove('hidden');
  document.getElementById('nav-getting-started')?.classList.add('active');
  settingsSection?.classList.add('hidden');
  mainSection?.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
}

function showCurrentPageViewInternal() {
  hideAllViews();
  document.getElementById('current-page-view')?.classList.remove('hidden');
  document.getElementById('nav-current')?.classList.add('active');
  settingsSection?.classList.add('hidden');
  mainSection?.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
}

function showEventsIndexViewInternal() {
  hideAllViews();
  document.getElementById('events-index-view')?.classList.remove('hidden');
  document.getElementById('nav-events')?.classList.add('active');
  settingsSection?.classList.add('hidden');
  mainSection?.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
  renderEventsIndex();
}

function showPersonasIndexViewInternal() {
  hideAllViews();
  document.getElementById('personas-index-view')?.classList.remove('hidden');
  document.getElementById('nav-personas')?.classList.add('active');
  settingsSection?.classList.add('hidden');
  mainSection?.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
  renderPersonasIndex();
}

function showSettingsInternal() {
  populateSettingsModal();
  mainSection?.classList.add('hidden');
  headerNav?.classList.add('hidden');
  settingsSection?.classList.remove('hidden');
}

function showGettingStartedView() {
  showGettingStartedViewInternal();
  pushToHistory('getting-started');
}

function showCurrentPageView() {
  showCurrentPageViewInternal();
  pushToHistory('current-page');
}

function showEventsIndexView() {
  showEventsIndexViewInternal();
  pushToHistory('events-index');
}

function showPersonasIndexView() {
  showPersonasIndexViewInternal();
  pushToHistory('personas-index');
}

function showPeopleIndexView() {
  showPeopleIndexViewInternal();
  pushToHistory('people-index');
}

function showPeopleIndexViewInternal() {
  hideAllViews();
  document.getElementById('people-index-view')?.classList.remove('hidden');
  document.getElementById('nav-people')?.classList.add('active');
  settingsSection?.classList.add('hidden');
  mainSection?.classList.remove('hidden');
  headerNav?.classList.remove('hidden');
  renderPeopleIndex();
}

function renderPeopleIndex() {
  const container = document.getElementById('people-master-list');
  if (!container) return;
  
  // Gather all people from all events
  const allPeople = [];
  const events = Object.values(savedEvents);
  
  events.forEach(event => {
    const people = event.people || [];
    people.forEach(person => {
      allPeople.push({
        ...person,
        eventName: event.eventName,
        eventUrl: event.url,
        eventDate: event.date
      });
    });
  });
  
  // Update stats
  const targetCount = allPeople.filter(p => isTargetPersona(p)).length;
  const totalStatEl = document.getElementById('people-total-stat');
  const targetsStatEl = document.getElementById('people-targets-stat');
  const eventsStatEl = document.getElementById('people-events-stat');
  const totalCountEl = document.getElementById('people-total-count');
  if (totalStatEl) totalStatEl.textContent = allPeople.length;
  if (targetsStatEl) targetsStatEl.textContent = targetCount;
  if (eventsStatEl) eventsStatEl.textContent = events.length;
  if (totalCountEl) totalCountEl.textContent = allPeople.length;
  
  if (allPeople.length === 0) {
    container.innerHTML = `
      <div class="events-empty">
        <div class="empty-icon">👤</div>
        <p>No people found yet</p>
        <p class="hint">Analyze events to see people here. <a href="#" id="people-quickstart-link">Go to Quick Start →</a></p>
      </div>
    `;
    document.getElementById('people-quickstart-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showGettingStartedView();
    });
    return;
  }
  
  // Sort: targets first
  const sorted = [...allPeople].sort((a, b) => {
    const aTarget = isTargetPersona(a) ? 0 : 1;
    const bTarget = isTargetPersona(b) ? 0 : 1;
    return aTarget - bTarget;
  });
  
  // Show first 20 people as preview
  const preview = sorted.slice(0, 20);
  
  container.innerHTML = preview.map(person => {
    const isTarget = isTargetPersona(person);
    return `
      <div class="person-row ${isTarget ? 'target-match' : ''}">
        <div class="person-row-info">
          <div class="person-row-name">${escapeHtml(person.name)}</div>
          <div class="person-row-meta">${escapeHtml(person.title || '')}${person.company ? ` @ ${escapeHtml(person.company)}` : ''}</div>
          <div class="person-row-event">📍 ${escapeHtml(person.eventName || 'Unknown Event')}</div>
        </div>
        ${isTarget ? '<span class="target-badge">✓ Target</span>' : ''}
      </div>
    `;
  }).join('');
  
  if (sorted.length > 20) {
    container.innerHTML += `<div class="people-preview-note">Showing 20 of ${sorted.length} people. Export to see all.</div>`;
  }
}

// Update people count on tab
function updatePeopleCount() {
  let total = 0;
  Object.values(savedEvents).forEach(event => {
    total += (event.people || []).length;
  });
  const countEl = document.getElementById('people-total-count');
  if (countEl) countEl.textContent = total;
}

function renderPersonasIndex() {
  const container = document.getElementById('personas-master-list');
  if (!container) return;
  
  // Build persona -> events map
  const personaEventsMap = {};
  
  Object.values(savedEvents).forEach(event => {
    const personas = event.expectedPersonas || [];
    const people = event.people || [];
    
    personas.forEach(persona => {
      // Use 'persona' field which is the job title/role category
      const personaName = persona.persona || persona.title || persona.name || 'Unknown Persona';
      
      if (!personaEventsMap[personaName]) {
        personaEventsMap[personaName] = {
          name: personaName,
          events: []
        };
      }
      
      // Count people matching this persona at this event
      const matchingPeople = people.filter(p => {
        const pRole = (p.role || p.title || p.persona || '').toLowerCase();
        const personaLower = personaName.toLowerCase();
        // Check if person's role/title contains persona keywords
        const personaWords = personaLower.split(/\s+/);
        return personaWords.some(word => word.length > 2 && pRole.includes(word)) ||
               pRole.includes(personaLower) || 
               personaLower.includes(pRole);
      }).length;
      
      personaEventsMap[personaName].events.push({
        url: event.url,
        eventName: event.eventName || 'Unknown Event',
        date: event.date || '',
        peopleCount: matchingPeople,
        personaData: persona
      });
    });
  });
  
  const personaList = Object.values(personaEventsMap).sort((a, b) => 
    b.events.length - a.events.length
  );
  
  if (personaList.length === 0) {
    container.innerHTML = `
      <div class="events-empty">
        <div class="empty-icon">🎭</div>
        <p>No personas found yet</p>
        <p class="hint">Analyze events to see personas here</p>
      </div>
    `;
    return;
  }
  
  // Limit to top 10 personas
  const top10Personas = personaList.slice(0, 10);
  const maxEvents = Math.max(...top10Personas.map(p => p.events.length));
  
  // Build horizontal bar chart
  const barChartHtml = `
    <div class="persona-bar-chart">
      <h4 class="bar-chart-title">📊 Top Personas by Event Count</h4>
      <div class="bar-chart-rows">
        ${top10Personas.map((persona, index) => {
          const barWidth = maxEvents > 0 ? (persona.events.length / maxEvents) * 100 : 0;
          return `
            <div class="bar-row" data-persona-index="${index}">
              <div class="bar-label">${escapeHtml(persona.name)}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${barWidth}%"></div>
              </div>
              <div class="bar-value">${persona.events.length}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  const renderPersonaCard = (persona, hidden = false) => {
    return `
      <div class="persona-master-card ${hidden ? 'persona-hidden' : ''}">
        <div class="persona-master-header">
          <div class="persona-master-title">
            <span class="persona-icon">🎯</span>
            <h3>${escapeHtml(persona.name)}</h3>
          </div>
          <div class="persona-master-stats">
            <span class="stat-badge">${persona.events.length} event${persona.events.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="persona-events-list">
          ${persona.events.map(event => `
            <div class="persona-event-row" data-url="${escapeHtml(event.url)}" data-persona="${escapeHtml(persona.name)}">
              <div class="persona-event-info">
                <span class="event-name">${escapeHtml(event.eventName)}</span>
                ${event.date ? `<span class="event-date">${escapeHtml(event.date)}</span>` : ''}
              </div>
              <span class="persona-row-arrow">›</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };
  
  const initialCount = 3;
  const hasMore = top10Personas.length > initialCount;
  
  container.innerHTML = barChartHtml + top10Personas.map((persona, index) => 
    renderPersonaCard(persona, index >= initialCount)
  ).join('') + (hasMore ? `
    <button id="show-more-personas" class="btn secondary show-more-btn">
      Show ${top10Personas.length - initialCount} More Personas
    </button>
    <button id="show-less-personas" class="btn secondary show-more-btn hidden">
      Show Less
    </button>
  ` : '');
  
  // Add bar chart click handlers to scroll to persona
  container.querySelectorAll('.bar-row').forEach(row => {
    row.addEventListener('click', () => {
      const index = parseInt(row.dataset.personaIndex);
      const cards = container.querySelectorAll('.persona-master-card');
      if (cards[index]) {
        // Show hidden cards if needed
        if (index >= initialCount) {
          container.querySelectorAll('.persona-hidden').forEach(card => {
            card.classList.remove('persona-hidden');
          });
          document.getElementById('show-more-personas')?.classList.add('hidden');
          document.getElementById('show-less-personas')?.classList.remove('hidden');
        }
        
        // Use setTimeout to allow DOM to update if cards were just revealed
        setTimeout(() => {
          const header = document.querySelector('header');
          const headerHeight = header ? header.offsetHeight : 100;
          const card = cards[index];
          const cardRect = card.getBoundingClientRect();
          
          // Body is the scroll container
          const scrollTop = window.scrollY + cardRect.top - headerHeight - 16;
          window.scrollTo({ top: scrollTop, behavior: 'smooth' });
          
          card.classList.add('persona-highlight');
          setTimeout(() => card.classList.remove('persona-highlight'), 1500);
        }, 50);
      }
    });
  });
  
  // Add show more/less handlers
  const showMoreBtn = document.getElementById('show-more-personas');
  const showLessBtn = document.getElementById('show-less-personas');
  
  showMoreBtn?.addEventListener('click', () => {
    container.querySelectorAll('.persona-hidden').forEach(card => {
      card.classList.remove('persona-hidden');
    });
    showMoreBtn.classList.add('hidden');
    showLessBtn?.classList.remove('hidden');
  });
  
  showLessBtn?.addEventListener('click', () => {
    container.querySelectorAll('.persona-master-card').forEach((card, index) => {
      if (index >= initialCount) {
        card.classList.add('persona-hidden');
      }
    });
    showLessBtn.classList.add('hidden');
    showMoreBtn?.classList.remove('hidden');
  });
  
  // Add click handlers
  container.querySelectorAll('.persona-event-row').forEach(row => {
    row.querySelector('.persona-dive-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = row.dataset.url;
      const personaName = row.dataset.persona;
      openPersonaFromMasterIndex(url, personaName);
    });
    
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      const personaName = row.dataset.persona;
      openPersonaFromMasterIndex(url, personaName);
    });
  });
}

function openPersonaFromMasterIndex(eventUrl, personaName) {
  const event = savedEvents[eventUrl];
  if (!event) return;
  
  const personas = event.expectedPersonas || [];
  const persona = personas.find(p => (p.persona || p.title || p.name || '') === personaName);
  
  if (persona) {
    openPersonaModal(persona, event);
  }
}

// Sort change handler
document.getElementById('events-sort')?.addEventListener('change', (e) => {
  eventsSortBy = e.target.value;
  renderEventsIndex();
});

// Export events as CSV
document.getElementById('export-events-csv')?.addEventListener('click', exportEventsAsCSV);

// Export all people button - opens integrations modal with all-people mode
document.getElementById('export-all-people-btn')?.addEventListener('click', () => {
  // Set flag for all-people export mode
  window.exportAllPeopleMode = true;
  integrationsModal?.classList.remove('hidden');
});

function calculateEventROI(event) {
  const people = event.people || [];
  const targetCount = people.filter(p => isTargetPersona(p)).length;
  const estimatedAttendees = event.estimatedAttendees || people.length;
  if (!userProfile.dealSize || !userProfile.conversionRate) return 0;
  const dealSize = parseFloat(userProfile.dealSize) || 0;
  const convRate = parseFloat(userProfile.conversionRate) / 100 || 0;
  const winRate = parseFloat(userProfile.oppWinRate) / 100 || 0.25;
  // Use estimated attendees if available, with target ratio from known people
  const targetRatio = people.length > 0 ? targetCount / people.length : 0.1;
  const estimatedTargets = estimatedAttendees > people.length ? Math.round(estimatedAttendees * targetRatio) : targetCount;
  return estimatedTargets * convRate * winRate * dealSize;
}

function sortEvents(events, sortBy) {
  return [...events].sort((a, b) => {
    switch (sortBy) {
      case 'roi':
        return calculateEventROI(b) - calculateEventROI(a);
      case 'targets':
        const aTargets = (a.people || []).filter(p => isTargetPersona(p)).length;
        const bTargets = (b.people || []).filter(p => isTargetPersona(p)).length;
        return bTargets - aTargets;
      case 'people':
        return (b.people || []).length - (a.people || []).length;
      case 'date':
        return new Date(b.analyzedAt || 0) - new Date(a.analyzedAt || 0);
      case 'eventDate':
        return (b.date || '').localeCompare(a.date || '');
      case 'name':
        return (a.eventName || '').localeCompare(b.eventName || '');
      default:
        return 0;
    }
  });
}

// Calendar Grid Functions
function renderCalendarGrid() {
  const container = document.getElementById('calendar-grid');
  if (!container) return;
  
  // Build a map of dates to event counts (supporting date ranges)
  const eventsByDate = {};
  Object.values(savedEvents).forEach(event => {
    const dates = getEventDateRange(event);
    dates.forEach(dateStr => {
      eventsByDate[dateStr] = (eventsByDate[dateStr] || 0) + 1;
    });
  });
  
  // Generate 52 weeks (full year view)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find start of this week (Monday)
  const startOfThisWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1
  startOfThisWeek.setDate(today.getDate() + diff);
  
  // Start 12 weeks before current week
  const startDate = new Date(startOfThisWeek);
  startDate.setDate(startDate.getDate() - 84); // 12 weeks back
  
  // Generate 52 weeks (past 12 + current + future 39)
  const weeks = [];
  const currentDate = new Date(startDate);
  
  for (let week = 0; week < 52; week++) {
    const weekDays = [];
    const weekStart = new Date(currentDate);
    
    for (let day = 0; day < 7; day++) {
      const date = new Date(currentDate);
      const dateKey = formatDateKey(date);
      const eventCount = eventsByDate[dateKey] || 0;
      const isToday = date.getTime() === today.getTime();
      const isFuture = date > today;
      
      weekDays.push({
        date: date,
        dateKey: dateKey,
        eventCount: eventCount,
        isToday: isToday,
        isFuture: isFuture
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    weeks.push({
      startDate: weekStart,
      days: weekDays
    });
  }
  
  // Render the grid
  container.innerHTML = weeks.map((week, weekIndex) => {
    const monthLabel = weekIndex % 4 === 0 ? getMonthLabel(week.startDate) : '';
    
    return `
      <div class="calendar-week">
        <div class="calendar-week-label">${monthLabel}</div>
        ${week.days.map(day => {
          let classes = 'calendar-day';
          if (day.isToday) classes += ' today';
          if (day.isFuture) classes += ' future';
          if (day.eventCount === 1) classes += ' has-event-single';
          if (day.eventCount >= 2) classes += ' has-event-multiple';
          
          const tooltipText = formatCalendarTooltip(day);
          
          return `
            <div class="${classes}" data-date="${day.dateKey}">
              <div class="calendar-day-tooltip">${tooltipText}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
  
  // Add click handlers for days with events
  container.querySelectorAll('.calendar-day.has-event-single, .calendar-day.has-event-multiple').forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      const dateKey = dayEl.dataset.date;
      filterEventsByDate(dateKey);
    });
  });
}

function parseEventDate(dateStr) {
  if (!dateStr) return null;
  
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Try various date formats
  // Common patterns: "March 15, 2026", "2026-03-15", "03/15/2026", "15 March 2026"
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return formatDateKey(date);
  }
  
  // Try to extract date from strings like "March 15-17, 2026" (use first date)
  const monthMatch = dateStr.match(/(\w+)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})/i);
  if (monthMatch) {
    const parsed = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
    if (!isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }
  }
  
  return null;
}

// Get all dates in an event's range (returns array of YYYY-MM-DD strings)
function getEventDateRange(event) {
  const dates = [];
  
  // Use structured startDate/endDate if available
  if (event.startDate) {
    const start = new Date(event.startDate + 'T00:00:00');
    const end = event.endDate ? new Date(event.endDate + 'T00:00:00') : start;
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const current = new Date(start);
      while (current <= end) {
        dates.push(formatDateKey(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
  }
  
  // Fallback: try to parse the date string
  const dateStr = parseEventDate(event.date);
  if (dateStr) {
    dates.push(dateStr);
  }
  
  return dates;
}

// Check if an event occurs on a specific date
function eventOccursOnDate(event, dateKey) {
  const dates = getEventDateRange(event);
  return dates.includes(dateKey);
}

function formatDateKey(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Format event date for display - shows range if different start/end dates
function formatEventDateDisplay(event) {
  // If we have structured dates, use them
  if (event.startDate) {
    const startDate = new Date(event.startDate + 'T00:00:00');
    const endDate = event.endDate ? new Date(event.endDate + 'T00:00:00') : null;
    
    if (!isNaN(startDate.getTime())) {
      const options = { month: 'short', day: 'numeric', year: 'numeric' };
      const startStr = startDate.toLocaleDateString('en-US', options);
      
      // If end date exists and is different from start date
      if (endDate && !isNaN(endDate.getTime()) && event.startDate !== event.endDate) {
        // Check if same month and year
        if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
          // Same month: "Mar 15-17, 2026"
          return `${startDate.toLocaleDateString('en-US', { month: 'short' })} ${startDate.getDate()}-${endDate.getDate()}, ${startDate.getFullYear()}`;
        } else {
          // Different months: "Mar 15 - Apr 2, 2026"
          const endStr = endDate.toLocaleDateString('en-US', options);
          return `${startStr} - ${endStr}`;
        }
      }
      
      return startStr;
    }
  }
  
  // Fallback to the raw date string
  return event.date || '-';
}

function getMonthLabel(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
}

function formatCalendarTooltip(day) {
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  const dateStr = day.date.toLocaleDateString('en-US', options);
  if (day.eventCount === 0) {
    return dateStr;
  } else if (day.eventCount === 1) {
    return `${dateStr} • 1 event`;
  } else {
    return `${dateStr} • ${day.eventCount} events`;
  }
}

function filterEventsByDate(dateKey) {
  // Find events on this date and scroll/highlight them
  const matchingEvents = Object.values(savedEvents).filter(event => {
    return eventOccursOnDate(event, dateKey);
  });
  
  if (matchingEvents.length > 0) {
    // Highlight matching event rows
    document.querySelectorAll('.event-row').forEach(row => {
      row.classList.remove('highlighted');
      const url = row.dataset.url;
      const event = getEventByUrl(url);
      if (event && eventOccursOnDate(event, dateKey)) {
        row.classList.add('highlighted');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    
    // Remove highlight after 2 seconds
    setTimeout(() => {
      document.querySelectorAll('.event-row.highlighted').forEach(row => {
        row.classList.remove('highlighted');
      });
    }, 2000);
  }
}

function renderEventsIndex() {
  const container = document.getElementById('events-list');
  const tableHeader = document.getElementById('events-table-header');
  if (!container) return;
  
  // Always render the calendar grid
  renderCalendarGrid();
  
  const events = sortEvents(Object.values(savedEvents), eventsSortBy);
  const pendingList = Object.values(pendingAnalyses);
  
  if (events.length === 0 && pendingList.length === 0) {
    tableHeader?.classList.add('hidden');
    container.innerHTML = `
      <div class="events-empty">
        <div class="empty-icon">📭</div>
        <p>No events analyzed yet</p>
        <p class="hint">Analyze your first event to see it here</p>
      </div>
    `;
    return;
  }
  
  tableHeader?.classList.remove('hidden');
  
  // Render pending events first (at the top)
  const pendingHtml = pendingList.map(pending => {
    const titleFromUrl = pending.title || pending.url;
    return `
      <div class="event-row event-row-pending" data-url="${escapeHtml(pending.url)}" data-pending="true">
        <div class="col-name">
          <div class="event-row-title">
            <span class="pending-spinner"></span>
            ${escapeHtml(titleFromUrl)}
          </div>
          <div class="event-row-location">Analyzing...</div>
        </div>
        <div class="col-date">-</div>
        <div class="col-attendees">
          <span class="pending-spinner"></span>
        </div>
        <div class="col-targets">-</div>
        <div class="col-roi">-</div>
        <div class="col-actions">-</div>
      </div>
    `;
  }).join('');
  
  // Render completed events
  const eventsHtml = events.map(event => {
    const people = event.people || [];
    const targetCount = people.filter(p => isTargetPersona(p)).length;
    const estimatedAttendees = event.estimatedAttendees || null;
    const roi = calculateEventROI(event);
    const roiText = roi > 0 ? `$${formatNumber(roi)}` : '-';
    const attendeesText = estimatedAttendees ? `~${estimatedAttendees.toLocaleString()}` : (people.length > 0 ? `${people.length}` : '-');
    const dateDisplay = formatEventDateDisplay(event);
    
    return `
      <div class="event-row" data-url="${escapeHtml(event.url)}">
        <div class="col-name">
          <div class="event-row-title">${escapeHtml(event.eventName || 'Unknown Event')}</div>
          <div class="event-row-location">${escapeHtml(event.location || '')}</div>
        </div>
        <div class="col-date">${escapeHtml(dateDisplay)}</div>
        <div class="col-attendees">${attendeesText}</div>
        <div class="col-targets">${targetCount > 0 ? `<span class="target-highlight">${targetCount}</span>` : '-'}</div>
        <div class="col-roi ${roi > 0 ? 'roi-positive' : ''}">${roiText}</div>
        <div class="col-actions">
          <button class="btn-icon edit-event-btn" title="Edit">✏️</button>
          <button class="btn-icon delete-event-btn delete-btn-red" title="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = pendingHtml + eventsHtml;
  
  // Add event handlers (only for non-pending rows)
  container.querySelectorAll('.event-row:not([data-pending])').forEach(row => {
    const url = row.dataset.url;
    
    row.querySelector('.edit-event-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditEventModal(url);
    });
    
    row.querySelector('.delete-event-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this event analysis?')) {
        await deleteEvent(url);
        updateEventsCount();
        renderEventsIndex();
        showToast('Event deleted');
      }
    });
    
    // Click anywhere on row to view
    row.addEventListener('click', () => viewEventDetails(url));
  });
}

// Edit Event Modal
let editingEventUrl = null;

function openEditEventModal(url) {
  const event = getEventByUrl(url);
  if (!event) return;
  
  editingEventUrl = url;
  const modal = document.getElementById('edit-event-modal');
  const textarea = document.getElementById('edit-event-json');
  const errorDiv = document.getElementById('edit-event-error');
  
  // Format JSON nicely for editing
  textarea.value = JSON.stringify(event, null, 2);
  errorDiv.classList.add('hidden');
  modal.classList.remove('hidden');
}

function closeEditEventModal() {
  const modal = document.getElementById('edit-event-modal');
  modal.classList.add('hidden');
  editingEventUrl = null;
}

async function saveEditedEvent() {
  const textarea = document.getElementById('edit-event-json');
  const errorDiv = document.getElementById('edit-event-error');
  
  try {
    const editedData = JSON.parse(textarea.value);
    
    // Validate it has minimum required fields
    if (!editedData.eventName) {
      throw new Error('Event must have an eventName');
    }
    
    // Save the edited event
    const eventKey = normalizeUrl(editingEventUrl);
    savedEvents[eventKey] = {
      ...editedData,
      url: editingEventUrl,
      lastEdited: new Date().toISOString()
    };
    
    await new Promise(resolve => {
      chrome.storage.local.set({ savedEvents }, resolve);
    });
    
    closeEditEventModal();
    renderEventsIndex();
    showToast('Event updated!');
  } catch (err) {
    errorDiv.textContent = `Invalid JSON: ${err.message}`;
    errorDiv.classList.remove('hidden');
  }
}

// Edit modal event listeners
document.getElementById('edit-event-modal-close')?.addEventListener('click', closeEditEventModal);
document.getElementById('edit-event-cancel')?.addEventListener('click', closeEditEventModal);
document.getElementById('edit-event-save')?.addEventListener('click', saveEditedEvent);

// Close modal on backdrop click
document.getElementById('edit-event-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'edit-event-modal') {
    closeEditEventModal();
  }
});

function exportEventsAsCSV() {
  const events = Object.values(savedEvents);
  if (events.length === 0) {
    showToast('No events to export');
    return;
  }
  
  const rows = [];
  rows.push(['Event Name', 'Event Date', 'Location', 'URL', 'Est. Attendees', 'Named People', 'Target Count', 'Sponsor Count', 'Est. ROI', 'Analyzed Date']);
  
  events.forEach(event => {
    const people = event.people || [];
    const targetCount = people.filter(p => isTargetPersona(p)).length;
    const sponsorCount = (event.sponsors || []).length;
    const roi = calculateEventROI(event);
    const analyzedDate = event.analyzedAt ? new Date(event.analyzedAt).toLocaleDateString() : '';
    
    rows.push([
      event.eventName || '',
      event.date || '',
      event.location || '',
      event.url || '',
      event.estimatedAttendees || '',
      people.length,
      targetCount,
      sponsorCount,
      roi > 0 ? roi.toFixed(0) : '',
      analyzedDate
    ]);
  });
  
  const csvContent = rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `conference_intel_events_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('Events exported!');
}

function viewEventDetails(url) {
  // Open the URL in a new tab and navigate to current page view
  chrome.tabs.create({ url: url, active: true }, () => {
    // Navigate to current page view - the cached analysis will load automatically
    showCurrentPageView();
  });
}

function showSavedEventBanner(url, eventName) {
  // Hide the normal current page info and analyze buttons
  document.querySelector('.current-page')?.classList.add('hidden');
  document.getElementById('reanalyze-fresh-btn')?.classList.add('hidden');
  document.getElementById('analyze-btn')?.classList.add('hidden');
  document.getElementById('share-btn-header')?.classList.add('hidden');
  
  // Also hide the empty state since we're showing results
  document.getElementById('empty-state')?.classList.add('hidden');
  
  // Show or create the saved event banner
  let banner = document.getElementById('saved-event-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'saved-event-banner';
    banner.className = 'saved-event-banner';
    const actionsDiv = document.querySelector('#current-page-view .actions');
    actionsDiv?.parentNode.insertBefore(banner, actionsDiv);
  }
  
  try {
    const urlObj = new URL(url);
    const displayUrl = urlObj.hostname + urlObj.pathname;
    banner.innerHTML = `
      <div class="saved-banner-content">
        <span class="saved-banner-header">📋 Viewing saved event</span>
        <span class="saved-banner-url">${escapeHtml(displayUrl)}</span>
      </div>
      <div class="saved-banner-actions">
        <button id="open-event-url-btn" class="btn primary small">🔗 Open This Page</button>
        <button id="share-btn-banner" class="share-btn">📤 Share</button>
      </div>
    `;
    banner.classList.remove('hidden');
    
    document.getElementById('open-event-url-btn')?.addEventListener('click', () => {
      chrome.tabs.update({ url: url });
    });
    document.getElementById('share-btn-banner')?.addEventListener('click', openShareModal);
  } catch (e) {
    banner.innerHTML = `<div class="saved-banner-header">📋 Viewing saved event</div>`;
  }
}

function hideSavedEventBanner() {
  document.getElementById('saved-event-banner')?.classList.add('hidden');
  document.querySelector('.current-page')?.classList.remove('hidden');
}

// Mode Selection Event Listeners
selectProBtn?.addEventListener('click', async () => {
  // Use embedded Pro API key
  userProfile.geminiApiKey = PRO_API_KEY;
  onboardingUsedProKey = true;
  await saveProfile(userProfile);
  showOnboardingStep(2); // Go directly to company profile
});

selectByokBtn?.addEventListener('click', () => {
  onboardingUsedProKey = false;
  showOnboardingStep(1); // Go to API key input
});

selectPreviewBtn?.addEventListener('click', () => {
  showOnboardingStep('preview'); // Show demo profile selection
});

// Import from mode selection screen
selectImportBtn?.addEventListener('click', () => importFileInputMode?.click());
importFileInputMode?.addEventListener('change', handleImportProfile);

// Demo profile card clicks
document.querySelectorAll('.demo-profile-card').forEach(card => {
  card.addEventListener('click', async () => {
    const profileKey = card.dataset.profile;
    if (profileKey && DEMO_PROFILES[profileKey]) {
      await loadDemoProfile(profileKey);
    }
  });
});

async function loadDemoProfile(profileKey) {
  const profilePath = DEMO_PROFILES[profileKey];
  if (!profilePath) return;
  
  try {
    // Load the profile from the extension's bundled files
    const url = chrome.runtime.getURL(profilePath);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load profile');
    
    const imported = await response.json();
    
    // Merge with defaults to ensure all fields exist, mark as demo mode
    userProfile = { ...defaultProfile, ...imported, onboardingComplete: true, isDemoMode: true, demoProfileKey: profileKey };
    await saveProfile(userProfile);
    updateProfileIndicator();
    showToast('Demo profile loaded!');
    showMainSection();
    updateCurrentUrl();
  } catch (err) {
    console.error('Failed to load demo profile:', err);
    showToast('Failed to load demo profile');
  }
}

// Onboarding Event Listeners
onboardingPreviewBack?.addEventListener('click', () => showOnboardingStep('mode'));
onboardingApiBack?.addEventListener('click', () => showOnboardingStep('mode'));

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

onboardingCompanyBack.addEventListener('click', () => {
  // Go back to API key step if BYOK, or mode selection if Pro
  if (onboardingUsedProKey) {
    showOnboardingStep('mode');
  } else {
    showOnboardingStep(1);
  }
});

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

// Record Toggle Button
recordToggleBtn.addEventListener('click', () => {
  recordToggleBtn.classList.toggle('active');
});

// Settings Section
settingsBtn.addEventListener('click', () => {
  populateSettingsModal();
  mainSection.classList.add('hidden');
  headerNav?.classList.add('hidden');
  settingsSection.classList.remove('hidden');
  pushToHistory('settings');
});

settingsBackBtn.addEventListener('click', () => {
  navigateBack();
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
  headerNav?.classList.remove('hidden');
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
      peopleDisplayCount = 3;
      
      // Clear navigation history
      navigationHistory = [];
      historyIndex = -1;
      updateNavButtons();
      
      // Hide all sections and show onboarding mode selection
      settingsSection.classList.add('hidden');
      mainSection.classList.add('hidden');
      headerNav?.classList.add('hidden');
      onboardingMode.classList.remove('hidden');
      onboardingPreview.classList.add('hidden');
      onboardingApi.classList.add('hidden');
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
chrome.tabs.onActivated.addListener(async () => {
  resetCurrentPageState(); // Reset UI for new page
  await updateCurrentUrl();
  showCurrentPageView(); // Switch to current page view
  await checkForCachedAnalysis();
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    resetCurrentPageState(); // Reset UI for new page
    await updateCurrentUrl();
    showCurrentPageView(); // Switch to current page view
    const hasCached = await checkForCachedAnalysis();
    
    // Auto-analyze if toggle is active, no cached results, and URL not already skipped
    if (!hasCached && !isUrlSkipped(changeInfo.url) && recordToggleBtn.classList.contains('active')) {
      // Small delay to let page load
      setTimeout(() => {
        runAnalysis();
      }, 500);
    }
  }
});

// URLs to ignore when updating current page (user is researching, not viewing events)
const IGNORED_URL_PATTERNS = [
  /^https:\/\/www\.linkedin\.com\/search\/results\/people\//,
  /^https:\/\/www\.linkedin\.com\/in\//,
  /^https:\/\/([a-z]+\.)?google\.com\//,
  /^https:\/\/maps\.google\.com\//,
  /^https:\/\/www\.google\.com\/maps\//
];

function shouldIgnoreUrl(url) {
  return IGNORED_URL_PATTERNS.some(pattern => pattern.test(url));
}

// Truncate URL for display: show domain + truncated path, drop params
function truncateUrlForDisplay(fullUrl, maxLength = 45) {
  try {
    const url = new URL(fullUrl);
    const domain = url.hostname;
    const path = url.pathname;
    
    // Full display without params
    const fullDisplay = domain + path;
    
    if (fullDisplay.length <= maxLength) {
      return fullDisplay;
    }
    
    // Need to truncate - keep domain and end of path
    const ellipsis = '/...';
    const availableForPath = maxLength - domain.length - ellipsis.length;
    
    if (availableForPath <= 10) {
      // Not enough room, just truncate the end
      return fullDisplay.substring(0, maxLength - 3) + '...';
    }
    
    // Show end of path (the filename/page part is usually most important)
    const pathEnd = path.substring(path.length - availableForPath);
    return domain + ellipsis + pathEnd;
  } catch (e) {
    // Fallback for invalid URLs
    if (fullUrl.length <= maxLength) return fullUrl;
    return fullUrl.substring(0, maxLength - 3) + '...';
  }
}

async function updateCurrentUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      // Skip updating if user is on a LinkedIn research page
      if (shouldIgnoreUrl(tab.url)) {
        return; // Keep the previous URL displayed
      }
      currentTabUrl = tab.url;
      currentUrlSpan.textContent = truncateUrlForDisplay(tab.url);
      currentUrlSpan.title = tab.url; // Full URL on hover
    }
  } catch (e) {
    currentUrlSpan.textContent = 'Unable to get URL';
    currentUrlSpan.title = '';
  }
}

// UI State Management
let analysisStepInterval = null;

const ANALYSIS_STEPS = ['event', 'people', 'sponsors', 'personas', 'insights', 'actions', 'related'];

// Reset current page view to initial empty state (for new page navigation)
function resetCurrentPageState() {
  // Hide all states
  loadingDiv.classList.add('hidden');
  resultsDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');
  emptyState.classList.remove('hidden'); // Show empty state ready for analysis
  
  // Reset buttons
  analyzeBtn.disabled = false;
  document.getElementById('analyzing-spinner')?.classList.add('hidden');
  document.getElementById('reanalyze-fresh-btn')?.classList.add('hidden');
  document.getElementById('share-btn-header')?.classList.add('hidden');
  
  // Stop any ongoing progress animation
  stopAnalysisProgress();
  
  // Reset progress steps to pending
  const steps = document.querySelectorAll('.analysis-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed');
    step.classList.add('pending');
    const indicator = step.querySelector('.step-indicator');
    if (indicator) indicator.textContent = '○';
  });
  
  // Clear current analysis data
  currentAnalysisData = null;
}

function showLoading() {
  loadingDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');
  emptyState.classList.add('hidden');
  analyzeBtn.disabled = true;
  
  // Show inline analyzing spinner
  document.getElementById('analyzing-spinner')?.classList.remove('hidden');
  document.getElementById('reanalyze-fresh-btn')?.classList.add('hidden');
  document.getElementById('share-btn-header')?.classList.add('hidden');
  
  // Start the fake progress animation
  startAnalysisProgress();
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
  analyzeBtn.disabled = false;
  
  // Hide inline analyzing spinner
  document.getElementById('analyzing-spinner')?.classList.add('hidden');
  
  // Stop the progress animation
  stopAnalysisProgress();
}

function startAnalysisProgress() {
  // Reset all steps to pending
  const steps = document.querySelectorAll('.analysis-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed');
    step.classList.add('pending');
    const indicator = step.querySelector('.step-indicator');
    if (indicator) indicator.textContent = '○';
  });
  
  let currentStepIndex = 0;
  const sequentialSteps = ANALYSIS_STEPS.slice(0, 3); // First 3 are sequential
  const parallelSteps = ANALYSIS_STEPS.slice(3); // Remaining complete in random order
  
  function markStepActive(stepName) {
    const stepEl = document.querySelector(`.analysis-step[data-step="${stepName}"]`);
    if (stepEl) {
      stepEl.classList.remove('pending');
      stepEl.classList.add('active');
    }
  }
  
  function markStepCompleted(stepName) {
    const stepEl = document.querySelector(`.analysis-step[data-step="${stepName}"]`);
    if (stepEl) {
      stepEl.classList.remove('active', 'pending');
      stepEl.classList.add('completed');
      const indicator = stepEl.querySelector('.step-indicator');
      if (indicator) indicator.textContent = '✓';
    }
  }
  
  function advanceSequentialStep() {
    if (currentStepIndex >= sequentialSteps.length) {
      // Sequential steps done, start parallel steps
      startParallelSteps();
      return;
    }
    
    const stepName = sequentialSteps[currentStepIndex];
    markStepActive(stepName);
    
    // Random delay between 1600ms and 4000ms for sequential steps
    const delay = 1600 + Math.random() * 2400;
    
    analysisStepInterval = setTimeout(() => {
      markStepCompleted(stepName);
      currentStepIndex++;
      advanceSequentialStep();
    }, delay);
  }
  
  function startParallelSteps() {
    // Shuffle the parallel steps to complete in random order
    const shuffled = [...parallelSteps].sort(() => Math.random() - 0.5);
    
    // Generate delays with distribution: more sooner, fewer later, one at 10s
    // Use exponential-ish distribution for first N-1 steps, last one always 10s
    const delays = [];
    for (let i = 0; i < shuffled.length - 1; i++) {
      // Exponential distribution favoring earlier times (0-10 seconds)
      // More weight toward lower values
      const r = Math.random();
      const delay = Math.pow(r, 0.5) * 10000; // Sqrt gives more weight to lower values
      delays.push(delay);
    }
    // Last step always takes ~18-20 seconds
    delays.push(18000 + Math.random() * 2000);
    
    // Mark all parallel steps as active immediately
    shuffled.forEach(stepName => markStepActive(stepName));
    
    // Schedule each step to complete at its delay
    shuffled.forEach((stepName, index) => {
      setTimeout(() => {
        markStepCompleted(stepName);
      }, delays[index]);
    });
  }
  
  // Start first sequential step after a brief delay
  setTimeout(advanceSequentialStep, 600);
}

function stopAnalysisProgress() {
  if (analysisStepInterval) {
    clearTimeout(analysisStepInterval);
    analysisStepInterval = null;
  }
  
  // Mark all remaining steps as completed
  const steps = document.querySelectorAll('.analysis-step');
  steps.forEach(step => {
    step.classList.remove('pending', 'active');
    step.classList.add('completed');
    const indicator = step.querySelector('.step-indicator');
    if (indicator) indicator.textContent = '✓';
  });
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

function showError(message, showOverride = false) {
  hideLoading();
  errorDiv.classList.remove('hidden');
  emptyState.classList.add('hidden');
  errorDiv.querySelector('.error-message').textContent = message;
  
  // Show/hide the override button
  const overrideBtn = document.getElementById('override-analyze-btn');
  if (overrideBtn) {
    overrideBtn.classList.toggle('hidden', !showOverride);
  }
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

// Reanalyze fresh button (for cached results)
document.getElementById('reanalyze-fresh-btn')?.addEventListener('click', runAnalysis);

// Override button to force analysis
document.getElementById('override-analyze-btn')?.addEventListener('click', runAnalysisForced);

async function runAnalysis() {
  // Show loading while we run pre-check
  showLoading();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    // Check if this URL was already determined to not be an event
    if (isUrlSkipped(tab.url)) {
      hideLoading();
      showError('📄 This page was already checked and is not an event. Navigate to an event page to analyze it.', true);
      return;
    }
    
    // Always run pre-check when user clicks analyze (if not already done for this URL)
    if (!lastPreCheckResult || lastPreCheckUrl !== currentTabUrl) {
      // Get page content for pre-check
      const [{ result: textContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText
      });
      
      if (textContent) {
        const preCheckResult = await chrome.runtime.sendMessage({
          action: 'preCheckEvent',
          content: textContent,
          url: tab.url,
          title: tab.title,
          userProfile: userProfile
        });
        
        lastPreCheckResult = preCheckResult;
        lastPreCheckUrl = tab.url;
        console.log('Pre-check result:', preCheckResult);
      }
    }
    
    // Check pre-check result
    if (lastPreCheckResult) {
      if (lastPreCheckResult.isEvent === false || lastPreCheckResult.confidence !== 'high') {
        // Save this URL as a non-event so we don't re-check it
        await saveSkippedUrl(tab.url, 'not-event');
        console.log('Saved as skipped URL:', tab.url);
        
        hideLoading();
        showError('📄 This page is not an event. Navigate to an event page to analyze it.', true);
        return;
      }
    }
    
    // Pre-check passed, run full analysis
    await runFullAnalysis(tab);
    
  } catch (error) {
    console.error('Analysis error:', error);
    // Show override button for parse failures
    const showOverride = error.message?.includes('Failed to parse') || error.message?.includes('not an event');
    showError(error.message || 'Failed to analyze event. Please try again.', showOverride);
  }
}

// Force analysis without pre-check (override button)
async function runAnalysisForced() {
  showLoading();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    await runFullAnalysis(tab);
    
  } catch (error) {
    console.error('Analysis error:', error);
    // Show override button for parse failures
    const showOverride = error.message?.includes('Failed to parse') || error.message?.includes('not an event');
    showError(error.message || 'Failed to analyze event. Please try again.', showOverride);
  }
}

// The actual analysis logic
async function runFullAnalysis(tab) {
  // Hide reanalyze and share buttons during fresh analysis
  document.getElementById('reanalyze-fresh-btn')?.classList.add('hidden');
  document.getElementById('share-btn-header')?.classList.add('hidden');
  
  // Add to pending analyses so it shows in the events list
  const eventKey = normalizeUrl(tab.url);
  pendingAnalyses[eventKey] = {
    url: tab.url,
    title: tab.title,
    startedAt: new Date().toISOString()
  };
  // Re-render events list to show pending item
  if (document.getElementById('events-index-view')?.classList.contains('hidden') === false) {
    renderEventsIndex();
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
    delete pendingAnalyses[eventKey];
    throw new Error('Could not extract page content. Make sure you\'re on an event page.');
  }
  
  const result = await chrome.runtime.sendMessage({
    action: 'analyzeEvent',
    content: response.content,
    url: tab.url,
    title: tab.title,
    userProfile: userProfile
  });
  
  // Remove from pending
  delete pendingAnalyses[eventKey];
  
  if (result.error) {
    // Re-render events list to remove pending item
    renderEventsIndex();
    throw new Error(result.error);
  }
  
  // Save the analysis
  await saveEvent(tab.url, result.data);
  updateEventsCount();
  
  // Re-render events list to show completed event
  renderEventsIndex();
  
  // Hide analyze button, show cached indicator and share button after successful analysis
  document.getElementById('analyze-btn')?.classList.add('hidden');
  document.getElementById('reanalyze-fresh-btn')?.classList.remove('hidden');
  document.getElementById('share-btn-header')?.classList.remove('hidden');
  
  showResults(result.data);
  showToast('Event analyzed and saved!');
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
  downloadCSV(currentAnalysisData);
});

// Export All button
if (exportAllBtn) {
  exportAllBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    downloadCSV(currentAnalysisData);
  });
}

// Integrations Modal
const integrateBtn = document.getElementById('integrate-btn');
const integrationsModal = document.getElementById('integrations-modal');
const closeIntegrationsModal = document.getElementById('close-integrations-modal');
const exportCsvModal = document.getElementById('export-csv-modal');

if (integrateBtn) {
  integrateBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    integrationsModal?.classList.remove('hidden');
  });
}

if (closeIntegrationsModal) {
  closeIntegrationsModal.addEventListener('click', () => {
    integrationsModal?.classList.add('hidden');
  });
}

// Close modal on backdrop click
integrationsModal?.addEventListener('click', (e) => {
  if (e.target === integrationsModal) {
    integrationsModal.classList.add('hidden');
  }
});

// CSV export from modal
if (exportCsvModal) {
  exportCsvModal.addEventListener('click', () => {
    // Check if we're in all-people export mode
    if (window.exportAllPeopleMode) {
      downloadAllPeopleCSV();
      window.exportAllPeopleMode = false;
    } else {
      if (!currentAnalysisData) return;
      downloadCSV(currentAnalysisData);
    }
    integrationsModal?.classList.add('hidden');
    showToast('CSV exported successfully!');
  });
}

// Reset export mode when modal is closed
if (closeIntegrationsModal) {
  const originalHandler = closeIntegrationsModal.onclick;
  closeIntegrationsModal.addEventListener('click', () => {
    window.exportAllPeopleMode = false;
  });
}

// Integration item click handler (for coming soon items)
document.querySelectorAll('.integration-chip[data-integration]').forEach(item => {
  item.addEventListener('click', () => {
    const integration = item.dataset.integration;
    if (integration === 'mobly') {
      showToast('🎉 Mobly integration coming soon! Stay tuned.');
    } else {
      showToast(`${item.textContent.replace('*', '').trim()} integration coming soon!`);
    }
  });
});

// Row "more" buttons
document.querySelectorAll('.row-more-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.category;
    const row = document.querySelector(`.integrations-row[data-category="${category}"]`);
    if (row) {
      row.querySelectorAll('.hidden-chip').forEach(chip => {
        chip.classList.add('show');
      });
      btn.classList.add('hidden');
    }
  });
});


// Generate and download CSV
function downloadCSV(data) {
  const rows = [];
  
  rows.push(['Target', 'Role', 'Persona', 'Name', 'Title', 'Company', 'LinkedIn', 'LinkedIn Message', 'Ice Breaker', 'Event', 'Date', 'Location']);
  
  let people = data.people || data.speakers || [];
  
  // Sort: targets first
  people = [...people].sort((a, b) => {
    const aTarget = isTargetPersona(a) ? 0 : 1;
    const bTarget = isTargetPersona(b) ? 0 : 1;
    return aTarget - bTarget;
  });
  
  if (people.length > 0) {
    people.forEach(person => {
      rows.push([
        isTargetPersona(person) ? 'Yes' : 'No',
        person.role || 'Unknown',
        person.persona || '',
        person.name || '',
        person.title || '',
        person.company || '',
        person.linkedin || generateLinkedInSearch(person.name, person.company),
        person.linkedinMessage || '',
        person.iceBreaker || '',
        data.eventName || '',
        data.date || '',
        data.location || ''
      ]);
    });
  }
  
  if (data.sponsors && data.sponsors.length > 0) {
    data.sponsors.forEach(sponsor => {
      rows.push([
        isCompetitorCompany(sponsor.name) ? 'Competitor' : 'No',
        sponsor.tier ? `${sponsor.tier} Sponsor` : 'Sponsor',
        'Sponsor',
        sponsor.name || '',
        '',
        sponsor.name || '',
        '',
        '',
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
  link.setAttribute('download', `${sanitizeFilename(data.eventName || 'event')}_contacts.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('CSV downloaded!');
}

// Download all people from all events as CSV
function downloadAllPeopleCSV() {
  const events = Object.values(savedEvents);
  if (events.length === 0) {
    showToast('No events to export');
    return;
  }
  
  const rows = [];
  rows.push(['Target', 'Role', 'Persona', 'Name', 'Title', 'Company', 'LinkedIn', 'LinkedIn Message', 'Ice Breaker', 'Event', 'Date', 'Location']);
  
  // Gather all people from all events
  const allPeople = [];
  events.forEach(event => {
    const people = event.people || [];
    people.forEach(person => {
      allPeople.push({
        ...person,
        eventName: event.eventName,
        eventDate: event.date,
        eventLocation: event.location
      });
    });
  });
  
  if (allPeople.length === 0) {
    showToast('No people to export');
    return;
  }
  
  // Sort: targets first
  allPeople.sort((a, b) => {
    const aTarget = isTargetPersona(a) ? 0 : 1;
    const bTarget = isTargetPersona(b) ? 0 : 1;
    return aTarget - bTarget;
  });
  
  allPeople.forEach(person => {
    rows.push([
      isTargetPersona(person) ? 'Yes' : 'No',
      person.role || 'Unknown',
      person.persona || '',
      person.name || '',
      person.title || '',
      person.company || '',
      person.linkedin || generateLinkedInSearch(person.name, person.company),
      person.linkedinMessage || '',
      person.iceBreaker || '',
      person.eventName || '',
      person.eventDate || '',
      person.eventLocation || ''
    ]);
  });
  
  const csvContent = rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `all_people_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast(`Exported ${allPeople.length} people from ${events.length} events!`);
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
  
  // Reset people display count when rendering new results
  peopleDisplayCount = 5;
  
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
      <span class="value">${data.location ? `<a href="https://www.google.com/maps/search/${encodeURIComponent(data.location)}" target="_blank" class="location-link">${escapeHtml(data.location)} 📍</a>` : 'Not found'}</span>
    </div>
    ${data.estimatedAttendees ? `
    <div class="event-detail">
      <span class="label">Attendees:</span>
      <span class="value">${data.estimatedAttendees.toLocaleString()}</span>
    </div>
    ` : ''}
    ${data.description ? `
    <div class="event-detail">
      <span class="label">About:</span>
      <span class="value">${escapeHtml(data.description)}</span>
    </div>
    ` : ''}
  `;
  document.getElementById('event-overview').innerHTML = overviewHtml;

  // People
  renderPeopleList(data, people);

  // Sponsors
  const sponsorsContainer = document.getElementById('sponsors-list');
  const sponsorsCount = document.getElementById('sponsors-count');
  if (data.sponsors && data.sponsors.length > 0) {
    sponsorsCount.textContent = `(${data.sponsors.length})`;
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
    sponsorsCount.textContent = '(0)';
    sponsorsContainer.innerHTML = '<p class="empty-state-small">No sponsors found</p>';
  }

  // Related Events
  renderRelatedEvents(data);
}

function renderRelatedEvents(data) {
  const card = document.getElementById('related-events-card');
  const container = document.getElementById('related-events-list');
  
  console.log('renderRelatedEvents called with data:', data);
  console.log('relatedEvents:', data.relatedEvents);
  console.log('card element:', card);
  console.log('container element:', container);
  
  if (!card || !container) {
    console.error('Related events elements not found!');
    return;
  }

  const relatedEvents = data.relatedEvents || [];
  console.log('relatedEvents array length:', relatedEvents.length);
  
  if (relatedEvents.length > 0) {
    card.classList.remove('hidden');
    container.innerHTML = relatedEvents.map(event => `
      <div class="related-event-item">
        <a href="${escapeHtml(event.url || '#')}" target="_blank" class="related-event-link">
          <div class="related-event-name">${escapeHtml(event.name || 'Unknown Event')}</div>
          ${event.date ? `<div class="related-event-date">📅 ${escapeHtml(event.date)}</div>` : ''}
          ${event.relevance ? `<div class="related-event-relevance">${escapeHtml(event.relevance)}</div>` : ''}
        </a>
      </div>
    `).join('');
    console.log('Related events rendered successfully');
  } else {
    console.log('No related events to display, hiding card');
    card.classList.add('hidden');
  }
}

let currentActionIndex = 0;
let currentActions = [];

function renderNextActions(data) {
  const container = document.getElementById('next-actions');
  const nextBtn = document.getElementById('next-action-btn');
  if (!container) return;
  
  currentActions = data.nextBestActions || [];
  currentActionIndex = 0;
  
  if (currentActions.length > 0) {
    renderCurrentAction();
    if (nextBtn) {
      nextBtn.classList.toggle('hidden', currentActions.length <= 1);
    }
  } else {
    container.innerHTML = '<p class="empty-state-small">No actions available</p>';
    if (nextBtn) nextBtn.classList.add('hidden');
  }
}

function renderCurrentAction(animate = false) {
  const container = document.getElementById('next-actions');
  const card = document.getElementById('next-action-card');
  if (!container || currentActions.length === 0) return;
  
  const action = currentActions[currentActionIndex];
  const total = currentActions.length;
  
  // Add slide-in animation to card
  if (animate && card) {
    card.classList.add('slide-in-right');
    setTimeout(() => card.classList.remove('slide-in-right'), 300);
  }
  
  container.innerHTML = `
    <div class="action-item-clean">
      <label class="action-checkbox-wrapper">
        <input type="checkbox" class="action-checkbox" data-action-index="${currentActionIndex}">
        <span class="action-checkmark"></span>
      </label>
      <div class="action-text-bold">${escapeHtml(action.action)}</div>
    </div>
    ${total > 1 ? `
    <div class="action-progress">
      ${Array.from({length: total}, (_, i) => 
        `<span class="progress-dot ${i === currentActionIndex ? 'active' : ''} ${i < currentActionIndex ? 'done' : ''}"></span>`
      ).join('')}
    </div>
    ` : ''}
  `;
  
  // Add checkbox event listener
  const checkbox = container.querySelector('.action-checkbox');
  const actionItem = container.querySelector('.action-item-clean');
  
  const completeAction = () => {
    if (checkbox.checked) return; // Already completed
    checkbox.checked = true;
    triggerFireworks();
    // Transition to next after fireworks start
    if (currentActions.length > 1) {
      const card = document.getElementById('next-action-card');
      card?.classList.add('slide-out-left');
      
      setTimeout(() => {
        card?.classList.remove('slide-out-left');
        currentActionIndex = (currentActionIndex + 1) % currentActions.length;
        renderCurrentAction(true);
      }, 300);
    } else {
      actionItem?.classList.add('completed');
    }
  };
  
  checkbox?.addEventListener('change', (e) => {
    if (e.target.checked) {
      completeAction();
    }
  });
  
  // Clicking anywhere on the action item marks it complete
  actionItem?.addEventListener('click', (e) => {
    if (e.target !== checkbox) {
      completeAction();
    }
  });
}

document.getElementById('next-action-btn')?.addEventListener('click', () => {
  if (currentActions.length > 1) {
    const card = document.getElementById('next-action-card');
    
    if (card) {
      card.classList.add('slide-out-left');
      
      setTimeout(() => {
        card.classList.remove('slide-out-left');
        currentActionIndex = (currentActionIndex + 1) % currentActions.length;
        renderCurrentAction(true);
      }, 300);
    }
  }
});

// Fireworks animation for completing actions
function triggerFireworks() {
  const container = document.body;
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#fbbf24'];
  const particleCount = 40;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${20 + Math.random() * 60}%`;
    particle.style.setProperty('--drift', `${(Math.random() - 0.5) * 150}px`);
    particle.style.setProperty('--height', `${250 + Math.random() * 200}px`);
    particle.style.animationDelay = `${Math.random() * 0.4}s`;
    particle.style.animationDuration = `${0.7 + Math.random() * 0.4}s`;
    particle.style.width = `${6 + Math.random() * 6}px`;
    particle.style.height = particle.style.width;
    container.appendChild(particle);
    
    setTimeout(() => particle.remove(), 1500);
  }
}

let showAllPersonas = false;

function renderPersonas(data) {
  const container = document.getElementById('personas-list');
  if (!container) return;
  
  if (data.expectedPersonas && data.expectedPersonas.length > 0) {
    const allPersonas = data.expectedPersonas;
    const displayLimit = 3;
    const hasMore = allPersonas.length > displayLimit;
    const personasToShow = showAllPersonas ? allPersonas : allPersonas.slice(0, displayLimit);
    
    container.innerHTML = personasToShow.map((p, index) => `
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
    
    // Add show more/less button if needed
    if (hasMore) {
      container.innerHTML += `
        <button class="show-more-btn" id="toggle-personas-btn">
          ${showAllPersonas ? 'Show Less ↑' : `Show ${allPersonas.length - displayLimit} More ↓`}
        </button>
      `;
      
      document.getElementById('toggle-personas-btn')?.addEventListener('click', () => {
        showAllPersonas = !showAllPersonas;
        renderPersonas(data);
      });
    }
    
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

function renderPeopleList(data, people) {
  const peopleContainer = document.getElementById('people-list');
  const peopleCount = document.getElementById('people-count');
  
  if (people.length === 0) {
    peopleCount.textContent = '(0)';
    peopleContainer.innerHTML = '<p class="empty-state-small">No people found</p>';
    return;
  }
  
  // Sort people: targets first, then others
  const sorted = [...people].sort((a, b) => {
    const aTarget = isTargetPersona(a) ? 0 : 1;
    const bTarget = isTargetPersona(b) ? 0 : 1;
    return aTarget - bTarget;
  });
  
  // Get count of targets
  const targetCount = sorted.filter(p => isTargetPersona(p)).length;
  
  // Determine how many to show
  const showCount = Math.min(peopleDisplayCount, sorted.length);
  const displayPeople = sorted.slice(0, showCount);
  
  peopleCount.textContent = targetCount > 0 ? `(${targetCount}/${people.length})` : `(${people.length})`;
  
  let html = displayPeople.map((person, index) => {
    const linkedinUrl = person.linkedin || generateLinkedInSearch(person.name, person.company);
    const hasDirectLinkedin = !!person.linkedin;
    const linkedinText = hasDirectLinkedin ? 'Open LinkedIn Profile' : 'Search on LinkedIn';
    const isTarget = isTargetPersona(person);
    
    // Only show fields that have real values (not "Unknown")
    const hasTitle = person.title && person.title.toLowerCase() !== 'unknown';
    const hasCompany = person.company && person.company.toLowerCase() !== 'unknown';
    const hasPersona = person.persona && person.persona.toLowerCase() !== 'unknown';
    const hasRole = person.role && person.role.toLowerCase() !== 'unknown';
    
    // Build persona/role line
    let personaRoleLine = '';
    if (hasPersona || hasRole) {
      const parts = [];
      if (hasPersona) parts.push(escapeHtml(person.persona));
      if (hasRole) parts.push(escapeHtml(person.role));
      personaRoleLine = `<div class="person-persona">👤 ${parts.join(' | ')}</div>`;
    }
    
    return `
    <div class="person-item ${isTarget ? 'target-match' : ''}" data-person-index="${index}">
      <div class="person-avatar">${getInitials(person.name)}</div>
      <div class="person-info">
        <div class="person-name-row">
          ${hasDirectLinkedin 
            ? `<a href="${linkedinUrl}" target="_blank" class="person-name-link">${escapeHtml(person.name)}</a>`
            : `<span class="person-name">${escapeHtml(person.name)}</span>`
          }
          <a href="${linkedinUrl}" target="_blank" class="linkedin-icon-link" title="${linkedinText}">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#0077b5">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
          </a>
          ${!hasDirectLinkedin ? `<a href="${linkedinUrl}" target="_blank" class="search-linkedin-label">[Search LinkedIn]</a>` : ''}
        </div>
        ${hasTitle ? `<div class="person-title">${escapeHtml(person.title)}</div>` : ''}
        ${hasCompany ? `<div class="person-company">${escapeHtml(person.company)}</div>` : ''}
        ${personaRoleLine}
        
        <div class="person-actions-box">
          ${person.linkedinMessage ? `
            <div class="action-message linkedin-msg">
              <div class="action-header">
                <span class="action-title">LinkedIn Request</span>
                <button class="copy-btn-small" data-copy="${escapeHtml(person.linkedinMessage)}">📋</button>
              </div>
              <div class="action-text">${escapeHtml(person.linkedinMessage)}</div>
            </div>
          ` : ''}
          ${person.iceBreaker ? `
            <div class="action-message ice-breaker">
              <div class="action-header">
                <span class="action-title">In-Person Opener</span>
                <button class="copy-btn-small" data-copy="${escapeHtml(person.iceBreaker)}">📋</button>
              </div>
              <div class="action-text">${escapeHtml(person.iceBreaker)}</div>
            </div>
          ` : ''}
        </div>
      </div>
      ${isTarget ? '<div class="persona-action"><span class="good-match-label">✓ Good Match</span><span class="dive-in-btn target-dive-btn">Dive In →</span></div>' : ''}
    </div>
  `}).join('');
  
  // Add More/All buttons if there are more people
  if (sorted.length > showCount) {
    html += `
    <div class="people-show-more-btns">
      <button class="show-more-btn" id="show-more-people">Show More (${Math.min(3, sorted.length - showCount)} more)</button>
      <button class="show-more-btn" id="show-all-people">Show All (${sorted.length})</button>
    </div>`;
  } else if (showCount > 3 && sorted.length > 3) {
    // Show "Show Less" button when expanded
    html += `
    <div class="people-show-more-btns">
      <button class="show-more-btn" id="show-less-people">Show Less</button>
    </div>`;
  }
  
  peopleContainer.innerHTML = html;
  
  // Store sorted array in data attribute for handlers
  peopleContainer._sortedPeople = sorted;
  
  // Add copy handlers
  peopleContainer.querySelectorAll('.copy-btn-small').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.copy);
      showToast('Copied to clipboard!');
    });
  });
  
  // Add dive-in handlers for targets
  peopleContainer.querySelectorAll('.target-dive-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const personItem = btn.closest('.person-item');
      const personIndex = parseInt(personItem.dataset.personIndex);
      const person = sorted[personIndex];
      if (person) {
        openTargetModal(person, data);
      }
    });
  });
  
  // Add show more/all/less handlers
  const showMoreBtn = document.getElementById('show-more-people');
  const showAllBtn = document.getElementById('show-all-people');
  const showLessBtn = document.getElementById('show-less-people');
  
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      peopleDisplayCount += 3;
      renderPeopleList(data, people);
    });
  }
  
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      peopleDisplayCount = sorted.length;
      renderPeopleList(data, people);
    });
  }
  
  if (showLessBtn) {
    showLessBtn.addEventListener('click', () => {
      peopleDisplayCount = 3;
      renderPeopleList(data, people);
    });
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
  const estimatedAttendees = data.estimatedAttendees || people.length;
  const dealSize = parseFloat(userProfile.dealSize) || 0;
  const convRate = parseFloat(userProfile.conversionRate) / 100 || 0;
  const winRate = parseFloat(userProfile.oppWinRate) / 100 || 0.25;
  
  // Use estimated attendees if available, with target ratio from known people
  const targetRatio = people.length > 0 ? targetPeople / people.length : 0.1;
  const estimatedTargets = estimatedAttendees > people.length ? Math.round(estimatedAttendees * targetRatio) : targetPeople;
  
  const potentialOpps = estimatedTargets * convRate;
  const potentialDeals = potentialOpps * winRate;
  const potentialRevenue = potentialDeals * dealSize;
  
  // Hide ROI card if there's no potential revenue
  if (potentialRevenue <= 0) {
    roiCard.classList.add('hidden');
    return;
  }
  
  const attendeesLabel = data.estimatedAttendees ? `~${estimatedAttendees.toLocaleString()} attendees` : `${people.length} people`;
  
  roiCard.classList.remove('hidden');
  roiContent.innerHTML = `
    <div class="roi-grid-3">
      <div class="roi-stat">
        <div class="roi-value">${data.estimatedAttendees ? '~' + estimatedAttendees.toLocaleString() : people.length}</div>
        <div class="roi-label">Attendees</div>
      </div>
      <div class="roi-stat">
        <div class="roi-value">${data.estimatedAttendees ? '~' : ''}${estimatedTargets}</div>
        <div class="roi-label">Est. Targets</div>
      </div>
      <div class="roi-stat">
        <div class="roi-value">${potentialOpps.toFixed(1)}</div>
        <div class="roi-label">Est. Opps</div>
      </div>
    </div>
    <div class="roi-revenue">
      <div class="roi-value">$${formatNumber(potentialRevenue)}</div>
      <div class="roi-label">Potential Revenue</div>
    </div>
    <p class="roi-disclaimer">Based on ${(targetRatio * 100).toFixed(0)}% target rate, ${userProfile.conversionRate}% lead→opp, ${userProfile.oppWinRate || 25}% win rate, $${formatNumber(dealSize)} avg deal</p>
  `;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toFixed(0);
}

function formatRelativeDate(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// Share modal
function openShareModal() {
  document.getElementById('share-modal').classList.remove('hidden');
}

document.getElementById('share-modal-close')?.addEventListener('click', () => {
  document.getElementById('share-modal').classList.add('hidden');
});

document.getElementById('share-btn-header')?.addEventListener('click', openShareModal);

document.getElementById('download-brief-btn')?.addEventListener('click', () => {
  // Generate and download PDF brief
  if (currentAnalysisData) {
    generatePDFBrief(currentAnalysisData);
  } else {
    alert('No event data available to export.');
  }
});

document.getElementById('share-link-btn')?.addEventListener('click', () => {
  alert('Sharing links is a premium feature. Please upgrade to access.');
});

function generatePDFBrief(data) {
  // Get the logo as a data URL for embedding in the PDF
  const logoUrl = chrome.runtime.getURL('icons/kbyg_logo_black.png');
  
  // Create a printable HTML document
  const briefHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>KBYG.ai Brief - ${escapeHtml(data.eventName || 'Event')}</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          padding: 40px; 
          max-width: 800px; 
          margin: 0 auto; 
          color: #333;
          line-height: 1.5;
        }
        .header { 
          display: flex; 
          align-items: center; 
          gap: 16px; 
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #10b981;
        }
        .header-logo { height: 40px; width: auto; }
        .header-text { 
          font-size: 14px; 
          color: #666; 
          letter-spacing: 0.5px;
        }
        h1 { 
          color: #1a1a2e; 
          margin: 0 0 8px 0;
          font-size: 28px;
        }
        h2 { 
          color: #10b981; 
          margin-top: 28px;
          margin-bottom: 12px;
          font-size: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .event-meta { 
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
        }
        .meta-row {
          display: flex;
          margin-bottom: 6px;
        }
        .meta-row:last-child { margin-bottom: 0; }
        .meta-label { 
          font-weight: 600; 
          width: 100px;
          color: #555;
        }
        .meta-value { color: #333; }
        .section { margin-bottom: 24px; }
        .section-content {
          background: #fafafa;
          padding: 16px;
          border-radius: 8px;
          border-left: 3px solid #10b981;
        }
        .section-content p { margin: 0; }
        .people-grid { display: flex; flex-direction: column; gap: 8px; }
        .person { 
          background: #f8f9fa; 
          padding: 12px 16px; 
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .person-main { flex: 1; }
        .person-name { font-weight: 600; color: #1a1a2e; }
        .person-title { color: #666; font-size: 0.9em; margin-top: 2px; }
        .person-linkedin { color: #0077b5; font-size: 0.85em; text-decoration: none; }
        .target { 
          background: #fffbeb; 
          border: 1px solid #fcd34d;
        }
        .target-badge {
          background: #10b981;
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.75em;
          font-weight: 600;
        }
        .sponsors-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .sponsor-chip {
          background: #e0e7ff;
          color: #3730a3;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 0.9em;
        }
        .competitor-chip {
          background: #fee2e2;
          color: #b91c1c;
        }
        .personas-list { display: flex; flex-direction: column; gap: 8px; }
        .persona {
          background: #f0fdf4;
          padding: 12px 16px;
          border-radius: 8px;
          border-left: 3px solid #10b981;
        }
        .persona-name { font-weight: 600; color: #1a1a2e; }
        .persona-desc { color: #666; font-size: 0.9em; margin-top: 4px; }
        .action-items { 
          background: #fffbeb;
          padding: 16px;
          border-radius: 8px;
        }
        .action-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 8px;
        }
        .action-item:last-child { margin-bottom: 0; }
        .action-check { color: #10b981; }
        .footer { 
          margin-top: 40px; 
          padding-top: 20px; 
          border-top: 1px solid #eee; 
          color: #888; 
          font-size: 0.85em; 
          text-align: center;
        }
        .footer-brand { font-weight: 600; color: #1a1a2e; }
        @media print {
          body { padding: 20px; }
          .section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="KBYG.ai" class="header-logo" onerror="this.style.display='none'">
        <div class="header-text">Know Before You Go</div>
      </div>
      
      <h1>${escapeHtml(data.eventName || 'Event Brief')}</h1>
      
      <div class="event-meta">
        ${data.date ? `<div class="meta-row"><span class="meta-label">📅 Date</span><span class="meta-value">${escapeHtml(data.date)}</span></div>` : ''}
        ${data.location ? `<div class="meta-row"><span class="meta-label">📍 Location</span><span class="meta-value">${escapeHtml(data.location)}</span></div>` : ''}
        ${data.attendeeCount ? `<div class="meta-row"><span class="meta-label">👥 Attendees</span><span class="meta-value">${escapeHtml(String(data.attendeeCount))}</span></div>` : ''}
        ${data.url ? `<div class="meta-row"><span class="meta-label">🔗 URL</span><span class="meta-value">${escapeHtml(data.url)}</span></div>` : ''}
      </div>
      
      ${data.executiveSummary ? `
        <div class="section">
          <h2>📝 Executive Summary</h2>
          <div class="section-content">
            <p>${escapeHtml(data.executiveSummary)}</p>
          </div>
        </div>
      ` : ''}
      
      ${data.whyAttend ? `
        <div class="section">
          <h2>✅ Why Attend</h2>
          <div class="section-content">
            <p>${escapeHtml(data.whyAttend)}</p>
          </div>
        </div>
      ` : ''}
      
      ${data.roiScore ? `
        <div class="section">
          <h2>📊 ROI Score: ${data.roiScore}/10</h2>
          ${data.roiReasoning ? `<div class="section-content"><p>${escapeHtml(data.roiReasoning)}</p></div>` : ''}
        </div>
      ` : ''}
      
      ${data.personas && data.personas.length > 0 ? `
        <div class="section">
          <h2>🎯 Target Personas</h2>
          <div class="personas-list">
            ${data.personas.map(p => `
              <div class="persona">
                <div class="persona-name">${escapeHtml(p.name || p)}</div>
                ${p.description ? `<div class="persona-desc">${escapeHtml(p.description)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${data.people && data.people.length > 0 ? `
        <div class="section">
          <h2>👥 Key People (${data.people.length})</h2>
          <div class="people-grid">
            ${data.people.filter(p => p.isTarget).map(p => `
              <div class="person target">
                <div class="person-main">
                  <div class="person-name">${escapeHtml(p.name)}</div>
                  <div class="person-title">${escapeHtml(p.title || p.role || '')}${p.company ? ` at ${escapeHtml(p.company)}` : ''}</div>
                </div>
                <span class="target-badge">🎯 Target</span>
              </div>
            `).join('')}
            ${data.people.filter(p => !p.isTarget).slice(0, 15).map(p => `
              <div class="person">
                <div class="person-main">
                  <div class="person-name">${escapeHtml(p.name)}</div>
                  <div class="person-title">${escapeHtml(p.title || p.role || '')}${p.company ? ` at ${escapeHtml(p.company)}` : ''}</div>
                </div>
              </div>
            `).join('')}
            ${data.people.filter(p => !p.isTarget).length > 15 ? `<p style="color: #666; font-style: italic;">...and ${data.people.filter(p => !p.isTarget).length - 15} more attendees</p>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${data.sponsors && data.sponsors.length > 0 ? `
        <div class="section">
          <h2>🏢 Sponsors & Exhibitors</h2>
          <div class="sponsors-list">
            ${data.sponsors.map(s => `
              <span class="sponsor-chip ${s.isCompetitor ? 'competitor-chip' : ''}">${escapeHtml(s.name || s)}${s.isCompetitor ? ' ⚠️' : ''}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${data.nextActions && data.nextActions.length > 0 ? `
        <div class="section">
          <h2>⚡ Recommended Actions</h2>
          <div class="action-items">
            ${data.nextActions.map(action => `
              <div class="action-item">
                <span class="action-check">☐</span>
                <span>${escapeHtml(action)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="footer">
        <div class="footer-brand">KBYG.ai™</div>
        Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body>
    </html>
  `;
  
  // Open in new window for printing/saving as PDF
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to download the brief.');
    return;
  }
  printWindow.document.write(briefHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  
  document.getElementById('share-modal').classList.add('hidden');
}

// Target person modal
let currentTargetContext = null;
let targetChatHistory = [];

function openTargetModal(person, eventData) {
  currentTargetContext = { person, eventData };
  targetChatHistory = [];
  
  const modal = document.getElementById('target-modal');
  const headerInfo = document.getElementById('target-header-info');
  const whySection = document.getElementById('target-why');
  const nextActionsSection = document.getElementById('target-next-actions');
  const whatToSaySection = document.getElementById('target-what-to-say');
  const chatMessages = document.getElementById('target-chat-messages');
  
  // Fixed header with person info and LinkedIn
  const linkedinUrl = person.linkedin || generateLinkedInSearch(person.name, person.company);
  const hasDirectLinkedin = person.linkedin ? true : false;
  headerInfo.innerHTML = `
    <div class="target-header-row">
      <div class="person-avatar">${getInitials(person.name)}</div>
      <div class="target-header-text">
        <div class="target-header-name">${escapeHtml(person.name)}</div>
        <div class="target-header-meta">
          ${person.title || person.role ? `${escapeHtml(person.title || person.role)}` : ''}
          ${(person.title || person.role) && person.company ? ' • ' : ''}
          ${person.company ? `${escapeHtml(person.company)}` : ''}
        </div>
      </div>
      <a href="${linkedinUrl}" target="_blank" class="linkedin-btn ${hasDirectLinkedin ? 'direct' : ''}">
        🔗 ${hasDirectLinkedin ? 'LinkedIn' : 'Search'}
      </a>
    </div>
  `;
  
  // Why Target - specific and concise
  const role = person.role || person.title || 'professional';
  whySection.innerHTML = `
    <div class="target-insight-compact">
      <p><strong>${escapeHtml(role)}</strong> at <strong>${escapeHtml(person.company || 'their company')}</strong> — likely decision-maker or influencer for ${escapeHtml(userProfile.product || 'your solution')}.</p>
    </div>
  `;
  
  // Next Actions - specific steps
  nextActionsSection.innerHTML = `
    <div class="target-actions-list">
      <div class="action-item">
        <span class="action-num">1</span>
        <span>Connect on LinkedIn before the event</span>
      </div>
      <div class="action-item">
        <span class="action-num">2</span>
        <span>Find them at ${escapeHtml(eventData.eventName || 'the event')} and introduce yourself</span>
      </div>
      <div class="action-item">
        <span class="action-num">3</span>
        <span>Ask about their challenges with ${escapeHtml(userProfile.targetPersonas?.split(',')[0] || 'their role')}</span>
      </div>
      <div class="action-item">
        <span class="action-num">4</span>
        <span>Share how ${escapeHtml(userProfile.product || 'your product')} helps</span>
      </div>
    </div>
  `;
  
  // What to Say - LinkedIn message and ice breaker
  whatToSaySection.innerHTML = `
    ${person.linkedinMessage ? `
      <div class="say-card">
        <div class="say-card-header">
          <span>💼 LinkedIn Request</span>
          <button class="copy-btn-inline" data-copy="${escapeHtml(person.linkedinMessage)}">📋 Copy</button>
        </div>
        <div class="say-card-body">${escapeHtml(person.linkedinMessage)}</div>
      </div>
    ` : ''}
    ${person.iceBreaker ? `
      <div class="say-card highlight">
        <div class="say-card-header">
          <span>🗣️ In-Person Opener</span>
          <button class="copy-btn-inline" data-copy="${escapeHtml(person.iceBreaker)}">📋 Copy</button>
        </div>
        <div class="say-card-body">${escapeHtml(person.iceBreaker)}</div>
      </div>
    ` : ''}
  `;
  
  // Add copy handlers
  whatToSaySection.querySelectorAll('.copy-btn-inline').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.copy);
      showToast('Copied to clipboard!');
    });
  });
  
  // Initial chat message
  chatMessages.innerHTML = `
    <div class="chat-message assistant">
      <p>Need help with <strong>${escapeHtml(person.name)}</strong>? Ask me anything!</p>
    </div>
  `;
  
  modal.classList.remove('hidden');
}

function generateTargetPainPoints(person, profile) {
  const role = (person.role || person.title || '').toLowerCase();
  const points = [];
  
  if (role.includes('ceo') || role.includes('founder') || role.includes('chief')) {
    points.push('Pressure to drive growth while managing costs');
    points.push('Need for visibility into team performance and ROI');
    points.push('Balancing strategic initiatives with day-to-day operations');
  } else if (role.includes('vp') || role.includes('head') || role.includes('director')) {
    points.push('Meeting aggressive targets with limited resources');
    points.push('Difficulty getting buy-in for new tools and processes');
    points.push('Lack of actionable data for decision-making');
  } else if (role.includes('manager')) {
    points.push('Team productivity and efficiency challenges');
    points.push('Pressure from leadership to show results');
    points.push('Manual processes that waste time');
  } else if (role.includes('sales') || role.includes('revenue') || role.includes('ae') || role.includes('sdr')) {
    points.push('Difficulty finding and qualifying the right prospects');
    points.push('Time-consuming manual outreach tasks');
    points.push('Pressure to hit quota with limited quality leads');
  } else if (role.includes('marketing') || role.includes('growth')) {
    points.push('Proving ROI on marketing spend');
    points.push('Generating quality leads that convert');
    points.push('Aligning with sales on priorities');
  } else {
    points.push('Efficiency and productivity challenges');
    points.push('Need for better tools and processes');
    points.push('Pressure to deliver results faster');
  }
  
  return points;
}

function generateProductHelps(person, profile) {
  const product = profile.product || 'Your solution';
  const valueProp = profile.valueProp || '';
  const helps = [];
  
  helps.push(`Addressing their key pain points with ${product}`);
  helps.push('Saving time and reducing manual work');
  helps.push('Providing visibility and actionable insights');
  
  if (valueProp) {
    helps.push(`Delivering on: ${valueProp.substring(0, 100)}${valueProp.length > 100 ? '...' : ''}`);
  }
  
  return helps;
}

// Close target modal
document.getElementById('target-modal-close')?.addEventListener('click', () => {
  document.getElementById('target-modal').classList.add('hidden');
  currentTargetContext = null;
  targetChatHistory = [];
});

// Target chat
document.getElementById('target-chat-send')?.addEventListener('click', sendTargetChatMessage);
document.getElementById('target-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendTargetChatMessage();
});

async function sendTargetChatMessage() {
  const input = document.getElementById('target-chat-input');
  const messagesContainer = document.getElementById('target-chat-messages');
  const userMessage = input.value.trim();
  
  if (!userMessage || !currentTargetContext) return;
  
  input.value = '';
  
  // Add user message
  messagesContainer.innerHTML += `
    <div class="chat-message user">
      <p>${escapeHtml(userMessage)}</p>
    </div>
  `;
  
  // Add loading message
  messagesContainer.innerHTML += `
    <div class="chat-message assistant loading" id="target-chat-loading">
      <p>Thinking...</p>
    </div>
  `;
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  targetChatHistory.push({ role: 'user', content: userMessage });
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'targetChat',
      person: currentTargetContext.person,
      eventData: currentTargetContext.eventData,
      userProfile: userProfile,
      chatHistory: targetChatHistory,
      userMessage: userMessage
    });
    
    document.getElementById('target-chat-loading')?.remove();
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    targetChatHistory.push({ role: 'assistant', content: response.reply });
    
    messagesContainer.innerHTML += `
      <div class="chat-message assistant">
        <p>${escapeHtml(response.reply)}</p>
      </div>
    `;
  } catch (error) {
    document.getElementById('target-chat-loading')?.remove();
    messagesContainer.innerHTML += `
      <div class="chat-message assistant error">
        <p>Error: ${escapeHtml(error.message)}</p>
      </div>
    `;
  }
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

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

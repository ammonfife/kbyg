// Background service worker for API calls

// Import auth and backend API files
importScripts('supabase-client.js', 'config.js', 'backend-api.js');

async function ensureBackendAPIInitialized() {
  await backendAPI.initialize();
}

function resolveApiKeyOverride(profile) {
  if (!profile || profile.useServerProxy !== false) {
    return null;
  }

  const rawKey = typeof profile.geminiApiKey === 'string' ? profile.geminiApiKey.trim() : '';
  return rawKey || null;
}

const PARSE_TELEMETRY_SAMPLE_RATE = 0.12;
const hostParsingProfileCache = new Map();

function getHostFromUrl(pageUrl) {
  try {
    return new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function getHostParsingProfile(pageUrl) {
  const host = getHostFromUrl(pageUrl);
  if (!host) return null;

  if (hostParsingProfileCache.has(host)) {
    return hostParsingProfileCache.get(host);
  }

  try {
    await ensureBackendAPIInitialized();
    if (!backendAPI?.authToken && !backendAPI?.bearerToken) {
      hostParsingProfileCache.set(host, null);
      return null;
    }

    const profile = await backendAPI.getParsingProfile({ url: pageUrl });
    hostParsingProfileCache.set(host, profile || null);
    return profile || null;
  } catch {
    hostParsingProfileCache.set(host, null);
    return null;
  }
}

function buildHostParsingHints(hostProfile) {
  if (!hostProfile || typeof hostProfile !== 'object') {
    return '';
  }

  const entitySources = Array.isArray(hostProfile.suggestedEntitySources) ? hostProfile.suggestedEntitySources : [];
  const peopleSelectors = Array.isArray(hostProfile.suggestedPeopleSelectors) ? hostProfile.suggestedPeopleSelectors : [];
  const sponsorSelectors = Array.isArray(hostProfile.suggestedSponsorSelectors) ? hostProfile.suggestedSponsorSelectors : [];
  const confidence = typeof hostProfile.confidenceScore === 'number' ? hostProfile.confidenceScore : 0;
  const totalSamples = typeof hostProfile.totalSamples === 'number' ? hostProfile.totalSamples : 0;

  if (!entitySources.length && !peopleSelectors.length && !sponsorSelectors.length) {
    return '';
  }

  return `
HOST PARSING DICTIONARY (learned profile for this domain):
- Confidence Score: ${confidence}
- Samples Seen: ${totalSamples}
- Preferred Entity Sources: ${entitySources.join(', ') || 'none'}
- People Selectors: ${peopleSelectors.join(', ') || 'none'}
- Sponsor Selectors: ${sponsorSelectors.join(', ') || 'none'}

Prioritize these learned host patterns when extracting people/sponsors/event details.`;
}

function shouldSampleParseTelemetry() {
  return Math.random() < PARSE_TELEMETRY_SAMPLE_RATE;
}

async function reportParseTelemetry(payload) {
  try {
    await ensureBackendAPIInitialized();

    if (!backendAPI?.authToken && !backendAPI?.bearerToken) {
      return;
    }

    await backendAPI.saveParseTelemetry(payload);
  } catch (error) {
    console.warn('[KBYG Telemetry] Failed to report parse telemetry:', error?.message || error);
  }
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'preCheckEvent') {
    handlePreCheckEvent(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'analyzeEvent') {
    handleAnalyzeEvent(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'personaChat') {
    handlePersonaChat(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'targetChat') {
    handleTargetChat(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Lightweight pre-check to determine if page is an event
async function handlePreCheckEvent(request) {
  const profile = request.userProfile || {};
  const apiKeyOverride = resolveApiKeyOverride(profile);

  const { content, url, title } = request;
  const hostProfile = await getHostParsingProfile(url);
  const hostHints = buildHostParsingHints(hostProfile);
  
  // Truncate content for lightweight check (first 3000 chars should be enough)
  const truncatedContent = content.substring(0, 3000);

  const prompt = `You are an EXTREMELY strict classifier. Your job is to determine if the ENTIRE webpage is a DEDICATED PAGE for a SINGLE, SPECIFIC event (conference, meetup, summit, workshop, etc.).

The WHOLE PAGE must be about ONE event. Not a directory. Not an article mentioning an event. Not a page with an event advertisement. The entire page's primary purpose must be to provide information about or registration for ONE specific event.

PAGE URL: ${url}
PAGE TITLE: ${title}

PAGE CONTENT (truncated):
${truncatedContent}

Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "isEvent": true/false,
  "confidence": "high" | "medium" | "low",
  "eventName": "Name of the event if found, or null",
  "eventDate": "Start date in YYYY-MM-DD format if found, or null",
  "eventLocation": "City, State/Country if found, or null",
  "eventId": "A unique identifier combining slugified-event-name_YYYYMMDD_location-slug, or null if not an event"
}

DEFAULT TO FALSE. Only return isEvent=true with confidence="high" if the ENTIRE PAGE is dedicated to ONE event.

✅ HIGH CONFIDENCE (isEvent=true, confidence="high") - ONLY these qualify:
- Eventbrite event page for ONE specific event (URL contains /e/ or /events/ with event ID)
- Meetup.com page for ONE specific meetup event
- Lu.ma event page for ONE specific event
- Conference website where the ENTIRE page is about that ONE conference (dates, venue, registration, speakers all for ONE event)
- The page has NO other purpose than to describe/promote/register for this ONE event

⚠️ MEDIUM/LOW CONFIDENCE - These are NOT high confidence:
- A page that MENTIONS an event but has other content too
- A company website that has an events section
- An article or blog post about an event
- A page with event advertisements or promotions mixed with other content
- Any page where the event is not the SOLE focus

❌ FALSE (isEvent=false) - Return false for ALL of these:
- News articles, blog posts, press releases (even if about an event)
- Event directories or listings showing MULTIPLE events
- Company websites, product pages, marketing pages
- Pages that mention events but are primarily about something else (like Mint.com mentioning a product migration)
- Social media feeds, search results, YouTube videos
- Wikipedia or informational pages
- Calendar pages with multiple events
- Any page where you have to scroll past non-event content to find event details
- Product announcements disguised as events
- Service migrations, product launches, or company news framed as "events"

CRITICAL TEST - Ask yourself:
1. Is the ENTIRE page about ONE specific event? (Not just a section or mention)
2. Is the primary purpose of this page event registration or event information?
3. Would removing the event content leave the page empty/meaningless?
4. Is this a REAL event people attend (physically or virtually) with a specific date?

If ANY answer is NO → return isEvent=false or confidence="low"

Only return confidence="high" when you are 100% certain the WHOLE PAGE is a dedicated event page.

${hostHints}`;

  const response = await callGeminiAPI(apiKeyOverride, prompt, {
    stage: 'precheck',
    pageUrl: url,
    pageTitle: title,
  });
  const result = parsePreCheckResponse(response);
  
  return result;
}

function parsePreCheckResponse(response) {
  try {
    const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      return { isEvent: false, confidence: 'low', eventId: null };
    }
    
    // Clean up response - remove markdown code blocks if present
    let cleanedText = textContent.trim();
    cleanedText = cleanedText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    const data = JSON.parse(cleanedText);
    return {
      isEvent: data.isEvent === true,
      confidence: data.confidence || 'low',
      eventName: data.eventName || null,
      eventDate: data.eventDate || null,
      eventLocation: data.eventLocation || null,
      eventId: data.eventId || null
    };
  } catch (error) {
    console.error('Error parsing pre-check response:', error);
    return { isEvent: false, confidence: 'low', eventId: null };
  }
}

async function handleAnalyzeEvent(request) {
  const profile = request.userProfile || {};
  const apiKeyOverride = resolveApiKeyOverride(profile);

  const { content, url, title } = request;
  const hostProfile = await getHostParsingProfile(url);

  // Build the prompt with user context
  const prompt = buildAnalysisPrompt(content, url, title, profile, hostProfile);

  // Call Gemini API
  const response = await callGeminiAPI(apiKeyOverride, prompt, {
    stage: 'analyze_event',
    pageUrl: url,
    pageTitle: title,
  });

  // Parse the response
  const data = parseGeminiResponse(response, {
    stage: 'analyze_event',
    pageUrl: url,
    pageTitle: title,
  });

  const normalizedData = backfillEntitiesFromExtractedContent(data, content);
  const enrichedData = enrichParsedDataFromContent(normalizedData, content, title, url);
  const repairedData = await attemptFieldRepairIfNeeded(apiKeyOverride, enrichedData, content, {
    pageUrl: url,
    pageTitle: title,
  });
  const finalData = normalizeFinalDataShape(repairedData);

  // ✨ Save to backend database
  try {
    await ensureBackendAPIInitialized();
    
    const eventData = {
      url: url,
      eventName: finalData.eventName,
      date: finalData.date,
      startDate: finalData.startDate || finalData.date,
      endDate: finalData.endDate || finalData.date,
      location: finalData.location,
      description: finalData.description,
      estimatedAttendees: finalData.estimatedAttendees || 0,
      people: finalData.people || [],
      sponsors: finalData.sponsors || [],
      expectedPersonas: finalData.expectedPersonas || [],
      nextBestActions: finalData.nextBestActions || [],
      relatedEvents: finalData.relatedEvents || [],
      analyzedAt: new Date().toISOString(),
    };

    const saveResult = await backendAPI.saveEvent(eventData);
    console.log('[KBYG Backend] Event saved to database:', saveResult.eventId);
    
    // Add backend metadata to response
    finalData.backendSaved = true;
    finalData.backendEventId = saveResult.eventId;
  } catch (backendError) {
    console.error('[KBYG Backend] Failed to save event:', backendError);
    finalData.backendSaved = false;
    finalData.backendError = backendError.message;
  }

  return { data: finalData };
}

function backfillEntitiesFromExtractedContent(data, content) {
  const result = {
    ...data,
    people: Array.isArray(data.people) ? [...data.people] : [],
    sponsors: Array.isArray(data.sponsors) ? [...data.sponsors] : []
  };

  if (result.people.length === 0 && Array.isArray(content?.speakerDirectory)) {
    const seenPeople = new Set();
    for (const speaker of content.speakerDirectory) {
      const name = typeof speaker?.name === 'string' ? speaker.name.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenPeople.has(key)) continue;
      seenPeople.add(key);

      result.people.push({
        name,
        role: 'Speaker',
        title: null,
        company: null,
        persona: null,
        linkedin: null,
        linkedinMessage: null,
        iceBreaker: null
      });
    }
  }

  if (result.sponsors.length === 0 && Array.isArray(content?.sponsorCandidates)) {
    const seenSponsors = new Set();
    for (const sponsor of content.sponsorCandidates) {
      const name = typeof sponsor === 'string' ? sponsor.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenSponsors.has(key)) continue;
      seenSponsors.add(key);
      result.sponsors.push({ name, tier: null });
    }
  }

  return result;
}

function parseIsoDate(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function stripEventTitleSuffix(title) {
  if (!title || typeof title !== 'string') return null;
  const cleaned = title
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/\s*[·•-]\s*[^·•-]+$/g, '')
    .trim();
  return cleaned || null;
}

function extractDatesFromText(text) {
  if (!text || typeof text !== 'string') return { startDate: null, endDate: null };

  const explicitRange = text.match(/([A-Z][a-z]+\s+\d{1,2})\s*[-–]\s*(\d{1,2}),\s*(\d{4})/);
  if (explicitRange) {
    const monthDayStart = `${explicitRange[1]}, ${explicitRange[3]}`;
    const month = explicitRange[1].split(/\s+/)[0];
    const monthDayEnd = `${month} ${explicitRange[2]}, ${explicitRange[3]}`;
    return {
      startDate: parseIsoDate(monthDayStart),
      endDate: parseIsoDate(monthDayEnd),
    };
  }

  const single = text.match(/([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/);
  if (single) {
    const parsed = parseIsoDate(single[1]);
    return { startDate: parsed, endDate: parsed };
  }

  return { startDate: null, endDate: null };
}

function parseCompanyFromTitle(title) {
  if (!title || typeof title !== 'string') return { roleTitle: null, company: null };
  const parts = title.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      roleTitle: parts[0],
      company: parts.slice(1).join(' | '),
    };
  }
  return {
    roleTitle: title.trim() || null,
    company: null,
  };
}

function enrichPeopleFromSpeakerDirectory(people, speakerDirectory) {
  if (!Array.isArray(people) || !Array.isArray(speakerDirectory)) return people || [];

  const byName = new Map();
  for (const entry of speakerDirectory) {
    const name = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : '';
    if (!name) continue;
    byName.set(name, entry);
  }

  return people.map((person) => {
    if (!person || typeof person !== 'object') return person;

    const nameKey = typeof person.name === 'string' ? person.name.trim().toLowerCase() : '';
    const directoryEntry = byName.get(nameKey);
    if (!directoryEntry) return person;

    const parsed = parseCompanyFromTitle(directoryEntry.context || '');
    return {
      ...person,
      title: person.title || parsed.roleTitle,
      company: person.company || parsed.company,
      role: person.role || 'Speaker',
    };
  });
}

function derivePersonasFromPeople(people) {
  if (!Array.isArray(people) || people.length === 0) return [];

  const titles = people
    .map((p) => `${p?.title || ''} ${p?.role || ''}`.trim())
    .filter(Boolean)
    .slice(0, 25);

  const buckets = new Set();
  for (const title of titles) {
    const lower = title.toLowerCase();
    if (/(ceo|chief|president|founder|cofounder)/.test(lower)) buckets.add('Executive Leader');
    if (/(vp|vice president|director|head of)/.test(lower)) buckets.add('VP/Director');
    if (/(marketing|growth|brand|go[- ]to[- ]market|sales)/.test(lower)) buckets.add('Marketing & Growth Leader');
    if (/(operations|operator|franchise|franchising|restaurant excellence)/.test(lower)) buckets.add('Operations Leader');
    if (/(technology|it|digital|innovation|ai)/.test(lower)) buckets.add('Technology Leader');
  }

  return Array.from(buckets).slice(0, 5).map((personaName) => ({
    persona: personaName,
    likelihood: 'High',
    count: 'Many',
    linkedinMessage: `Enjoyed seeing ${personaName.toLowerCase()} represented at this event—open to connecting?`,
    iceBreaker: `What is the biggest priority for ${personaName.toLowerCase()} in 2026?`,
    conversationStarters: ['What are your top priorities this quarter?', 'Which strategy is working best right now?', 'Where do you see the biggest execution gap?'],
    keywords: ['growth', 'operations', 'technology'],
    painPoints: ['Limited bandwidth', 'Need measurable ROI'],
  }));
}

function defaultNextBestActions(eventName) {
  return [
    {
      priority: 1,
      action: `Identify top 10 speaker targets for ${eventName || 'this event'} and draft outreach`,
      reason: 'Speakers are high-context connectors and often influence buying committees.',
    },
    {
      priority: 2,
      action: 'Build role-based talk tracks for operations, marketing, and technology leaders',
      reason: 'Role-specific messaging improves conversion from first conversation to follow-up.',
    },
    {
      priority: 3,
      action: 'Schedule post-event follow-up sequence within 48 hours',
      reason: 'Fast follow-up preserves context and increases response rates.',
    },
  ];
}

function enrichParsedDataFromContent(data, content, pageTitle, pageUrl) {
  const result = {
    ...data,
    people: Array.isArray(data.people) ? [...data.people] : [],
    sponsors: Array.isArray(data.sponsors) ? [...data.sponsors] : [],
    expectedPersonas: Array.isArray(data.expectedPersonas) ? [...data.expectedPersonas] : [],
    nextBestActions: Array.isArray(data.nextBestActions) ? [...data.nextBestActions] : [],
    relatedEvents: Array.isArray(data.relatedEvents) ? [...data.relatedEvents] : [],
  };

  const structuredGraph = Array.isArray(content?.structuredData) ? content.structuredData : [];
  const flatStructured = structuredGraph.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry['@graph'])) return entry['@graph'];
    return [entry];
  });

  const eventStructured = flatStructured.find((item) => {
    const type = item?.['@type'];
    if (Array.isArray(type)) return type.includes('Event');
    return type === 'Event';
  });

  const mainText = typeof content?.mainText === 'string' ? content.mainText : '';
  const meta = content?.meta || {};

  result.eventName = pickFirstNonEmpty(
    result.eventName,
    eventStructured?.name,
    meta['og:title'],
    stripEventTitleSuffix(pageTitle)
  ) || 'Unknown Event';

  result.description = pickFirstNonEmpty(
    result.description,
    eventStructured?.description,
    meta['og:description'],
    meta.description,
    mainText.substring(0, 320)
  );

  const structuredStart = parseIsoDate(eventStructured?.startDate);
  const structuredEnd = parseIsoDate(eventStructured?.endDate);
  const textDates = extractDatesFromText(mainText);

  result.startDate = parseIsoDate(result.startDate) || structuredStart || textDates.startDate;
  result.endDate = parseIsoDate(result.endDate) || structuredEnd || textDates.endDate || result.startDate;
  result.date = pickFirstNonEmpty(result.date, result.startDate && result.endDate && result.startDate !== result.endDate
    ? `${result.startDate} to ${result.endDate}`
    : result.startDate);

  const structuredLocation = eventStructured?.location?.name || eventStructured?.location?.address || null;
  result.location = pickFirstNonEmpty(result.location, structuredLocation);

  if (!result.estimatedAttendees) {
    const attendeesMatch = mainText.match(/(\d{2,5})\s*(\+)?\s*(attendees|attending|participants|registered|registrants)/i);
    result.estimatedAttendees = attendeesMatch ? Number(attendeesMatch[1]) : null;
  }

  result.people = enrichPeopleFromSpeakerDirectory(result.people, content?.speakerDirectory);
  if (result.people.length === 0 && Array.isArray(content?.speakerDirectory)) {
    const unique = new Map();
    for (const entry of content.speakerDirectory) {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name) continue;
      const parsed = parseCompanyFromTitle(entry.context || '');
      unique.set(name.toLowerCase(), {
        name,
        role: 'Speaker',
        title: parsed.roleTitle,
        company: parsed.company,
        persona: null,
        linkedin: null,
        linkedinMessage: null,
        iceBreaker: null,
      });
    }
    result.people = Array.from(unique.values());
  }

  if (result.expectedPersonas.length === 0) {
    result.expectedPersonas = derivePersonasFromPeople(result.people);
  }

  if (result.nextBestActions.length === 0) {
    result.nextBestActions = defaultNextBestActions(result.eventName);
  }

  if (!Array.isArray(result.relatedEvents)) {
    result.relatedEvents = [];
  }

  if (!result.location && pageUrl) {
    const host = getHostFromUrl(pageUrl);
    if (host) result.location = host;
  }

  return result;
}

function getMissingFieldSummary(data) {
  const missing = [];
  const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

  if (isBlank(data.eventName) || data.eventName === 'Unknown Event') missing.push('eventName');
  if (isBlank(data.startDate)) missing.push('startDate');
  if (isBlank(data.endDate)) missing.push('endDate');
  if (isBlank(data.location)) missing.push('location');
  if (isBlank(data.description)) missing.push('description');
  if (!Array.isArray(data.people) || data.people.length === 0) missing.push('people');
  if (!Array.isArray(data.sponsors) || data.sponsors.length === 0) missing.push('sponsors');
  if (!Array.isArray(data.expectedPersonas) || data.expectedPersonas.length === 0) missing.push('expectedPersonas');
  if (!Array.isArray(data.nextBestActions) || data.nextBestActions.length === 0) missing.push('nextBestActions');

  return missing;
}

async function attemptFieldRepairIfNeeded(apiKeyOverride, data, content, context = {}) {
  const missingBefore = getMissingFieldSummary(data);
  if (missingBefore.length === 0) return data;

  const prompt = `You are repairing missing fields in event extraction JSON.

TASK:
- Fill ONLY missing or null/empty fields.
- Do NOT remove existing valid values.
- Keep strict JSON output only.

MISSING FIELDS:
${missingBefore.join(', ')}

CURRENT JSON:
${JSON.stringify(data, null, 2)}

SOURCE PAGE CONTENT:
${JSON.stringify(content, null, 2)}

Return ONLY repaired JSON.`;

  try {
    const response = await callGeminiAPI(apiKeyOverride, prompt, {
      stage: 'repair_missing_fields',
      pageUrl: context.pageUrl,
      pageTitle: context.pageTitle,
    });

    const repaired = parseGeminiResponse(response, {
      stage: 'repair_missing_fields',
      pageUrl: context.pageUrl,
      pageTitle: context.pageTitle,
    });

    const merged = {
      ...data,
      ...repaired,
      people: Array.isArray(repaired.people) && repaired.people.length ? repaired.people : data.people,
      sponsors: Array.isArray(repaired.sponsors) && repaired.sponsors.length ? repaired.sponsors : data.sponsors,
      expectedPersonas: Array.isArray(repaired.expectedPersonas) && repaired.expectedPersonas.length ? repaired.expectedPersonas : data.expectedPersonas,
      nextBestActions: Array.isArray(repaired.nextBestActions) && repaired.nextBestActions.length ? repaired.nextBestActions : data.nextBestActions,
      relatedEvents: Array.isArray(repaired.relatedEvents) ? repaired.relatedEvents : data.relatedEvents,
    };

    const missingAfter = getMissingFieldSummary(merged);
    if (missingAfter.length < missingBefore.length) {
      reportParseTelemetry({
        stage: 'repair_missing_fields',
        status: 'parse_success',
        pageUrl: context.pageUrl,
        pageTitle: context.pageTitle,
        sampleReason: `missing_before:${missingBefore.length}_after:${missingAfter.length}`,
      });
      return merged;
    }
  } catch (error) {
    reportParseTelemetry({
      stage: 'repair_missing_fields',
      status: 'parse_error',
      pageUrl: context.pageUrl,
      pageTitle: context.pageTitle,
      errorMessage: String(error?.message || error),
    });
  }

  return data;
}

function normalizeFinalDataShape(data) {
  return {
    ...data,
    eventName: (data.eventName || 'Unknown Event').trim(),
    date: data.date || null,
    startDate: parseIsoDate(data.startDate) || null,
    endDate: parseIsoDate(data.endDate) || parseIsoDate(data.startDate) || null,
    location: data.location || null,
    description: data.description || null,
    estimatedAttendees: typeof data.estimatedAttendees === 'number' ? data.estimatedAttendees : null,
    people: Array.isArray(data.people) ? data.people : [],
    sponsors: Array.isArray(data.sponsors) ? data.sponsors : [],
    expectedPersonas: Array.isArray(data.expectedPersonas) ? data.expectedPersonas : [],
    nextBestActions: Array.isArray(data.nextBestActions) ? data.nextBestActions : [],
    relatedEvents: Array.isArray(data.relatedEvents) ? data.relatedEvents : [],
  };
}

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userProfile'], (result) => {
      resolve(result.userProfile?.geminiApiKey || null);
    });
  });
}

function buildAnalysisPrompt(content, url, title, profile, hostProfile = null) {
  // Build user context section
  let userContext = '';
  if (profile.companyName || profile.product) {
    userContext = `
USER CONTEXT (use this to personalize insights):
- Company: ${profile.companyName || 'Not specified'}
- Role: ${profile.yourRole || 'Not specified'}
- Product/Service: ${profile.product || 'Not specified'}
- Value Proposition: ${profile.valueProp || 'Not specified'}
- Target Personas: ${profile.targetPersonas || 'Not specified'}
- Target Industries: ${profile.targetIndustries || 'Not specified'}
- Known Competitors: ${profile.competitors || 'Not specified'}
- Additional Notes: ${profile.notes || 'None'}
`;
  }

  // Parse target personas into a list for prioritization
  const targetPersonasList = (profile.targetPersonas || '')
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  const personaGuidance = targetPersonasList.length > 0 
    ? `IMPORTANT: The user's priority target personas are: ${targetPersonasList.join(', ')}. 
When generating expectedPersonas, ALWAYS include these target personas FIRST if they are likely to attend this type of event. 
Then add other relevant personas you identify from the event content.`
    : '';

  const hostHints = buildHostParsingHints(hostProfile);

  return `You are an AI assistant helping a Go-To-Market (GTM) team analyze conference and event websites.
${userContext}
${personaGuidance}
${hostHints}

Extract ALL people and companies from this event page. Return a JSON object:

{
  "eventName": "Name of the event",
  "date": "Event date(s) as displayed (e.g., 'March 15-17, 2026')",
  "startDate": "YYYY-MM-DD format of the first day of the event (e.g., '2026-03-15')",
  "endDate": "YYYY-MM-DD format of the last day of the event (e.g., '2026-03-17'), or same as startDate if single-day event",
  "location": "Location or Virtual",
  "description": "Brief description",
  "estimatedAttendees": null or number - look for registration counts, "X people attending", "expected attendance", capacity info, or similar indicators,
  "expectedPersonas": [
    {
      "persona": "Job title/role category (e.g., 'VP of Operations', 'CTO', 'Founder')",
      "likelihood": "High/Medium/Low - how likely this persona attends based on event content",
      "count": "Estimated number or 'Many'/'Few' if you can infer from content",
      "linkedinMessage": "A short, personalized LinkedIn connection request message (under 200 chars) referencing the event",
      "iceBreaker": "An in-person opener to break the ice at the event - casual, natural, memorable",
      "conversationStarters": ["Follow-up line 1", "Follow-up line 2", "Follow-up line 3"],
      "keywords": ["industry term", "pain point", "trending topic"],
      "painPoints": ["Challenge they likely face", "Problem your product solves"]
    }
  ],
  "people": [
    {
      "name": "Full name",
      "role": "Their role at event (Speaker, Panelist, Moderator, Host, Attendee, Organizer, etc.)",
      "title": "Job title",
      "company": "Company name",
      "persona": "Persona category this person fits (e.g., 'Executive', 'VP/Director', 'Manager', 'Founder', 'Practitioner')",
      "linkedin": "LinkedIn URL if on page, otherwise null",
      "linkedinMessage": "A personalized LinkedIn connection request (under 200 chars) mentioning the event and something specific about them",
      "iceBreaker": "A natural in-person opener specific to this person - reference their talk, company, or role at the event"
    }
  ],
  "sponsors": [
    {
      "name": "Company name",
      "tier": "Sponsor tier if mentioned"
    }
  ],
  "nextBestActions": [
    {
      "priority": 1,
      "action": "Specific actionable recommendation",
      "reason": "Why this matters for GTM"
    }
  ],
  "relatedEvents": [
    {
      "name": "Name of related event",
      "url": "Full URL to the event page",
      "date": "Event date if visible",
      "relevance": "Why this event is related (same organizer, similar topic, etc.)"
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Find EVERY person mentioned on the page - speakers, panelists, moderators, hosts, CEOs, founders, attendees, anyone with a name
- Do NOT skip anyone. List them ALL.
- IMPORTANT: If page content includes speakerDirectory and sessionBlocks, treat them as high-confidence extracted source data.
- Cross-reference sessionBlocks.speakersText and speakerDirectory to build complete people list with best possible title/company inference.
- If sponsorCandidates is present, extract sponsor companies from it before attempting weaker inference.
- Assign each person a persona category based on their job title
- For EACH person, write a unique, natural conversation starter they'd appreciate hearing at this event
- Infer expected personas based on event topic, speakers, and sponsors
- For EACH expected persona, provide 3 conversation starters, relevant keywords, and likely pain points
- Provide 3-5 specific, actionable next best actions prioritized by impact
- For relatedEvents: ONLY include events with URLs that are ACTUALLY LINKED on the page. Do NOT guess or make up URLs.
  * Look for links to other events by the same organizer
  * Look for "Related Events", "Upcoming Events", "Past Events", or "You might also like" sections
  * If no related event links are found on the page, return an empty relatedEvents array []
  * NEVER invent or guess URLs - only use URLs that appear in the page content
- Look through the entire page content carefully
- Return ONLY valid JSON, no other text

DATE EXTRACTION (VERY IMPORTANT):
- startDate and endDate MUST be in YYYY-MM-DD format (e.g., "2026-03-15")
- Look for dates in headers, event details, registration info, meta tags, structured data
- For multi-day events: startDate = first day, endDate = last day
- For single-day events: startDate and endDate should be the same
- If year is not specified, assume the next occurrence of that date
- Examples: "March 15-17, 2026" → startDate: "2026-03-15", endDate: "2026-03-17"
           "Jan 5, 2026" → startDate: "2026-01-05", endDate: "2026-01-05"

ATTENDEE COUNT EXTRACTION:
- Look for phrases like: "X attendees", "X+ attending", "expected attendance", "capacity of X", "join X professionals", "X registered", "X participants"
- Check registration counts, RSVP numbers, and event capacity information
- Look in meta descriptions, headers, about sections, and registration areas
- Return as a number (not a string), or null if not found

Page URL: ${url}
Page Title: ${title}

Page Content:
${JSON.stringify(content, null, 2)}`;
}

async function callGeminiAPI(apiKeyOverride, prompt, context = {}) {
  await ensureBackendAPIInitialized();

  const payload = {
    prompt,
    temperature: 0.1,
    maxTokens: 8192,
  };

  if (apiKeyOverride) {
    payload.apiKeyOverride = apiKeyOverride;
  }

  const response = await fetch(`${CONFIG.API_BASE_URL}/gemini/generate`, {
    method: 'POST',
    headers: backendAPI.getHeaders(),
    body: JSON.stringify(payload),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = responseData.error || responseData.message || response.statusText;
    reportParseTelemetry({
      stage: context.stage || 'gemini_api',
      status: 'api_error',
      errorMessage: String(errorMessage),
      pageUrl: context.pageUrl,
      pageTitle: context.pageTitle,
      rawResponseText: JSON.stringify(responseData || {}),
    });

    if (response.status === 400 && String(errorMessage).toLowerCase().includes('api key')) {
      if (apiKeyOverride) {
        throw new Error('Your Gemini API key in settings is invalid or expired. Update it or enable server proxy mode.');
      }
      throw new Error('Server Gemini API key is invalid or expired. Please renew the backend key.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    throw new Error(`API error: ${errorMessage}`);
  }

  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: responseData.text || '',
            },
          ],
        },
      },
    ],
  };
}

function extractBestEffortJson(textContent) {
  let jsonStr = String(textContent || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = jsonStr.indexOf('{');
  if (firstBrace >= 0) {
    jsonStr = jsonStr.slice(firstBrace);
  }

  let inString = false;
  let escaped = false;
  let lastCompleteObjectIndex = -1;
  let stack = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if ((ch === '}' || ch === ']') && stack.length > 0) {
      const top = stack[stack.length - 1];
      if ((top === '{' && ch === '}') || (top === '[' && ch === ']')) {
        stack.pop();
      }

      if (stack.length === 0) {
        lastCompleteObjectIndex = i;
      }
    }
  }

  if (lastCompleteObjectIndex >= 0) {
    jsonStr = jsonStr.slice(0, lastCompleteObjectIndex + 1);
  }

  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1').trim();

  if (lastCompleteObjectIndex < 0) {
    if (inString) {
      const lastQuote = jsonStr.lastIndexOf('"');
      if (lastQuote >= 0) {
        jsonStr = jsonStr.slice(0, lastQuote);
      }
    }

    jsonStr = jsonStr.replace(/,\s*$/, '');

    const closeSuffix = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      closeSuffix.push(stack[i] === '{' ? '}' : ']');
    }
    jsonStr += closeSuffix.join('');
  }

  return jsonStr;
}

function extractFallbackEventData(rawText) {
  const text = String(rawText || '');

  const readString = (key) => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"`));
    if (!match) return null;
    return match[1]
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"')
      .trim();
  };

  const readNumber = (key) => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return match ? Number(match[1]) : null;
  };

  const eventName = readString('eventName');
  const date = readString('date');
  const startDate = readString('startDate');
  const endDate = readString('endDate');
  const location = readString('location');
  const description = readString('description');
  const estimatedAttendees = readNumber('estimatedAttendees');

  const hasUsefulSignal = !!(eventName || date || location || description);
  if (!hasUsefulSignal) {
    return null;
  }

  return {
    eventName: eventName || 'Unknown Event',
    date: date || null,
    startDate: startDate || null,
    endDate: endDate || null,
    location: location || null,
    description: description || null,
    estimatedAttendees,
    people: [],
    sponsors: [],
    expectedPersonas: [],
    nextBestActions: [],
    relatedEvents: [],
    gtmInsights: null,
  };
}

function parseGeminiResponse(response, context = {}) {
  try {
    // Check if response was blocked or had issues
    const candidate = response.candidates?.[0];
    if (!candidate) {
      console.error('No candidates in response:', JSON.stringify(response).substring(0, 1000));
      throw new Error('No response candidates from API');
    }
    
    // Check finish reason
    const finishReason = candidate.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn('Unusual finish reason:', finishReason);
      if (finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety filters. Try a different page.');
      }
      if (finishReason === 'MAX_TOKENS') {
        console.warn('Response may be truncated - max tokens reached');
      }
    }
    
    // Extract the text content from Gemini's response
    const textContent = candidate.content?.parts?.[0]?.text;
    
    console.log('Gemini raw response length:', textContent?.length || 0);
    
    if (!textContent) {
      console.error('No text content in response:', JSON.stringify(response).substring(0, 500));
      throw new Error('No content in API response');
    }

    let jsonStr = extractBestEffortJson(textContent);

    if (finishReason === 'MAX_TOKENS') {
      console.warn('Response was truncated by max tokens; using best-effort JSON recovery');
    }
    
    console.log('Attempting to parse JSON of length:', jsonStr.length);
    
    // Parse the JSON
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('First 1000 chars of jsonStr:', jsonStr.substring(0, 1000));
      console.error('Last 500 chars of jsonStr:', jsonStr.substring(jsonStr.length - 500));
      const fallbackData = extractFallbackEventData(jsonStr || textContent);
      if (fallbackData) {
        console.warn('Using fallback event extraction due to malformed JSON response');
        reportParseTelemetry({
          stage: context.stage || 'analyze_event',
          status: 'parse_fallback',
          errorMessage: String(parseError?.message || parseError),
          pageUrl: context.pageUrl,
          pageTitle: context.pageTitle,
          finishReason: finishReason || null,
          sampleReason: 'fallback',
          rawResponseText: textContent,
          recoveredJsonText: jsonStr,
          parsedEventName: fallbackData.eventName,
          parsedStartDate: fallbackData.startDate,
        });
        return fallbackData;
      }
      reportParseTelemetry({
        stage: context.stage || 'analyze_event',
        status: 'parse_error',
        errorMessage: String(parseError?.message || parseError),
        pageUrl: context.pageUrl,
        pageTitle: context.pageTitle,
        finishReason: finishReason || null,
        sampleReason: 'parse_failure',
        rawResponseText: textContent,
        recoveredJsonText: jsonStr,
      });
      throw parseError;
    }
    
    // Validate required fields exist
    // Handle both 'people' and legacy 'speakers' field names
    const people = Array.isArray(data.people) ? data.people : (Array.isArray(data.speakers) ? data.speakers : []);
    
    const parsedResult = {
      eventName: data.eventName || 'Unknown Event',
      date: data.date || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      location: data.location || null,
      description: data.description || null,
      estimatedAttendees: data.estimatedAttendees || null,
      people: people,
      sponsors: Array.isArray(data.sponsors) ? data.sponsors : [],
      expectedPersonas: Array.isArray(data.expectedPersonas) ? data.expectedPersonas : [],
      nextBestActions: Array.isArray(data.nextBestActions) ? data.nextBestActions : [],
      relatedEvents: Array.isArray(data.relatedEvents) ? data.relatedEvents : [],
      gtmInsights: data.gtmInsights || null
    };

    if (shouldSampleParseTelemetry()) {
      reportParseTelemetry({
        stage: context.stage || 'analyze_event',
        status: 'parse_success',
        pageUrl: context.pageUrl,
        pageTitle: context.pageTitle,
        finishReason: finishReason || null,
        sampleReason: 'success_sample',
        rawResponseText: textContent,
        recoveredJsonText: jsonStr,
        parsedEventName: parsedResult.eventName,
        parsedStartDate: parsedResult.startDate,
      });
    }

    return parsedResult;
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    reportParseTelemetry({
      stage: context.stage || 'analyze_event',
      status: 'parse_error',
      errorMessage: String(error?.message || error),
      pageUrl: context.pageUrl,
      pageTitle: context.pageTitle,
    });
    throw new Error('Failed to parse event data. The page might not be an event page.');
  }
}

// Handle persona chat
async function handlePersonaChat(request) {
  const { persona, eventData, userProfile, chatHistory, userMessage } = request;
  const apiKeyOverride = resolveApiKeyOverride(userProfile);
  
  const prompt = buildPersonaChatPrompt(persona, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKeyOverride, prompt);
  
  // Extract text reply
  const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('No response from AI');
  }
  
  return { reply: textContent.trim() };
}

function buildPersonaChatPrompt(persona, eventData, userProfile, chatHistory, userMessage) {
  const historyText = chatHistory.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');
  
  return `You are a sales coach helping a GTM professional prepare for conversations at a conference.

CONTEXT:
- Event: ${eventData.eventName || 'Conference'}
- Target Persona: ${persona.persona}
- Persona Pain Points: ${(persona.painPoints || []).join(', ') || 'Unknown'}
- User's Company: ${userProfile.companyName || 'Unknown'}
- User's Product: ${userProfile.product || 'Unknown'}
- Value Proposition: ${userProfile.valueProp || 'Unknown'}
- User's Role: ${userProfile.yourRole || 'Sales'}

PERSONA DETAILS:
- Conversation Starters: ${(persona.conversationStarters || []).join(' | ') || 'None provided'}
- Keywords to use: ${(persona.keywords || []).join(', ') || 'None provided'}

CHAT HISTORY:
${historyText || 'None yet'}

USER'S QUESTION: ${userMessage}

Provide a helpful, concise response. Give specific, actionable advice for engaging this persona at this event. Be conversational and practical. Keep response under 150 words.`;
}

// Handle target person chat
async function handleTargetChat(request) {
  const { person, eventData, userProfile, chatHistory, userMessage } = request;
  const apiKeyOverride = resolveApiKeyOverride(userProfile);
  
  const prompt = buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKeyOverride, prompt);
  
  const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('No response from AI');
  }
  
  return { reply: textContent.trim() };
}

function buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage) {
  const historyText = chatHistory.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');
  
  return `You are a sales coach helping a GTM professional prepare for a one-on-one conversation with a specific target at a conference.

TARGET PERSON:
- Name: ${person.name || 'Unknown'}
- Title/Role: ${person.title || person.role || 'Unknown'}
- Company: ${person.company || 'Unknown'}
- Event Role: ${person.role || 'Attendee'}

EVENT CONTEXT:
- Event: ${eventData.eventName || 'Conference'}
- Event Date: ${eventData.date || 'Unknown'}
- Location: ${eventData.location || 'Unknown'}

USER'S COMPANY/PRODUCT:
- Company: ${userProfile.companyName || 'Unknown'}
- Product: ${userProfile.product || 'Unknown'}
- Value Proposition: ${userProfile.valueProp || 'Unknown'}
- User's Role: ${userProfile.yourRole || 'Sales'}
- Target Personas: ${userProfile.targetPersonas || 'Not specified'}
- Target Industries: ${userProfile.targetIndustries || 'Not specified'}

CHAT HISTORY:
${historyText || 'None yet'}

USER'S QUESTION: ${userMessage}

Provide helpful, specific advice for engaging this particular person. Consider:
- Their likely pain points based on their role
- How the user's product specifically helps someone in their position
- Objections they might raise and how to handle them
- Good questions to ask to build rapport and qualify the opportunity

Be conversational and practical. Give concrete examples and scripts when appropriate. Keep response under 150 words.`;
}

// Handle target person chat
async function handleTargetChat(request) {
  const { person, eventData, userProfile, chatHistory, userMessage } = request;
  const apiKeyOverride = resolveApiKeyOverride(userProfile);
  
  const prompt = buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKeyOverride, prompt);
  
  const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('No response from AI');
  }
  
  return { reply: textContent.trim() };
}

function buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage) {
  const historyText = chatHistory.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');
  
  return `You are a sales coach helping a GTM professional prepare for a one-on-one conversation with a specific target at a conference.

TARGET PERSON:
- Name: ${person.name || 'Unknown'}
- Title/Role: ${person.title || person.role || 'Unknown'}
- Company: ${person.company || 'Unknown'}
- Event Role: ${person.role || 'Attendee'}

EVENT CONTEXT:
- Event: ${eventData.eventName || 'Conference'}
- Event Date: ${eventData.date || 'Unknown'}
- Location: ${eventData.location || 'Unknown'}

USER'S COMPANY/PRODUCT:
- Company: ${userProfile.companyName || 'Unknown'}
- Product: ${userProfile.product || 'Unknown'}
- Value Proposition: ${userProfile.valueProp || 'Unknown'}
- User's Role: ${userProfile.yourRole || 'Sales'}
- Target Personas: ${userProfile.targetPersonas || 'Not specified'}
- Target Industries: ${userProfile.targetIndustries || 'Not specified'}

CHAT HISTORY:
${historyText || 'None yet'}

USER'S QUESTION: ${userMessage}

Provide helpful, specific advice for engaging this particular person. Consider:
- Their likely pain points based on their role
- How the user's product specifically helps someone in their position
- Objections they might raise and how to handle them
- Good questions to ask to build rapport and qualify the opportunity

Be conversational and practical. Give concrete examples and scripts when appropriate. Keep response under 150 words.`;
}

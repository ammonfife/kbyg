// Background service worker for API calls

// Import auth and backend API files
importScripts('supabase-client.js', 'config.js', 'backend-api.js');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// Backend API initialization
let backendAPIInitialized = false;

async function ensureBackendAPIInitialized() {
  if (!backendAPIInitialized) {
    await backendAPI.initialize();
    backendAPIInitialized = true;
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
  const apiKey = profile.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('API key not configured. Please add your Gemini API key in settings.');
  }

  const { content, url, title } = request;
  
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

Only return confidence="high" when you are 100% certain the WHOLE PAGE is a dedicated event page.`;

  const response = await callGeminiAPI(apiKey, prompt);
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
  // Get API key from user profile
  const profile = request.userProfile || {};
  const apiKey = profile.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('API key not configured. Please add your Gemini API key in settings.');
  }

  const { content, url, title } = request;

  // Build the prompt with user context
  const prompt = buildAnalysisPrompt(content, url, title, profile);

  // Call Gemini API
  const response = await callGeminiAPI(apiKey, prompt);

  // Parse the response
  const data = parseGeminiResponse(response);

  // ✨ Save to backend database
  try {
    await ensureBackendAPIInitialized();
    
    const eventData = {
      url: url,
      eventName: data.eventName,
      date: data.date,
      startDate: data.startDate || data.date,
      endDate: data.endDate || data.date,
      location: data.location,
      description: data.description,
      estimatedAttendees: data.estimatedAttendees || 0,
      people: data.people || [],
      sponsors: data.sponsors || [],
      expectedPersonas: data.expectedPersonas || [],
      nextBestActions: data.nextBestActions || [],
      relatedEvents: data.relatedEvents || [],
      analyzedAt: new Date().toISOString(),
    };

    const saveResult = await backendAPI.saveEvent(eventData);
    console.log('[KBYG Backend] Event saved to database:', saveResult.eventId);
    
    // Add backend metadata to response
    data.backendSaved = true;
    data.backendEventId = saveResult.eventId;
  } catch (backendError) {
    console.error('[KBYG Backend] Failed to save event:', backendError);
    data.backendSaved = false;
    data.backendError = backendError.message;
  }

  return { data };
}

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userProfile'], (result) => {
      resolve(result.userProfile?.geminiApiKey || null);
    });
  });
}

function buildAnalysisPrompt(content, url, title, profile) {
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

  return `You are an AI assistant helping a Go-To-Market (GTM) team analyze conference and event websites.
${userContext}
${personaGuidance}

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

async function callGeminiAPI(apiKey, prompt) {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 400 && errorData.error?.message?.includes('API key')) {
      throw new Error('Invalid API key. Please check your Gemini API key in settings.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
}

function parseGeminiResponse(response) {
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

    // Try to extract JSON from the response
    let jsonStr = textContent;
    
    // Try multiple patterns to extract JSON
    // Pattern 1: Markdown code blocks with json tag
    let jsonMatch = textContent.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Pattern 2: Any markdown code blocks
      jsonMatch = textContent.match(/```\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Pattern 3: Try to find JSON object directly (starts with { and ends with })
        const jsonObjectMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }
    }
    
    // Clean up common issues
    jsonStr = jsonStr.trim();
    
    // Remove any trailing commas before closing brackets (common LLM error)
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix truncated JSON by attempting to close it
    if (finishReason === 'MAX_TOKENS' || !jsonStr.endsWith('}')) {
      console.warn('Attempting to fix possibly truncated JSON');
      // Count unclosed braces and brackets
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      const openBrackets = (jsonStr.match(/\[/g) || []).length;
      const closeBrackets = (jsonStr.match(/\]/g) || []).length;
      
      // Add missing closing characters
      let suffix = '';
      for (let i = 0; i < openBrackets - closeBrackets; i++) suffix += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) suffix += '}';
      
      if (suffix) {
        // Remove any trailing incomplete content (like partial strings or numbers)
        jsonStr = jsonStr.replace(/,\s*"[^"]*$/, ''); // Remove incomplete string property
        jsonStr = jsonStr.replace(/,\s*$/, ''); // Remove trailing comma
        jsonStr += suffix;
        console.log('Added closing characters:', suffix);
      }
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
      throw parseError;
    }
    
    // Validate required fields exist
    // Handle both 'people' and legacy 'speakers' field names
    const people = Array.isArray(data.people) ? data.people : (Array.isArray(data.speakers) ? data.speakers : []);
    
    return {
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
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    throw new Error('Failed to parse event data. The page might not be an event page.');
  }
}

// Handle persona chat
async function handlePersonaChat(request) {
  const { persona, eventData, userProfile, chatHistory, userMessage } = request;
  const apiKey = userProfile?.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('API key not configured');
  }
  
  const prompt = buildPersonaChatPrompt(persona, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKey, prompt);
  
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
  const apiKey = userProfile?.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('API key not configured');
  }
  
  const prompt = buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKey, prompt);
  
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
  const apiKey = userProfile?.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('API key not configured');
  }
  
  const prompt = buildTargetChatPrompt(person, eventData, userProfile, chatHistory, userMessage);
  const response = await callGeminiAPI(apiKey, prompt);
  
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

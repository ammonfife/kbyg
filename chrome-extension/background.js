// Background service worker for API calls

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
});

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

  return `You are an AI assistant helping a Go-To-Market (GTM) team analyze conference and event websites.
${userContext}
Extract ALL people and companies from this event page. Return a JSON object:

{
  "eventName": "Name of the event",
  "date": "Event date(s)",
  "location": "Location or Virtual",
  "description": "Brief description",
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
- Look through the entire page content carefully
- Return ONLY valid JSON, no other text

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
    // Extract the text content from Gemini's response
    const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textContent) {
      throw new Error('No content in API response');
    }

    // Try to extract JSON from the response
    // Sometimes the model wraps it in markdown code blocks
    let jsonStr = textContent;
    
    // Remove markdown code blocks if present
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Parse the JSON
    const data = JSON.parse(jsonStr.trim());
    
    // Validate required fields exist
    // Handle both 'people' and legacy 'speakers' field names
    const people = Array.isArray(data.people) ? data.people : (Array.isArray(data.speakers) ? data.speakers : []);
    
    return {
      eventName: data.eventName || 'Unknown Event',
      date: data.date || null,
      location: data.location || null,
      description: data.description || null,
      people: people,
      sponsors: Array.isArray(data.sponsors) ? data.sponsors : [],
      expectedPersonas: Array.isArray(data.expectedPersonas) ? data.expectedPersonas : [],
      nextBestActions: Array.isArray(data.nextBestActions) ? data.nextBestActions : [],
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

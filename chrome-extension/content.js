// Content script for extracting page content

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    const content = extractPageContent();
    sendResponse({ content });
  }
  return true; // Keep message channel open for async response
});

// Extract relevant content from the page
function extractPageContent() {
  // Remove script, style, and other non-content elements
  const elementsToRemove = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas'];
  
  // Clone the body to avoid modifying the actual page
  const bodyClone = document.body.cloneNode(true);
  
  // Remove unwanted elements
  elementsToRemove.forEach(tag => {
    const elements = bodyClone.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });
  
  // Try to identify main content areas
  const mainContent = findMainContent(bodyClone);

  // Extract structured agenda/session data for better parsing on complex event pages
  const sessionBlocks = extractSessionBlocks(bodyClone);
  const speakerDirectory = extractSpeakerDirectory(bodyClone);
  const sponsorCandidates = extractSponsorCandidates(bodyClone);
  
  // Extract structured data if available
  const structuredData = extractStructuredData();
  
  // Get meta information
  const metaInfo = extractMetaInfo();
  
  // Compile the content
  const content = {
    url: window.location.href,
    title: document.title,
    meta: metaInfo,
    structuredData: structuredData,
    mainText: mainContent.text,
    html: mainContent.html.substring(0, 50000), // Limit HTML size
    sessionBlocks: sessionBlocks.slice(0, 250),
    speakerDirectory: speakerDirectory.slice(0, 300),
    sponsorCandidates: sponsorCandidates.slice(0, 200)
  };
  
  return content;
}

// Find main content areas of the page
function findMainContent(container) {
  // Priority order for finding main content
  const mainSelectors = [
    'main',
    '[role="main"]',
    '#main-content',
    '#content',
    '.main-content',
    '.content',
    'article',
    '.event-details',
    '.event-content',
    '.speakers',
    '.sponsors',
    '.agenda'
  ];
  
  let mainElement = null;
  
  for (const selector of mainSelectors) {
    mainElement = container.querySelector(selector);
    if (mainElement) break;
  }
  
  // Fall back to body if no main content found
  if (!mainElement) {
    mainElement = container;
  }
  
  // Clean up the text
  const text = cleanText(mainElement.innerText || mainElement.textContent || '');
  
  return {
    text: text.substring(0, 30000), // Limit text size
    html: mainElement.innerHTML || ''
  };
}

function extractSessionBlocks(container) {
  const blocks = [];
  const seen = new Set();

  const sessionNodes = container.querySelectorAll(
    '.session_content_wrapper, .session_content_extend, li[class*="session"], .scheduleday_wrapper li.themeborder'
  );

  sessionNodes.forEach((node) => {
    const title = cleanText(
      node.querySelector('.session_title h6, .session_title, h6, h5, h4')?.textContent || ''
    );
    const time = cleanText(
      node.querySelector('.session_start_time, time, [class*="time"]')?.textContent || ''
    );
    const speakersText = cleanText(
      node.querySelector('.session_speakers, [class*="speaker"]')?.textContent || ''
    );
    const location = cleanText(
      node.querySelector('.session_location_content, .session_location, [class*="location"]')?.textContent || ''
    );
    const description = cleanText(
      node.querySelector('.session_excerpt, [class*="excerpt"], p')?.textContent || ''
    );

    if (!title || title.length < 4) return;

    const key = `${title}|${time}|${location}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    blocks.push({
      title,
      time: time || null,
      speakersText: speakersText || null,
      location: location || null,
      description: description || null
    });
  });

  return blocks;
}

function extractSpeakerDirectory(container) {
  const people = [];
  const seen = new Set();

  const anchors = container.querySelectorAll('a[href*="/speaker/"]');
  anchors.forEach((anchor) => {
    const name = cleanText(anchor.textContent || '');
    if (!name || name.length < 3) return;

    const href = anchor.getAttribute('href') || '';
    const key = `${name}|${href}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const containerText = cleanText(anchor.closest('.session_speakers, li, .session_content, .speaker')?.textContent || '');

    people.push({
      name,
      profileUrl: href || null,
      context: containerText || null
    });
  });

  return people;
}

function extractSponsorCandidates(container) {
  const sponsors = [];
  const seen = new Set();

  const sponsorSections = container.querySelectorAll('[class*="sponsor"], [id*="sponsor"]');
  sponsorSections.forEach((section) => {
    const labels = section.querySelectorAll('a, img, h2, h3, h4, h5, h6, span, li');
    labels.forEach((el) => {
      let name = '';
      if (el.tagName === 'IMG') {
        name = cleanText(el.getAttribute('alt') || '');
      } else {
        name = cleanText(el.textContent || '');
      }

      if (!name || name.length < 2 || name.length > 120) return;
      if (/sponsor|sponsorship|opportunities/i.test(name)) return;

      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      sponsors.push(name);
    });
  });

  return sponsors;
}

// Extract JSON-LD and other structured data
function extractStructuredData() {
  const structuredData = [];
  
  // Look for JSON-LD scripts
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      structuredData.push(data);
    } catch (e) {
      // Invalid JSON, skip
    }
  });
  
  // Look for microdata
  const eventElements = document.querySelectorAll('[itemtype*="Event"]');
  eventElements.forEach(el => {
    const eventData = {
      type: 'microdata',
      name: el.querySelector('[itemprop="name"]')?.textContent,
      startDate: el.querySelector('[itemprop="startDate"]')?.getAttribute('content'),
      endDate: el.querySelector('[itemprop="endDate"]')?.getAttribute('content'),
      location: el.querySelector('[itemprop="location"]')?.textContent
    };
    if (eventData.name) {
      structuredData.push(eventData);
    }
  });
  
  return structuredData;
}

// Extract meta information
function extractMetaInfo() {
  const meta = {};
  
  // Open Graph data
  const ogTags = ['og:title', 'og:description', 'og:type', 'og:url', 'og:site_name'];
  ogTags.forEach(tag => {
    const element = document.querySelector(`meta[property="${tag}"]`);
    if (element) {
      meta[tag] = element.getAttribute('content');
    }
  });
  
  // Standard meta tags
  const metaTags = ['description', 'keywords', 'author'];
  metaTags.forEach(tag => {
    const element = document.querySelector(`meta[name="${tag}"]`);
    if (element) {
      meta[tag] = element.getAttribute('content');
    }
  });
  
  return meta;
}

// Clean up extracted text
function cleanText(text) {
  return text
    .replace(/[ \t]+/g, ' ')        // Normalize spaces and tabs
    .replace(/\n{3,}/g, '\n\n')      // Collapse excessive line breaks
    .trim();
}

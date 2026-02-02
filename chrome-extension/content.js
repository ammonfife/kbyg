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
    html: mainContent.html.substring(0, 50000) // Limit HTML size
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
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/\n\s*\n/g, '\n')      // Remove empty lines
    .replace(/\t/g, ' ')            // Replace tabs
    .trim();
}

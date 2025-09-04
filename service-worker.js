// Ultra-Optimized Service Worker for RENN.AI CRM
// Implements advanced caching strategies, background sync, and performance optimization

const CACHE_NAME = "renn-ai-v2.0.0";
const DYNAMIC_CACHE = "renn-ai-dynamic-v2.0.0";
const API_CACHE = "renn-ai-api-v2.0.0";

// Cache configuration with different strategies per resource type
const CACHE_CONFIG = {
  // Critical resources cached immediately
  STATIC_ASSETS: [
    "/",
    "/Login.html",
    "/dashboard.html",
    "/static/scripts/app.js",
    "/static/dist/main.css",
    "/manifest.json"
  ],
  
  // External resources with fallbacks
  EXTERNAL_ASSETS: [
    "https://cdn.tailwindcss.com/3.3.0",
    "https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Inter:wght@400;500&display=swap"
  ],
  
  // API endpoints for offline functionality
  API_ROUTES: [
    "/api/campaigns",
    "/api/analytics/overview",
    "/api/performance"
  ],
  
  // Cache TTL (Time To Live) in milliseconds
  TTL: {
    STATIC: 7 * 24 * 60 * 60 * 1000,     // 7 days
    DYNAMIC: 24 * 60 * 60 * 1000,        // 24 hours
    API: 5 * 60 * 1000,                   // 5 minutes
    IMAGES: 30 * 24 * 60 * 60 * 1000      // 30 days
  }
};

// Performance metrics tracking
let performanceMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  offlineRequests: 0,
  backgroundSyncs: 0
};

// Install event - Enhanced with priority caching
self.addEventListener("install", event => {
  console.log("🔧 Service Worker installing...");
  
  event.waitUntil(
    Promise.all([
      // Cache critical static assets
      caches.open(CACHE_NAME).then(cache => {
        console.log("📦 Caching critical assets");
        return cache.addAll(CACHE_CONFIG.STATIC_ASSETS);
      }),
      
      // Cache external resources with error handling
      caches.open(DYNAMIC_CACHE).then(cache => {
        console.log("🌐 Caching external assets");
        return Promise.allSettled(
          CACHE_CONFIG.EXTERNAL_ASSETS.map(url => 
            cache.add(url).catch(err => 
              console.warn(`Failed to cache ${url}:`, err)
            )
          )
        );
      }),
      
      // Initialize IndexedDB for offline queue
      initializeOfflineDB()
    ]).then(() => {
      console.log("✅ Service Worker installation complete");
      // Skip waiting to activate immediately
      self.skipWaiting();
    })
  );
});

// Activate event - Enhanced cleanup and client claiming
self.addEventListener("activate", event => {
  console.log("⚡ Service Worker activating...");
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log("🗑️ Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Clean up expired cache entries
      cleanupExpiredCache(),
      
      // Initialize performance monitoring
      initializePerformanceMonitoring()
    ]).then(() => {
      console.log("🚀 Service Worker activated and ready");
      // Claim all clients immediately
      return self.clients.claim();
    })
  );
});

// Advanced fetch handler with multiple caching strategies
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests for caching
  if (request.method !== 'GET') {
    return handleNonGetRequest(event);
  }
  
  // Route to appropriate caching strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
  } else if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isExternalAsset(url)) {
    event.respondWith(handleExternalAsset(request));
  } else {
    event.respondWith(handleDynamicContent(request));
  }
});

// API request handler with stale-while-revalidate
async function handleApiRequest(request) {
  const cacheKey = `${request.url}?${Date.now() - (Date.now() % CACHE_CONFIG.TTL.API)}`;
  
  try {
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      performanceMetrics.cacheHits++;
      
      // Return cached data immediately, fetch fresh data in background
      fetchAndUpdateCache(request, cache, cacheKey);
      return cachedResponse;
    }
    
    // No cache hit - fetch from network
    performanceMetrics.cacheMisses++;
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(cacheKey, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn("API request failed:", error);
    
    // Try to return stale cache data
    const cache = await caches.open(API_CACHE);
    const staleResponse = await cache.match(request.url);
    
    if (staleResponse) {
      console.log("📱 Serving stale API data offline");
      performanceMetrics.offlineRequests++;
      return staleResponse;
    }
    
    // Return offline page for critical API failures
    return generateOfflineResponse(request);
  }
}

// Static asset handler with cache-first strategy
async function handleStaticAsset(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      performanceMetrics.cacheHits++;
      return cachedResponse;
    }
    
    // Fetch from network and cache
    performanceMetrics.cacheMisses++;
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn("Static asset fetch failed:", error);
    return generateFallbackResponse(request);
  }
}

// External asset handler with network-first strategy
async function handleExternalAsset(request) {
  try {
    // Try network first for external assets
    performanceMetrics.networkRequests++;
    const networkResponse = await fetch(request, { 
      mode: 'cors',
      cache: 'force-cache' 
    });
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    // Fallback to cache
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log("📱 Serving cached external asset offline");
      performanceMetrics.cacheHits++;
      return cachedResponse;
    }
    
    return generateFallbackResponse(request);
  }
}

// Dynamic content handler with network-first strategy
async function handleDynamicContent(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    // Try cache fallback
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      performanceMetrics.cacheHits++;
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/dashboard.html');
    }
    
    throw error;
  }
}

// Background fetch for stale-while-revalidate
async function fetchAndUpdateCache(request, cache, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(cacheKey, response.clone());
      
      // Notify clients of fresh data
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'CACHE_UPDATED',
          url: request.url,
          timestamp: Date.now()
        });
      });
    }
  } catch (error) {
    console.warn("Background cache update failed:", error);
  }
}

// Handle non-GET requests (POST, PUT, DELETE)
function handleNonGetRequest(event) {
  const request = event.request;
  
  // For API requests, implement offline queue
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(async () => {
        console.log("📱 Queueing offline request:", request.url);
        await queueOfflineRequest(request);
        return new Response(
          JSON.stringify({ 
            queued: true, 
            message: "Request queued for when online" 
          }),
          { 
            status: 202,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
  }
}

// Background sync for offline requests
self.addEventListener('sync', event => {
  console.log("🔄 Background sync triggered:", event.tag);
  performanceMetrics.backgroundSyncs++;
  
  if (event.tag === 'offline-requests') {
    event.waitUntil(processOfflineQueue());
  } else if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupExpiredCache());
  }
});

// Process offline request queue
async function processOfflineQueue() {
  try {
    const db = await openOfflineDB();
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    const requests = await getAllFromStore(store);
    
    for (const queuedRequest of requests) {
      try {
        const response = await fetch(queuedRequest.url, queuedRequest.options);
        
        if (response.ok) {
          // Request successful - remove from queue
          await store.delete(queuedRequest.id);
          console.log("✅ Processed offline request:", queuedRequest.url);
          
          // Notify clients
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'OFFLINE_REQUEST_PROCESSED',
              url: queuedRequest.url,
              success: true
            });
          });
        }
      } catch (error) {
        console.warn("Failed to process offline request:", error);
        // Keep in queue for next sync
      }
    }
  } catch (error) {
    console.error("Error processing offline queue:", error);
  }
}

// Push notification handler
self.addEventListener('push', event => {
  console.log("📨 Push notification received");
  
  const options = {
    body: event.data ? event.data.text() : 'New CRM update available',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View Dashboard',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/close.png'
      }
    ],
    requireInteraction: true,
    tag: 'crm-update'
  };
  
  event.waitUntil(
    self.registration.showNotification('RENN.AI CRM', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log("🔔 Notification clicked:", event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboard.html')
    );
  } else if (event.action === 'dismiss') {
    // Just close - no action needed
    console.log("Notification dismissed by user");
  }
});

// Utility functions
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.html', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         CACHE_CONFIG.STATIC_ASSETS.includes(url.pathname);
}

function isExternalAsset(url) {
  return url.origin !== self.location.origin;
}

async function cleanupExpiredCache() {
  const cacheNames = await caches.keys();
  
  for (const cacheName of cacheNames) {
    if (cacheName.includes('renn-ai')) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      
      for (const request of requests) {
        const response = await cache.match(request);
        const cacheTime = response.headers.get('sw-cache-time');
        
        if (cacheTime) {
          const age = Date.now() - parseInt(cacheTime);
          const maxAge = cacheName.includes('api') ? CACHE_CONFIG.TTL.API : CACHE_CONFIG.TTL.STATIC;
          
          if (age > maxAge) {
            await cache.delete(request);
            console.log("🗑️ Expired cache entry removed:", request.url);
          }
        }
      }
    }
  }
}

function generateOfflineResponse(request) {
  if (request.url.includes('/api/')) {
    return new Response(
      JSON.stringify({ 
        error: "Offline", 
        message: "This feature requires an internet connection",
        cached: false 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  return new Response("Offline", { status: 503 });
}

function generateFallbackResponse(request) {
  // Provide meaningful fallbacks for different resource types
  if (request.url.includes('.css')) {
    return new Response('/* Fallback CSS */', {
      headers: { 'Content-Type': 'text/css' }
    });
  }
  
  if (request.url.includes('.js')) {
    return new Response('console.log("Fallback JS loaded");', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  
  return new Response("Resource unavailable", { status: 503 });
}

// IndexedDB utilities for offline queue
async function initializeOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RennAI-Offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('requests')) {
        const store = db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function openOfflineDB() {
  return initializeOfflineDB();
}

async function queueOfflineRequest(request) {
  try {
    const db = await openOfflineDB();
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' ? await request.clone().text() : null,
      timestamp: Date.now()
    };
    
    await store.add(requestData);
    
    // Register background sync
    if ('serviceWorker' in navigator && 'sync' in self.ServiceWorkerRegistration.prototype) {
      self.registration.sync.register('offline-requests');
    }
  } catch (error) {
    console.error("Error queueing offline request:", error);
  }
}

async function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Performance monitoring initialization
function initializePerformanceMonitoring() {
  // Reset metrics periodically
  setInterval(() => {
    console.log("📊 Service Worker Performance Metrics:", performanceMetrics);
    
    // Send metrics to main thread
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PERFORMANCE_METRICS',
          metrics: { ...performanceMetrics }
        });
      });
    });
    
    // Reset counters (keep running totals in IndexedDB if needed)
    performanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0,
      offlineRequests: 0,
      backgroundSyncs: 0
    };
  }, 60000); // Every minute
}

// Message handler for client communication
self.addEventListener('message', event => {
  const { type } = event.data;
  
  switch (type) {
    case 'GET_PERFORMANCE_METRICS':
      event.ports[0].postMessage(performanceMetrics);
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    case 'FORCE_UPDATE':
      self.skipWaiting();
      break;
      
    default:
      console.log("Unknown message type:", type);
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

console.log("🚀 RENN.AI Ultra-Optimized Service Worker loaded successfully");
console.log("📈 Performance optimizations enabled:");
console.log("   - Stale-while-revalidate API caching");
console.log("   - Advanced cache strategies by resource type");
console.log("   - Offline request queuing with background sync");
console.log("   - Performance metrics tracking");
console.log("   - Progressive cache cleanup");
const DB_NAME = 'taranga_plus_db';
const STORE_NAME = 'logo_cache';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLogoFromCache(request) {
  const url = new URL(request.url);
  // We use a query parameter to identify the channel logo explicitly
  const channelId = url.searchParams.get('channelId');
  
  if (!channelId) return fetch(request);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(`logo_${channelId}`);
      
      getReq.onsuccess = async () => {
        if (getReq.result) {
          // Return the blob from IndexedDB immediately
          resolve(new Response(getReq.result, {
            headers: { 'Content-Type': getReq.result.type || 'image/png' }
          }));
        } else {
          // Fallback to fetch and cache
          try {
            const params = new URLSearchParams(url.search);
            params.delete('channelId');
            const queryString = params.toString();
            const fetchUrl = url.origin + url.pathname + (queryString ? '?' + queryString : '');
            const response = await fetch(fetchUrl);
            if (response.ok) {
              const blob = await response.clone().blob();
              const writeTx = db.transaction(STORE_NAME, 'readwrite');
              writeTx.objectStore(STORE_NAME).put(blob, `logo_${channelId}`);
            }
            resolve(response);
          } catch (err) {
            resolve(new Response(null, { status: 404 }));
          }
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    return fetch(request);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Intecept image fetch requests if they have our channelId marker
  if (event.request.url.includes('channelId=')) {
    event.respondWith(getLogoFromCache(event.request));
  }
});

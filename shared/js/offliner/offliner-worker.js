'use strict';

var CACHE_NAME = 'cache-v1';

console.log('Offliner running!', typeof self);

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Offliner > Opened cache');
        importScripts('offliner-resources.js');
        return Promise.all(resources.map(url => {
          var bustedUrl = url + '?__b=' + Date.now();

          var request = new Request(bustedUrl, { mode: 'no-cors' });

          // But when caching, the cache is for the original URL.
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              console.log('Offliner cached >', url);
              cache.put(url, response);
            }
          });
        }));
      })
  );
});

self.addEventListener('fetch', function(event) {
  console.log('Offliner > Fetch method', !!caches, typeof event.respondWith);
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        console.log('Offliner > Fetching', event.request.url);
        // Cache hit - return response
        if (response) {
          console.log('Offliner > Returning from cache', response.status);
          return response;
        }

        console.log('Offliner > No cached');

        var fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          function(response) {
            // Check if we received a valid response
            if(!response || response.status !== 200 ||
                response.type !== 'basic') {
              return response;
            }

            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      }).catch(function(error) {
        console.error(error);
      })
    );
});

self.addEventListener('activate', function(event) {
  console.log('Offliner has been activated!');
});

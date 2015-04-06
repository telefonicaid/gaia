// **How to write a fetcher**

// Remember including offliner will export the `off` module with a namespace
// reserved for `fetchers`. Put your fetcher inside.
self.off.fetchers.urls = {

  // Provide a type for your fetcher. All resources with the specified type
  // will be handled by your fetcher.
  type: 'url',

  // Provide a `normalize()` function if you want to provide a shortcut for
  // resources. This case we allow to simply pass a string and we normalize
  // it to a resource that can be handled by the `prefetch()` method.
  normalize: function (resource) {
    return { type: this.type, url: resource };
  },

  // The `prefetch()` is passed with a list of resources of the fetcher's type
  // and the cache to be populated. It must return a Promise resolving when
  // prefetching is done.
  prefetch: function (resources, cache) {
    return Promise.all(resources.map(function (resource) {
      return cache.match(new Request(resource.url)).then(response => {
        console.log(response && response.status);
        if (response && response.status === '200') {
          console.log('Offliner fetcher >', resource.url,  'already in cache');
          return Promise.resolve();
        } else {
          // The HTTP cache is still working when leaving the service worker via
          // `fetch()` so it's neccessary to bust the URL to recover a fresh copy.
          var bustedUrl = resource.url + '?__b=' + Date.now();

          // The request is for the busted url in no-cors mode to allow resources
          // from other origins.
          var request = new Request(bustedUrl, { mode: 'no-cors' });

          console.log('Offliner fetcher >', resource.url);
          // But when caching, the cache is for the original URL.
          return fetch(request).then(cache.put.bind(cache, resource.url));
        }
      });
    }));
  }
};

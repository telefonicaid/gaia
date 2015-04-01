
importScripts('offliner.min.js');

importScripts('offliner-fetcher-urls.js');

importScripts('offliner-source-cache.js');

importScripts('offliner-source-network.js');

importScripts('offliner-updater-reinstall.js');

importScripts('offliner-resources.js');

offliner = new off.Offliner();

console.log('Offliner instantiated!');

offliner.prefetch

  .use(off.fetchers.urls)

  .resources(off.resources);

offliner.fetch

  .use(off.sources.cache)

  .use(off.sources.network)

  .orFail();

offliner.standalone();

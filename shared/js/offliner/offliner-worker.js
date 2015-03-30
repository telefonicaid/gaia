
importScripts('offliner.min.js');

importScripts('offliner-resources.js');

offliner = new off.Offliner();

offliner.prefetch

  .use(off.fetchers.urls)

  .resources(off.resources);

offliner.fetch

  .use(off.sources.cache)

  .use(off.sources.network)

  .orFail();

offliner.update

  .option('period', '5m')

  .use(off.updaters.reinstall.onInstallOnly(true));

offliner.standalone();

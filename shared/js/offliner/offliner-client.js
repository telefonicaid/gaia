'use strict';

(function (exports) {

  var root = (function () {
    var root = new URL(
      document.currentScript.dataset.root || '',
      window.location.origin
    ).href;
    return root.endsWith('/') ? root : root + '/';
  }());

  var workerURL =
    root + (document.currentScript.dataset.worker || 'offliner-worker.js');

  exports.off = {
    install: function () {
      return navigator.serviceWorker.register(workerURL, {
        scope: root
      });
    }
  };

}(this));
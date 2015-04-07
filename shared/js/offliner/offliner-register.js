'use strict';

/* global off */

(function(exports) {

  function Register() {
    navigator.mozSetMessageHandler('connection', this.onConnection.bind(this));
  }

  Register.prototype = {
    onConnection: function(connectionRequest) {
      if (connectionRequest.keyword !== 'setup') {
        return;
      }

      var port = this.port = connectionRequest.port;
      port.onmessage = this.start.bind(this);
      port.start();
    },

    /**
     * It performs the installation task.
     */
    start: function(event) {
      if (this.installing) {
        // Installation in progress
        return;
      }

      this.installing = true;

      //off.on('installationDone', this.onInstall.bind(this));
      //off.on('installationFailed', this.onError.bind(this));

      off.install();
    },

    /**
     * This method is performed when all resources were prefetched.
     */
    onInstall: function() {
      this.port.postMessage('install');
      console.log('Offliner was installed properly');
      this.onClose();
    },

    /**
     * This method is performed when an error happens installing the offliner.
     */
    onError: function() {
      this.port.postMessage('failed');
      console.log('Offliner failed while installing');
      this.onClose();
    },

    onClose: function() {
      this.installing = false;
      window.close();
    }
  };

  exports.register = new Register();
}(window));

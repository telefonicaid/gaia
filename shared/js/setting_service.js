'use strict';

(function (exports) {
  function SettingService() {
    // Listen to IAC observe messages
    window.addEventListener('iac-appsettingrequired',
      this.handlerObserveResponse.bind(this));
  }

  SettingService.prototype = {
    _observers: [],

    handlerObserveResponse: function ss_handleResponse(evt) {
      var message = evt.detail;
      if (!evt || message.type !== 'observe') {
        return;
      }

      // Trigger callbacks
      this._observers.forEach(function(entry) {
        if (entry.name === message.name) {
          entry.callback(message.value);
        }
      });
    },

    get: function ss_get(settingKey) {
      if (!settingKey) {
        console.error('Missing parameter: settingKey');
        return;
      }

      return new Promise(function(resolve, reject) {
        window.addEventListener('iac-appsettingrequired',
          function getSettingListener(evt) {
            var message = evt.detail;

            if (!evt || message.type !== 'get' ||
              message.name != settingKey) {
                return;
            }

            resolve(message.value);
            window.removeEventListener('iac-appsettingrequired',
              getSettingListener);
        });

        this.sendRequest({
          type: 'get',
          name: settingKey
        });
      }.bind(this));
    },

    set: function ss_set(settingKey, settingValue) {
      if (!settingKey || typeof settingValue === 'undefined') {
        console.error('Missing parameter');
        return;
      }

      return new Promise(function(resolve, reject) {
        window.addEventListener('iac-appsettingrequired',
          function getSettingListener(evt) {
            var message = evt.detail;

            if (!evt || message.type !== 'set' ||
              message.name != settingKey) {
                return;
            }

            resolve(message.value);
            window.removeEventListener('iac-appsettingrequired',
              getSettingListener);
        });

        this.sendRequest({
          type: 'set',
          name: settingKey,
          value: settingValue
        });
      }.bind(this));
    },

    observe: function ss_observe(settingKey, defaultValue, callback) {
      if (typeof callback !== 'function') {
        console.error('Missing parameter: callback');
        return;
      }

      this._observers.push({
        name: settingKey,
        callback: callback
      });

      this.sendRequest({
        type: 'observe',
        name: settingKey,
        defaultValue: defaultValue
      });
    },

    unobserve: function ss_observe(settingKey, callback) {
      if (typeof callback !== 'function') {
        console.error('Missing parameter: callback');
        return;
      }

      this._removeObserver(settingKey, callback);

      this.sendRequest({
        type: 'unobserve',
        name: settingKey
      });
    },

    sendRequest: function ss_sendRequest(message) {
      navigator.mozApps.getSelf().onsuccess = function(evt) {
        var app = evt.target.result;
        app.connect('appsettingrequired').then(function onConnAccepted(ports) {
          console.info('AppSettingRequired IAC: ' + ports);
          ports.forEach(function(port) {
            console.info('AppSettingRequired IAC: ' + port);
            port.postMessage(message);
          });
        }, function onConnRejected(reason) {
          console.info('AppSettingRequired IAC is rejected');
          console.info(reason);
        });
      };
    },

    _removeObserver: function ss_removeObserve(settingKey, callback) {
      this._observers.forEach(function(value, index) {
        if (value.name === settingKey && value.callback === callback) {
          this._observers.splice(index, 1);
        }
      }.bind(this));
    }
  };

  exports.SettingService = new SettingService();
}(window));
'use strict';

/* This service is used to offer settings to privileged apps. */
(function (exports) {
  function SettingServiceIAC() {
    navigator.mozSetMessageHandler('connection', this.onConnection.bind(this));
    this.mozSettings = window.navigator.mozSettings;
    this.handleSettingChange = this.onSettingChange.bind(this);
  }

  SettingServiceIAC.prototype = {
    _observers: [],

    onConnection: function ss_onConnection(connectionRequest) {
      if (connectionRequest.keyword !== 'appsettingrequired') {
        window.DUMP('Invalid received message. Expected "appsettingrequired",' +
          ' got "' + connectionRequest.keyword + '"');
        return;
      }

      var port = connectionRequest.port;
      port.onmessage = this.handleRequest.bind(this);
      port.start();
    },

    handleRequest: function ss_handleRequest(evt) {
      if (!evt.data.type || !evt.data.name) {
        window.DUMP('Message received bad formed');
        return;
      }

      if (this[evt.data.type]) {
        this[evt.data.type](evt.data);
      }
    },

    get: function ss_get(data) {
      var lock = this.mozSettings.createLock();
      var request = lock.get(data.name);

      request.onsuccess = function() {
        window.DUMP('Get setting value success: ' +
          request.result[data.name]);
        this.respondRequest({
          type: 'get',
          name: data.name,
          value: request.result[data.name]
        });
      }.bind(this);

      request.onerror = function() {
        window.DUMP('Something went wrong');
        this.respondRequest({
          type: 'get',
          name: data.name,
          value: false
        });
      }.bind(this);
    },

    set: function ss_set(data) {
      if (!data.value) {
        window.DUMP('Message received bad formed. Missing parameter: value');
        return;
      }

      var lock = this.mozSettings.createLock();
      var cset = {};
      cset[data.name] = data.value;
      var request = lock.set(cset);

      request.onsuccess = function() {
        window.DUMP('Update setting value success');
        this.respondRequest({
          type: 'set',
          name: data.name,
          result: true
        });
      }.bind(this);

      request.onerror = function() {
        window.DUMP('Something went wrong');
        this.respondRequest({
          type: 'set',
          name: data.name,
          result: false
        });
      }.bind(this);
    },

    observe: function ss_observe(data) {
      if (!this.mozSettings) {
        window.setTimeout(function() {
          this.handleSettingChange(data.defaultValue);
        });
        return;
      }

      var request = this.mozSettings.createLock().get(data.name);

      request.onsuccess = function() {
        var value = typeof(request.result[data.name]) != 'undefined' ?
          request.result[data.name] : data.defaultValue;
        this.handleSettingChange(data.name, value);
      }.bind(this);

      var settingChanged = function settingChanged(evt) {
        this.handleSettingChange(data.name, evt.settingValue);
      }.bind(this);
      this.mozSettings.addObserver(data.name, settingChanged);
      this._observers.push({
        name: data.settingKey,
        observer: settingChanged
      });
    },

    unobserve: function ss_unobserve(data) {
      this._observers.forEach(function(value, index) {
        if (value.name === data.name) {
          this.mozSettings.removeObserver(value.name, value.observer);
          this._observers.splice(index, 1);
        }
      }.bind(this));
    },

    onSettingChange: function ss_onSettingChange(settingKey, settingValue) {
      this.respondRequest({
        type: 'observe',
        name: settingKey,
        value: settingValue
      });
    },

    respondRequest: function ss_respondRequest(response) {
      window.DUMP('response: ' + response);
      navigator.mozApps.getSelf().onsuccess = function(evt) {
        var app = evt.target.result;
        app.connect('appsettingrequired').then(function onConnAccepted(ports) {
          window.DUMP('AppSettingRequired IAC: ' + ports);
          ports.forEach(function(port) {
            window.DUMP('AppSettingRequired IAC: ' + port);
            port.postMessage(response);
          });
        }, function onConnRejected(reason) {
          window.DUMP('AppSettingRequired IAC is rejected');
          window.DUMP(reason);
        });
      };
    }
  };

  exports.SettingServiceIAC = new SettingServiceIAC();
}(window));
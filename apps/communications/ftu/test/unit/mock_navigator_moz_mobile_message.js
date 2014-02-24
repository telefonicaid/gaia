'use strict';

(function() {
  var listeners = [];

  function sms_send(callback) {
    callback();
  }

  function sms_addEventListener(name, cb) {
    listeners.push({name, cb});
  }

  window.MockNavigatorMozMobileMessage = {
    send: sms_send,
    addEventListener: _addEventListener
  };

})();

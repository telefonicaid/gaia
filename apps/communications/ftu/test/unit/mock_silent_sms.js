'use strict';

var MockSilentSMS = {
  send: function(cb) {
    cb();
  }
};

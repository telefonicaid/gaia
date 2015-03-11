(function(exports) {
  'use strict';

  function DateTimeFormat() {
    this.mInitialized = true;
  }
  DateTimeFormat.prototype = {
    localeFormat: function mockLocaleFormat(time, strFormat) {
      var d = new Date(time.getTime());

      switch (strFormat) {
        case 'dateTimeFormat_%x':
          return d.toLocaleFormat('%m/%d/%Y');
        default:
          return time.getTime() + ',' + strFormat;
      }
    }
  };

  var MockL10n = {

    get: function get(key, params) {
      if (params) {
        return key + JSON.stringify(params);
      }
      return key;
    },

    setAttributes: function(elem, key, params) {
      elem.setAttribute('data-l10n-id', key);
      elem.setAttribute('data-l10n-args', JSON.stringify(params));
    },

    DateTimeFormat: DateTimeFormat,

    once: function once() {
    },

    ready: function ready() {
    },

    language: {direction: 'ltr'}
  };

  exports.MockL10n = MockL10n;

}(this));

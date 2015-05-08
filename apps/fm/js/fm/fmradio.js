// navigator.mozFMRadio polyfill!
// https://developer.mozilla.org/es/docs/Web/API/Navigator/mozFMRadio

// I have to define the service protocol, and this is as good place as any. The
// protocol will be as follows:
// * Each request will have a numeric request id, set by the client
// * The answers will include the request id, so the client can know to which
//   request the answer corresponds

// For all the get|set operations:
//  * Request: { id: requestId,
//               data: {
//                 operation: 'set'|'get',
//                 name: propertyName,
//                 value: propertyValue (set request only)
//               }
//             }
// * Answer: { id: requestId,
//             result|error: Whatever }

// For all the invoke operations:
//  * Request: { id: requestId,
//               data: {
//                 operation: methodName,
//                 params: parameters (optional)
//               }
//             }
// * Answer: Let's assume that the request is handled properly

// For the onpropertychange operation
//  Request: { id: requestId,
//             data: {
//             operation: 'onpropertychange',
//             handler: desiredPropertyChange,
//             property: propertyToUpdatedWhenTriggered
//           },
// Answer:
//    { id: requestId,
//      data: {
//        result: {
//          handler: desiredPropertyChange,
//          propertyValue: newValueOfTheProperty
//        }
//      }
//    }


(function(window) {

  function debug(t) {
    console.log(t);
  }

  if (window.navigator.mozFMRadio) {
    // Hmm it's already available... so let's just use it and be done with it
    return;
  }

  // Wishful thinking at the moment...
  const FMRADIO_SERVICE = 'https://fmradioservice.gaiamobile.org';

  // It's nice being monothread...
  var _currentRequestId = 1;

  var serializeRequest = function(data) {
    var self = this;
    return {
      id: ++_currentRequestId,
      data: data,
      processAnswer: function(answer) {
        if (answer.error) {
          console.error(answer.error);
        } else {
          self[_getPropertyName(answer.result.name)] = answer.result.value;
 
          // This is a trick beacuse the current frequency could be null if the
          // radio is not enabled and we need to draw the UI with an initial
          // frequency
          if (answer.result.name === 'frequency' &&
            answer.result.value === null) {
            self[_getPropertyName(answer.result.name)] =
              self.frequencyLowerBound;
          }

          var onchange = '_on' + answer.result.name.toLowerCase() + 'change';
          // Trigger callback in order to force the update of the property value
          if (typeof self[onchange] === 'function') {
            self[onchange]({
              name: 'on' + answer.result.name.toLowerCase() + 'change',
              value: answer.result.value
            });
          }
        }
      }
    };
  };

  var _getPropertyName = function(name) {
    return 'real' + name.charAt(0).toUpperCase() + name.slice(1);
  }

  var _createAndQueueDOMRequest = function(data) {
    var request = new FakeDOMRequest(++_currentRequestId, data);
    navConnPromise.then(conn => conn.sendObject(request));

    return request;
  }

  var _createAndQueueRequest = function(data) {
    var request = {};
    request.serialize =
      serializeRequest.bind(window.navigator.mozFMRadio, data);

    navConnPromise.then(conn => conn.sendObject(request));
    return request;
  }

  window.navigator.mozFMRadio = {
    fakeEnabled: false,

    fakeAntennaAvailable: false,

    fakeFrequencyLowerBound: 87.5,

    fakeFrequencyUpperBound: 108,

    fakeChannelWidth: 0.1,

    disable: function fm_disable() {
      return _createAndQueueDOMRequest({
        operation: 'disable'
      });
    },

    enable: function fm_enable(frequency) {
      return _createAndQueueDOMRequest({
        operation: 'enable',
        params: frequency
      });
    },

    seekUp: function fm_seekUp() {
      return _createAndQueueDOMRequest({
        operation: 'seekUp'
      });
    },

    seekDown: function fm_seekDown() {
      return _createAndQueueDOMRequest({
        operation: 'seekDown'
      });
    },

    cancelSeek: function fm_cancelSeek() {
      return _createAndQueueDOMRequest({
        operation: 'cancelSeek'
      });
    },

    setFrequency: function fm_setFrequency(freq) {
      return _createAndQueueDOMRequest({
        operation: 'setFrequency',
        params: freq
      });
    },

    get enabled() {
      // Enabled value should be updated
      if (typeof this.realEnabled !== 'undefined' &&
        this.realEnabled !== null) {
          return this.realEnabled;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'enabled'
      });
      return this.fakeEnabled;
    },

    get antennaAvailable() {
      // Antenna available should be updated
      if (typeof this.realAntennaAvailable !== 'undefined' &&
          this.realAntennaAvailable !== null) {
            return this.realAntennaAvailable;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'antennaAvailable'
      });
      return this.fakeAntennaAvailable;
    },

    get frequency() {
      // Current frequency value should be updated
      if (typeof this.realFrequency !== 'undefined' &&
        this.realFrequency !== null) {
          return this.realFrequency;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'frequency'
      });
      // Let's assume that we're in the lower bound frequency
      // This is a trick beacuse the current frequency could be null if the
      // radio is not enabled and we need to draw the UI with an initial
      // frequency
      this.realFrequency = this.fakeFrequencyLowerBound;

      return this.fakeFrequencyLowerBound;
    },

    get frequencyUpperBound() {
      if (typeof this.realFrequencyUpperBound !== 'undefined' &&
        this.realFrequencyUpperBound !== null) {
          return this.realFrequencyUpperBound;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'frequencyUpperBound'
      });
      return this.fakeFrequencyUpperBound;
    },

    get frequencyLowerBound() {
      if (typeof this.realFrequencyLowerBound !== 'undefined' &&
        this.realFrequencyLowerBound !== null) {
          return this.realFrequencyLowerBound;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'frequencyLowerBound'
      });
      return this.fakeFrequencyLowerBound;
    },

    get channelWidth() {
      if (typeof this.realChannelWidth !== 'undefined' &&
        this.realChannelWidth !== null) {
          return this.realChannelWidth;
      }

      _createAndQueueRequest({
        operation: 'get',
        name: 'channelWidth'
      });
      return this.fakeChannelWidth;
    },

    _onchange: function(changeType, property, cb) {
      this['_on' + changeType] = cb;
      this['_on' + changeType + 'Id'] = this['_on' + changeType + 'Id'] ||
        ++_currentRequestId;
      var self = this;
      var commandObject = {
        serialize: function() {
          return {
            id: ++_currentRequestId,
            data: {
              operation: 'onpropertychange',
              handler: 'on' + changeType,
              property: property
            },
            processAnswer: answer => {
              if (answer.result) {
                self[_getPropertyName(property)] = answer.result.propertyValue;
                cb(answer.result);
              }
            }
          };
        }
      };
      navConnPromise.then(navConnHelper =>
        navConnHelper.sendObject(commandObject));
    }
  };

  var onChangeEvents = [
    {eventType: 'frequencychange', property: 'frequency'},
    {eventType: 'enabled', property: 'enabled'},
    {eventType: 'disabled', property: 'enabled'},
    {eventType: 'antennaavailablechange', property: 'antennaAvailable'}
  ];

  onChangeEvents.forEach(changeEvent => {
    Object.defineProperty(window.navigator.mozFMRadio,
      'on' + changeEvent.eventType, {
        set: function(cb) {
          this._onchange(changeEvent.eventType, changeEvent.property, cb);
        }
    });
  });

  /** POLYFILL PART **/
  var navConnPromise = new NavConnectHelper(FMRADIO_SERVICE);

  navConnPromise.then(function(){}, e => {
    debug('Got an exception while connecting ' + e);
    window.navigator.mozFMRadio = null;
  });

})(window);

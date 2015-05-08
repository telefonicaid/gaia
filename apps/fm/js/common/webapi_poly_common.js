(function(window) {

  // Helper for the common tasks for navigator.connect. This is not strictly
  // needed, but helps to do the things always the same way. That way being:
  // * The client app creates one (or as many as it needs) NavConnectHelper
  //   objects. Each NavConnectHelèr object is a promise that will fulfill when
  //   the connection is established.
  // * The fulfilled promise has an object that (so far) has only one method:
  //     * sendObject: Sends an object to the connected Service Worker. The
  //     object sent needs to implement a serialize method. The serialize method
  //     will return an object with:
  //       * id: a unique id for the object
  //       * data: A cloneable/transferrable object with the data that must be
  //         sent to the Worker.
  //       * processAnswer: A callback that will be called whenever there is
  //         an answer for this petition. Note that this callback can be
  //         executed  0-n times, depending on what the service is expected to
  //         do.
  function NavConnectHelper(serviceURL) {

    function debug(text) {
      console.log('*-*-* NavConnectHelper: ' + text);
    }

    return new Promise((resolve, reject) => {
      // navigator.connect port with the settings service, when the connection
      // is established.
      var _port = null;

      var _messageHandlers = {};

      var _getHandler = function(evt) {
        return evt && evt.data && _messageHandlers[evt.data.id] &&
          typeof _messageHandlers[evt.data.id] == 'function' &&
          _messageHandlers[evt.data.id];
      };

      navigator.connect(serviceURL).then(port => {
        debug('Successfully established connection to ' + serviceURL);
        _port = port;
        port.onmessage = function (evt) {
          var handler = _getHandler(evt);
          if (!handler) {
            debug('Huh? Got an message with ' + JSON.stringify(evt.data) +
                  ' that I don\'t know what to do with. Discarding!');
            return;
          }
          handler(evt.data);
        };

        var realHandler = {
          // aObject MUSTt implement a serialize method, and the serialize
          // method MUST return an object with the following structure:
          //  {
          //    id: A numeric identifier for this operation
          //    data: Some extra data that the server will need
          //    processAnswer: a function that will process the answer for this
          //    message
          // }
          sendObject: function(aObject) {
            var serialized = aObject.serialize();
            _messageHandlers[serialized.id] = serialized.processAnswer;
            _port.postMessage({id: serialized.id, data: serialized.data});
          }
        };

        resolve(realHandler);
      }).catch(error => reject(error));
    });
  }

  // This should probably be on a common part...
  // Implements something like
  // http://mxr.mozilla.org/mozilla-central/source/dom/base/nsIDOMDOMRequest.idl
  // Well, *expletive removed* me sideways, now DOMRequests are promises also!
  function FakeDOMRequest(reqId, extraData) {
    var _result = null;
    var _error = null;
    var _fired = false;
    var _resolve, _reject;
    var internalPromise = new Promise((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
    });

    var self = this;
    this.data = extraData;
    this.serialize = function() {
      return {
        id: reqId,
        data: extraData,
        processAnswer: function(answer) {
          if (answer.error) {
            self._fireError(answer.error);
          } else {
            self._fireSuccess(answer.result);
          }
        }
      };
    };

    this.then = function (cbresolve, cbreject) {
      return internalPromise.then(cbresolve, cbreject);
    };

    Object.defineProperty(this, 'result', {
      get: function() {
        return _result;
      }
    });

    Object.defineProperty(this, 'error', {
      get: function() {
        return _error;
      }
    });

    this._fireSuccess = function(result) {
      if (!_fired) {
        _result = result;
        _fired = true;
        _resolve(result);
        this.onsuccess &&
          typeof this.onsuccess === 'function' && this.onsuccess();
      }
    };

    this._fireError = function(error) {
      if (!_fired) {
        _error = error;
        _fired = true;
        _reject(error);
        this.onerror
          && typeof this.onerror === 'function' && this.onerror(error);
      }
    };
  }

  window.NavConnectHelper = NavConnectHelper;
  window.FakeDOMRequest = FakeDOMRequest;

})(window);

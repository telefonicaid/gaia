// DeviceStorage polyfill!
// https://developer.mozilla.org/en-US/docs/Web/API/Device_Storage_API

// I have to define the service protocol, and this is as good place as any. The
// protocol will be as follows:
// * Each request will have a numeric request id, set by the client
// * The answers will include the request id, so the client can know to which
//   request the answer corresponds
// * The request id will also act as identifier for remote objects
// (deviceStorage)

// For all the operations over a DeviceStorage object:
//  * Request: { id: requestId,
//               data: {
//                 operation: methodName,
//                 params: params,
//                 deviceStorageId: deviceStorageId,
//                                  (only non getStorageDevice operation)
//                 storageName: storageName (only getStorageDevice operation)
//               }
//             }
// * Answer: { id: requestId,
//             result|error: Whatever }

// For the onchange operation
//  Request: { id: requestId,
//             data: {
//             operation: 'onchange'
//           },
// Answer: Will be invoked when there's activity with
// the DeviceStorageChangeEvent (like) object:
//    { id: requestId,
//      data: DeviceStorageChangeEvent }

// For the EventTarget operations
//  Request: { id: requestId,
//             data: {
//             operation: 'addEventListener|removeEventListener|dispatchEvent',
//             type: eventType (only addEventListener and removeEventListener),
//             useCapture: true|false (only addEventListener),
//             event: eventToDispatch (only dispatchEvent)
//           },
// Answer: When invoked:
//    { id: requestId,
//      data: EventTargetEvent }
'use strict';

/* globals FakeDOMRequest, NavConnectHelper */

(function(window) {

  function debug(text) {
    console.log('*-*-*- DeviceStorage PF: ' + text);
  }

  var realGetDeviceStorage = navigator.getDeviceStorage.bind(navigator);
  var realGetDeviceStorages = navigator.getDeviceStorages.bind(navigator);

  // Wishful thinking at the moment...
  const DEVICESTORAGE_SERVICE = 'https://devicestorageservice.gaiamobile.org';

  // It's nice being monothread...
  var _currentRequestId = 1;
  var _deviceStorageAttributes = ['canBeFormatted', 'canBeMounted',
    'canBeShared', 'default', 'isRemovable', 'storageName'];

  // DeviceStorage polyfill..
  function FakeDeviceStorage(type, realDeviceStorage) {

    var _resolve, _reject;
    var _deviceStorage = new Promise((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
    });

    // This will hold the remote object,
    // once the DeviceStorage is actually created..
    var _deviceStorageId = null;
    _deviceStorage.then(id => _deviceStorageId = id);

    function _createAndQueueRequest(data, constructor) {
      var request = new constructor(++_currentRequestId, data);
      _sendRequest(request);
      return request;
    }

    function _sendRequest(request) {
      Promise.all([navConnPromise, _deviceStorage]).then(values => {
        // When this is executed the promise should have resolved and thus we
        // should have this.
        request.data.deviceStorageId = _deviceStorageId;
        values[0].sendObject(request);
      });
    }

    // realDeviceStorage object can't be used without permissions
    _deviceStorageAttributes.forEach(attr => {
      this[attr] = realDeviceStorage[attr];
    });

    FakeEventTarget.call(this, _sendRequest);

    this.add = function(file) {
      return _createAndQueueRequest({
        operation: 'add',
        params: file
      }, FakeDOMRequest);
    };

    this.addNamed = function(file, name) {
      return _createAndQueueRequest({
        operation: 'addNamed',
        params: [file, name]
      }, FakeDOMRequest);
    };

    this.available = function() {
      return _createAndQueueRequest({
        operation: 'available'
      }, FakeDOMRequest);
    };

    this.delete = function(name) {
      return _createAndQueueRequest({
        operation: 'delete',
        params: name
      }, FakeDOMRequest);
    };

    this.freeSpace = function() {
      return _createAndQueueRequest({
        operation: 'freeSpace'
      }, FakeDOMRequest);
    };

    this.get = function(name) {
      return _createAndQueueRequest({
        operation: 'get',
        params: name
      }, FakeDOMRequest);
    };

    this.getEditable = function(name) {
      return _createAndQueueRequest({
        operation: 'getEditable',
        params: name
      }, FakeDOMRequest);
    };

    this.usedSpace = function() {
      return _createAndQueueRequest({
        operation: 'usedSpace'
      }, FakeDOMRequest);
    };

    this.enumerate = function(path, options) {
      var params = [path, options];
      return _createAndQueueRequest({
        operation: 'enumerate',
        params: params
      }, FakeDOMCursorRequest);
    };

    this.enumerateEditable = function(path, options) {
      var params = [];
      if (typeof path !== 'undefined') {
        params.push(path);
      }

      if (typeof options !== 'undefined') {
        params.push(options);
      }

      return _createAndQueueRequest({
        operation: 'enumerateEditable',
        params: params
      }, FakeDOMCursorRequest);
    };

    Object.defineProperty(this, 'onchange', {
      set: function(cb) {
        this._onchange = cb;
        this._onchangeId = this._onchangeId || ++_currentRequestId;
        var commandObject = {
          serialize: function() {
            return {
              id: ++_currentRequestId,
              data: {
                operation: 'onchange',
                deviceStorageId: _deviceStorageId
              },
              processAnswer: answer => cb(answer.result)
            };
          }
        };
        navConnPromise.
          then(navConnHelper => navConnHelper.sendObject(commandObject));
      }
    });

    this.serialize = function() {
      var self = this;
      return {
        id: ++_currentRequestId,
        data: {
          operation: 'getDeviceStorage',
          params: type,
          storageName: self.storageName
        },
        processAnswer: function(answer) {
          if (!answer.error) {
            _resolve(answer.id);
          } else {
            _reject(answer.error);
          }
        }
      };
    };
  }

  // Returns a DeviceStorage object to safely access a storage area
  var getDeviceStorageCustom = function(type) {
    var deviceStorage =
      new FakeDeviceStorage(type, realGetDeviceStorage(type));
    navConnPromise.then(navConnHelper =>
      navConnHelper.sendObject(deviceStorage));
    return deviceStorage;
  };

  var getDeviceStoragesCustom = function(type) {
    var realDeviceStorages = realGetDeviceStorages(type);
    var fakeDeviceStorages = [];

    realDeviceStorages.forEach(realDeviceStorage => {
      var deviceStorage = new FakeDeviceStorage(type, realDeviceStorage);
      navConnPromise.then(navConnHelper =>
        navConnHelper.sendObject(deviceStorage));
      fakeDeviceStorages.push(deviceStorage);
    });

    return fakeDeviceStorages;
  };

  // We should avoid the client from accessing the real api
  navigator.getDeviceStorage = getDeviceStorageCustom;
  navigator.getDeviceStorages = getDeviceStoragesCustom;

  var navConnPromise = new NavConnectHelper(DEVICESTORAGE_SERVICE);

  navConnPromise.then(function(){}, e => {
    debug('Got an exception while connecting ' + e);
    window.navigator.getDeviceStorage = realGetDeviceStorage;
    window.navigator.getDeviceStorages = realGetDeviceStorages;
  });

  // Implements something like
  // http://mxr.mozilla.org/mozilla-central/source/dom/base/nsIDOMDOMCursor.idl
  // Well, *expletive removed* me sideways, now DOMRequests are promises also!
  function FakeDOMCursorRequest(reqId, extraData) {
    FakeDOMRequest.call(this, reqId, extraData);
    var _done = false;
    var _files = null;
    var _cursor = 0;
    var _result = null;
    var _error = null;

    var self = this;
    this.serialize = function() {
      return {
        id: reqId,
        data: extraData,
        processAnswer: function(answer) {
          if (answer.error) {
            self._fireError(JSON.parse(answer.error));
          } else {
            _files = answer.result;
            self.continue();
          }
        }
      };
    };

    this.then = undefined;

    Object.defineProperty(this, 'done', {
      get: function() {
        return _done;
      }
    });

    Object.defineProperty(this, 'result', {
      get: function() {
        return _result;
      }
    });

    this.continue = function() {
      if (!_done) {
        _result = _files[_cursor];
        this._fireSuccess();
      }
    };

    this._fireSuccess = function() {
      if (!_done) {
        _cursor++;
        _done = _cursor > _files.length ? true : false;
        this.onsuccess &&
          typeof this.onsuccess === 'function' &&
          this.onsuccess({target: this});
      }
    };

    this._fireError = function(error) {
      if (!_done) {
        _error = error;
        this.onerror
          && typeof this.onerror === 'function' && this.onerror(error);
      }
    };
  }

  function FakeEventTarget(sendRequestMethod) {
    // _listeners[type][function] => undefined or an Listener object
    var _listeners = {};

    // And this is something else that might be reusable...
    function Listener(event, callback, useCapture) {
      this._id = null;
      this.type = event;
      this.data = {
        operation: 'addEventListener',
        type: event,
        useCapture: useCapture
      };
      this.serialize = () => {
        if (!this._id) {
          this._id = ++_currentRequestId;
        }
        return {
          id: this._id,
          data: this.data,
          processAnswer: answer => callback(answer.evt)
        };
      };
    }

    function ListenerRemoval(listener) {
      this.data = {
        operation: 'removeEventListener',
        type: listener.type,
      }; 
      this.serialize = () => {
        return {
          id: listener._id,
          data: this.data
        };
      };
    }

    function Dispatcher(event) {
      this._id = null;
      this.data = {
        operation: 'dispatchEvent',
        event: event
      };
      this.serialize = () => {
        if (!this._id) {
          this._id = ++_currentRequestId;
        }
        return {
          id: this._id,
          data: this.data,
          processAnswer: null
        };
      };
    }

    this.addEventListener = function(type, cb, useCapture) {
      var listener = new Listener(type, cb, useCapture);
      if (!_listeners[type]) {
        _listeners[type] = {};
      }
      _listeners[type][cb] = listener;
      sendRequestMethod(listener);
    };

    this.removeEventListener = function(type, cb) {
      if (!_listeners[type][cb]) {
        return;
      }
      var listenerRemoval = new ListenerRemoval(_listeners[type][cb]);
      sendRequestMethod(listenerRemoval);
      delete _listeners[type][cb];
    };

    this.dispatchEvent = function(event) {
      var dispatcher = new Dispatcher(event);
      sendRequestMethod(dispatcher);
    };
  }

})(window);

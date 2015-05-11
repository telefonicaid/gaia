(function (exports) {

  'use strict';

  function debug(str) {
    console.log("CJC -*-:" + str);
  }

  //Client side
  function Port(iacPort) {
    this.iacPort = iacPort;
    this.iacPort.onmessage = e => {
      debug('SHIM CLIENT : received IAC msg:' + JSON.stringify(e.data));
      this._onmessage && this._onmessage(e);
    };
    this.iacPort.start();
  }

  Port.prototype = {
    postMessage: function postMessage(msg) {
      debug('SHIM CLIENT Sending a message by IAC');
      this.iacPort && this.iacPort.postMessage(msg);
    },

    set onmessage(fc) {
      this._onmessage = fc;
    },

    get onmessage() {
      return this._onmessage;
    }
  };

  var connectShim = function(where) {
    return new Promise((resolve, reject) => {
      if (!where) {
        reject('where connect unknow');
      }
      var request = navigator.mozApps.getSelf();
      request.onsuccess = domReq => {
        var app = domReq.target.result;
        if (!app.connect) {
          reject('We don\'t have iac');
        }
        app.connect(where).then(
          ports => {
            debug('SHIM CLIENT IAC connection established');
            if (ports && ports.length > 0) {
              var shimPort = new Port(ports[0]);
              // At this point we have transport. Since IAC doesn't tell the
              // receiver the URL of the page that's connecting (which is
              // strange, TO-DO check that) We have to pass that data. This
              // is unsecure as hell...
              shimPort.postMessage({originURL: document.location.href});

              shimPort.onmessage = function(evt) {
                debug("SHIM ClIENT - Got the accept response: evt.data: " +
                      JSON.stringify(evt.data));
                shimPort.onmessage = null;
                evt.data.accepted && resolve(shimPort) ||
                                     reject('Connection not allowed');
              };
            }
          },
          reason => {
            debug('SHIM CLIENT - Connection rejected. Reason:' + reason);
            reject(reason);
          }
        );
      };

      request.onerror = dReq => {
        debug('SHIM CLIENT error retrieved self' + JSON.stringify(dReq.error));
        reject(dReq.error);
      };
    });
  };

  exports.navigator.connect = !exports.navigator.connect && connectShim ||
                              undefined;

})(window);

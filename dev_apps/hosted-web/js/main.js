'use strict';

(function() {

  var list = document.querySelector('section ul');

  function appendApp(app) {
    var item = document.createElement('li');
    var name = document.createElement('p');
    name.textContent = app.name;
    item.appendChild(name);
    var manifestURL = document.createElement('p');
    manifestURL.textContent = app.manifestURL;
    item.appendChild(manifestURL);
    list.appendChild(item);
    item.addEventListener('click', function() {
      var manifestUrl = item.querySelector('p:nth-child(2)').textContent;
      var request = window.navigator.mozApps.install(manifestUrl);
      request.onerror = function () {
        // Display the error information from the DOMError object
        var name = this.error.name;
        if (name !== 'DENIED') {
          alert('Install failed, error: ' + name);
        }
      };
    });
  }

  LazyLoader.getJSON('apps.json').then(data => {
    console.log(data);
    data.apps.forEach(app => appendApp(app));
  }, (e) => {
    console.error(e);
  });
}());

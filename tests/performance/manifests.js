'use strict';

var fs = require('fs');

var Manifests = {

  makeAppPath: function (path, dir) {
    var appPath = config.gaiaDir + '/' + dir + '/' + path;
    return appPath;
  },

  read: function (appPath, f) {
    var file = f ? '/' + f : '/manifest.webapp';
    var manifestPath = appPath + file;
    if (!fs.existsSync(manifestPath)) {
      //If we've said what file we want to read don't try with anyone
      if (f) {
        return null;
      }
      manifestPath = appPath + '/update.webapp';
      if (!fs.existsSync(manifestPath)) {
        return null;
      }
    }
    var content = fs.readFileSync(manifestPath);
    try {
      var manifest = JSON.parse(content.toString());
      return manifest;
    } catch(e) {
      return null;
    }
  },

  readMetadataForApp: function(app, d) {
    return this.readForApp(app, d, "metadata.json");
  },

  readForApp: function (app, d, file) {
    var dir = d || "apps";
    var appName, entryPoint;
    var arr = app.split('/');
    appName = arr[0];
    entryPoint = arr[1];

    var path = this.makeAppPath(appName, dir);

    return this.read(path, file);
  }

};

module.exports = Manifests;

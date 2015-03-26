'use strict';

const { Ci } = require('chrome');

var utils = require('./utils');

var isResource = function(resource) {
  return ['.DS_Store'].indexOf(resource) === -1;
}

var WebappOffliner = function(webapp) {
  this.url = webapp.manifest.url;
  this.buildDirPath = webapp.buildDirectoryFilePath;
  this.buildDir = utils.getFile(this.buildDirPath);
  this.resources = [];
};

WebappOffliner.prototype.visitResources = function(source) {
  var files = source.directoryEntries;

  while (files.hasMoreElements()) {
    var file = files.getNext().QueryInterface(Ci.nsILocalFile);
    if (file.isDirectory()) {
      this.visitResources(file);
    } else {
      if (isResource(file.leafName)) {
        this.resources.push(this.url +
                            file.path.replace(this.buildDirPath, ''));
      }
    }
  }
}

WebappOffliner.prototype.createResourcesFile = function() {
  var file = this.buildDir.clone();
  file.append('offliner-resources.js');
  utils.writeContent(file, 'var off = window.off || {};\n' +
                           'off.resources = ' +
                            JSON.stringify(this.resources) +
                           ';');
}

WebappOffliner.prototype.execute = function() {
  this.visitResources(this.buildDir);
  this.createResourcesFile(this.resources);
};

function execute(webapp) {
  webapp.manifest.type === 'trusted' && (new WebappOffliner(webapp)).execute();
}

exports.execute = execute;

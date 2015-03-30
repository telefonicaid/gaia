'use strict';

const { Ci } = require('chrome');

const OFFLINER_CLIENT_NAME = 'offliner-client';

var utils = require('./utils');

var isResource = function(resource) {
  return ['.DS_Store'].indexOf(resource) === -1;
}

var WebappOffliner = function(options) {
  this.webapp = options.webapp;
  this.sharedFolder = utils.gaia.getInstance(options).sharedFolder;

  this.url = this.webapp.manifest.url;
  this.buildDirPath = this.webapp.buildDirectoryFilePath;
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
  this.visitResources(this.buildDir);
  var file = this.buildDir.clone();
  file.append('offliner-resources.js');
  utils.writeContent(file, 'var off = window.off || {};\n' +
                           'off.resources = ' +
                            JSON.stringify(this.resources) +
                           ';');
}

WebappOffliner.prototype.decorateLaunchPath = function() {
  var launchPath = this.webapp.manifest.launch_path || 'index.html';
  launchPath = launchPath.startsWith('/') ? launchPath.substring(1) :
                                            launchPath;

  var htmlFile = utils.getFile(this.buildDirPath, launchPath);

  if (!htmlFile.exists()) {
    utils.log(htmlFile.path + 'does not exist!\n');
  }

  var doc = utils.getDocument(utils.getFileContent(htmlFile));

  this.appendElement(doc, {
    fileType: 'script',
    attrs: {
      src: OFFLINER_CLIENT_NAME + '.js',
      type: 'text/javascript'
    }
  });

  var str = utils.serializeDocument(doc);
  utils.writeContent(htmlFile, str);
};

WebappOffliner.prototype.appendElement = function(doc, data) {
  var file = doc.createElement(data.fileType);

  for (var attr in data.attrs) {
    file[attr] = data.attrs[attr];
  }

  doc.head.insertBefore(file, doc.head.firstElementChild);
};

WebappOffliner.prototype.copyServiceWorkerFiles = function() {
  var swDir = utils.getFile(this.sharedFolder.path, 'js', 'offliner');
  utils.copyDirTo(swDir, utils.dirname(this.buildDirPath),
                  utils.basename(this.buildDirPath), true);
};

WebappOffliner.prototype.execute = function() {
  // 1) Create offline-resources.js which lists all resources of our app
  this.createResourcesFile();
  // 2) Copy all files in '/shared/js/offliner' to root folder
  this.copyServiceWorkerFiles();
  // 3) Add offliner-setup's link in the launch HTML page
  this.decorateLaunchPath();
};

function execute(options) {
  var webapp = options.webapp;
  webapp.manifest.type === 'trusted' && (new WebappOffliner(options)).execute();
}

exports.execute = execute;

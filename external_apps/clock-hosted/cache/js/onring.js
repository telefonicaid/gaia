
requirejs.config({
  // waitSeconds is set to the default here; the build step rewrites
  // it to 0 in build/require_config.jslike so that we never timeout
  // waiting for modules in production. This is important when the
  // device is under super-low-memory stress, as it may take a while
  // for the device to get around to loading things like Clock's alarm
  // ringing screen, and we absolutely do not want that to time out.
  waitSeconds: 0,
  paths: {
    shared: '../shared'
  },
  shim: {
    'shared/js/template': {
      exports: 'Template'
    },
    'shared/js/gesture_detector': {
      exports: 'GestureDetector'
    },
    'shared/js/async_storage': {
      exports: 'asyncStorage'
    },
    'shared/js/accessibility_helper': {
      exports: 'AccessibilityHelper'
    },
    'shared/js/performance_testing_helper': {
      exports: 'PerformanceTestingHelper'
    },
    'shared/js/l10n_date': ['shared/js/l10n']
  }
});

define("require_config", function(){});

(function(window, undefined) {
  

  /* jshint validthis:true */
  function L10nError(message, id, loc) {
    this.name = 'L10nError';
    this.message = message;
    this.id = id;
    this.loc = loc;
  }
  L10nError.prototype = Object.create(Error.prototype);
  L10nError.prototype.constructor = L10nError;


  /* jshint browser:true */

  var io = {

    _load: function(type, url, callback, sync) {
      var xhr = new XMLHttpRequest();
      var needParse;

      if (xhr.overrideMimeType) {
        xhr.overrideMimeType(type);
      }

      xhr.open('GET', url, !sync);

      if (type === 'application/json') {
        //  Gecko 11.0+ forbids the use of the responseType attribute when
        //  performing sync requests (NS_ERROR_DOM_INVALID_ACCESS_ERR).
        //  We'll need to JSON.parse manually.
        if (sync) {
          needParse = true;
        } else {
          xhr.responseType = 'json';
        }
      }

      xhr.addEventListener('load', function io_onload(e) {
        if (e.target.status === 200 || e.target.status === 0) {
          // Sinon.JS's FakeXHR doesn't have the response property
          var res = e.target.response || e.target.responseText;
          callback(null, needParse ? JSON.parse(res) : res);
        } else {
          callback(new L10nError('Not found: ' + url));
        }
      });
      xhr.addEventListener('error', callback);
      xhr.addEventListener('timeout', callback);

      // the app: protocol throws on 404, see https://bugzil.la/827243
      try {
        xhr.send(null);
      } catch (e) {
        callback(new L10nError('Not found: ' + url));
      }
    },

    load: function(url, callback, sync) {
      return io._load('text/plain', url, callback, sync);
    },

    loadJSON: function(url, callback, sync) {
      return io._load('application/json', url, callback, sync);
    }

  };

  function EventEmitter() {}

  EventEmitter.prototype.emit = function ee_emit() {
    if (!this._listeners) {
      return;
    }

    var args = Array.prototype.slice.call(arguments);
    var type = args.shift();
    if (!this._listeners[type]) {
      return;
    }

    var typeListeners = this._listeners[type].slice();
    for (var i = 0; i < typeListeners.length; i++) {
      typeListeners[i].apply(this, args);
    }
  };

  EventEmitter.prototype.addEventListener = function ee_add(type, listener) {
    if (!this._listeners) {
      this._listeners = {};
    }
    if (!(type in this._listeners)) {
      this._listeners[type] = [];
    }
    this._listeners[type].push(listener);
  };

  EventEmitter.prototype.removeEventListener = function ee_rm(type, listener) {
    if (!this._listeners) {
      return;
    }

    var typeListeners = this._listeners[type];
    var pos = typeListeners.indexOf(listener);
    if (pos === -1) {
      return;
    }

    typeListeners.splice(pos, 1);
  };


  function getPluralRule(lang) {
    var locales2rules = {
      'af': 3,
      'ak': 4,
      'am': 4,
      'ar': 1,
      'asa': 3,
      'az': 0,
      'be': 11,
      'bem': 3,
      'bez': 3,
      'bg': 3,
      'bh': 4,
      'bm': 0,
      'bn': 3,
      'bo': 0,
      'br': 20,
      'brx': 3,
      'bs': 11,
      'ca': 3,
      'cgg': 3,
      'chr': 3,
      'cs': 12,
      'cy': 17,
      'da': 3,
      'de': 3,
      'dv': 3,
      'dz': 0,
      'ee': 3,
      'el': 3,
      'en': 3,
      'eo': 3,
      'es': 3,
      'et': 3,
      'eu': 3,
      'fa': 0,
      'ff': 5,
      'fi': 3,
      'fil': 4,
      'fo': 3,
      'fr': 5,
      'fur': 3,
      'fy': 3,
      'ga': 8,
      'gd': 24,
      'gl': 3,
      'gsw': 3,
      'gu': 3,
      'guw': 4,
      'gv': 23,
      'ha': 3,
      'haw': 3,
      'he': 2,
      'hi': 4,
      'hr': 11,
      'hu': 0,
      'id': 0,
      'ig': 0,
      'ii': 0,
      'is': 3,
      'it': 3,
      'iu': 7,
      'ja': 0,
      'jmc': 3,
      'jv': 0,
      'ka': 0,
      'kab': 5,
      'kaj': 3,
      'kcg': 3,
      'kde': 0,
      'kea': 0,
      'kk': 3,
      'kl': 3,
      'km': 0,
      'kn': 0,
      'ko': 0,
      'ksb': 3,
      'ksh': 21,
      'ku': 3,
      'kw': 7,
      'lag': 18,
      'lb': 3,
      'lg': 3,
      'ln': 4,
      'lo': 0,
      'lt': 10,
      'lv': 6,
      'mas': 3,
      'mg': 4,
      'mk': 16,
      'ml': 3,
      'mn': 3,
      'mo': 9,
      'mr': 3,
      'ms': 0,
      'mt': 15,
      'my': 0,
      'nah': 3,
      'naq': 7,
      'nb': 3,
      'nd': 3,
      'ne': 3,
      'nl': 3,
      'nn': 3,
      'no': 3,
      'nr': 3,
      'nso': 4,
      'ny': 3,
      'nyn': 3,
      'om': 3,
      'or': 3,
      'pa': 3,
      'pap': 3,
      'pl': 13,
      'ps': 3,
      'pt': 3,
      'rm': 3,
      'ro': 9,
      'rof': 3,
      'ru': 11,
      'rwk': 3,
      'sah': 0,
      'saq': 3,
      'se': 7,
      'seh': 3,
      'ses': 0,
      'sg': 0,
      'sh': 11,
      'shi': 19,
      'sk': 12,
      'sl': 14,
      'sma': 7,
      'smi': 7,
      'smj': 7,
      'smn': 7,
      'sms': 7,
      'sn': 3,
      'so': 3,
      'sq': 3,
      'sr': 11,
      'ss': 3,
      'ssy': 3,
      'st': 3,
      'sv': 3,
      'sw': 3,
      'syr': 3,
      'ta': 3,
      'te': 3,
      'teo': 3,
      'th': 0,
      'ti': 4,
      'tig': 3,
      'tk': 3,
      'tl': 4,
      'tn': 3,
      'to': 0,
      'tr': 0,
      'ts': 3,
      'tzm': 22,
      'uk': 11,
      'ur': 3,
      've': 3,
      'vi': 0,
      'vun': 3,
      'wa': 4,
      'wae': 3,
      'wo': 0,
      'xh': 3,
      'xog': 3,
      'yo': 0,
      'zh': 0,
      'zu': 3
    };

    // utility functions for plural rules methods
    function isIn(n, list) {
      return list.indexOf(n) !== -1;
    }
    function isBetween(n, start, end) {
      return typeof n === typeof start && start <= n && n <= end;
    }

    // list of all plural rules methods:
    // map an integer to the plural form name to use
    var pluralRules = {
      '0': function() {
        return 'other';
      },
      '1': function(n) {
        if ((isBetween((n % 100), 3, 10))) {
          return 'few';
        }
        if (n === 0) {
          return 'zero';
        }
        if ((isBetween((n % 100), 11, 99))) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '2': function(n) {
        if (n !== 0 && (n % 10) === 0) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '3': function(n) {
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '4': function(n) {
        if ((isBetween(n, 0, 1))) {
          return 'one';
        }
        return 'other';
      },
      '5': function(n) {
        if ((isBetween(n, 0, 2)) && n !== 2) {
          return 'one';
        }
        return 'other';
      },
      '6': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if ((n % 10) === 1 && (n % 100) !== 11) {
          return 'one';
        }
        return 'other';
      },
      '7': function(n) {
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '8': function(n) {
        if ((isBetween(n, 3, 6))) {
          return 'few';
        }
        if ((isBetween(n, 7, 10))) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '9': function(n) {
        if (n === 0 || n !== 1 && (isBetween((n % 100), 1, 19))) {
          return 'few';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '10': function(n) {
        if ((isBetween((n % 10), 2, 9)) && !(isBetween((n % 100), 11, 19))) {
          return 'few';
        }
        if ((n % 10) === 1 && !(isBetween((n % 100), 11, 19))) {
          return 'one';
        }
        return 'other';
      },
      '11': function(n) {
        if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14))) {
          return 'few';
        }
        if ((n % 10) === 0 ||
            (isBetween((n % 10), 5, 9)) ||
            (isBetween((n % 100), 11, 14))) {
          return 'many';
        }
        if ((n % 10) === 1 && (n % 100) !== 11) {
          return 'one';
        }
        return 'other';
      },
      '12': function(n) {
        if ((isBetween(n, 2, 4))) {
          return 'few';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '13': function(n) {
        if ((isBetween((n % 10), 2, 4)) && !(isBetween((n % 100), 12, 14))) {
          return 'few';
        }
        if (n !== 1 && (isBetween((n % 10), 0, 1)) ||
            (isBetween((n % 10), 5, 9)) ||
            (isBetween((n % 100), 12, 14))) {
          return 'many';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '14': function(n) {
        if ((isBetween((n % 100), 3, 4))) {
          return 'few';
        }
        if ((n % 100) === 2) {
          return 'two';
        }
        if ((n % 100) === 1) {
          return 'one';
        }
        return 'other';
      },
      '15': function(n) {
        if (n === 0 || (isBetween((n % 100), 2, 10))) {
          return 'few';
        }
        if ((isBetween((n % 100), 11, 19))) {
          return 'many';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '16': function(n) {
        if ((n % 10) === 1 && n !== 11) {
          return 'one';
        }
        return 'other';
      },
      '17': function(n) {
        if (n === 3) {
          return 'few';
        }
        if (n === 0) {
          return 'zero';
        }
        if (n === 6) {
          return 'many';
        }
        if (n === 2) {
          return 'two';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '18': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if ((isBetween(n, 0, 2)) && n !== 0 && n !== 2) {
          return 'one';
        }
        return 'other';
      },
      '19': function(n) {
        if ((isBetween(n, 2, 10))) {
          return 'few';
        }
        if ((isBetween(n, 0, 1))) {
          return 'one';
        }
        return 'other';
      },
      '20': function(n) {
        if ((isBetween((n % 10), 3, 4) || ((n % 10) === 9)) && !(
            isBetween((n % 100), 10, 19) ||
            isBetween((n % 100), 70, 79) ||
            isBetween((n % 100), 90, 99)
            )) {
          return 'few';
        }
        if ((n % 1000000) === 0 && n !== 0) {
          return 'many';
        }
        if ((n % 10) === 2 && !isIn((n % 100), [12, 72, 92])) {
          return 'two';
        }
        if ((n % 10) === 1 && !isIn((n % 100), [11, 71, 91])) {
          return 'one';
        }
        return 'other';
      },
      '21': function(n) {
        if (n === 0) {
          return 'zero';
        }
        if (n === 1) {
          return 'one';
        }
        return 'other';
      },
      '22': function(n) {
        if ((isBetween(n, 0, 1)) || (isBetween(n, 11, 99))) {
          return 'one';
        }
        return 'other';
      },
      '23': function(n) {
        if ((isBetween((n % 10), 1, 2)) || (n % 20) === 0) {
          return 'one';
        }
        return 'other';
      },
      '24': function(n) {
        if ((isBetween(n, 3, 10) || isBetween(n, 13, 19))) {
          return 'few';
        }
        if (isIn(n, [2, 12])) {
          return 'two';
        }
        if (isIn(n, [1, 11])) {
          return 'one';
        }
        return 'other';
      }
    };

    // return a function that gives the plural form name for a given integer
    var index = locales2rules[lang.replace(/-.*$/, '')];
    if (!(index in pluralRules)) {
      return function() { return 'other'; };
    }
    return pluralRules[index];
  }




  var MAX_PLACEABLES = 100;


  var PropertiesParser = {
    patterns: null,
    entryIds: null,

    init: function() {
      this.patterns = {
        comment: /^\s*#|^\s*$/,
        entity: /^([^=\s]+)\s*=\s*(.*)$/,
        multiline: /[^\\]\\$/,
        index: /\{\[\s*(\w+)(?:\(([^\)]*)\))?\s*\]\}/i,
        unicode: /\\u([0-9a-fA-F]{1,4})/g,
        entries: /[^\r\n]+/g,
        controlChars: /\\([\\\n\r\t\b\f\{\}\"\'])/g,
        placeables: /\{\{\s*([^\s]*?)\s*\}\}/,
      };
    },

    parse: function(ctx, source) {
      if (!this.patterns) {
        this.init();
      }

      var ast = [];
      this.entryIds = Object.create(null);

      var entries = source.match(this.patterns.entries);
      if (!entries) {
        return ast;
      }
      for (var i = 0; i < entries.length; i++) {
        var line = entries[i];

        if (this.patterns.comment.test(line)) {
          continue;
        }

        while (this.patterns.multiline.test(line) && i < entries.length) {
          line = line.slice(0, -1) + entries[++i].trim();
        }

        var entityMatch = line.match(this.patterns.entity);
        if (entityMatch) {
          try {
            this.parseEntity(entityMatch[1], entityMatch[2], ast);
          } catch (e) {
            if (ctx) {
              ctx._emitter.emit('parseerror', e);
            } else {
              throw e;
            }
          }
        }
      }
      return ast;
    },

    parseEntity: function(id, value, ast) {
      var name, key;

      var pos = id.indexOf('[');
      if (pos !== -1) {
        name = id.substr(0, pos);
        key = id.substring(pos + 1, id.length - 1);
      } else {
        name = id;
        key = null;
      }

      var nameElements = name.split('.');

      if (nameElements.length > 2) {
        throw new L10nError('Error in ID: "' + name + '".' +
            ' Nested attributes are not supported.');
      }

      var attr;
      if (nameElements.length > 1) {
        name = nameElements[0];
        attr = nameElements[1];

        if (attr[0] === '$') {
          throw new L10nError('Attribute can\'t start with "$"', id);
        }
      } else {
        attr = null;
      }

      this.setEntityValue(name, attr, key, this.unescapeString(value), ast);
    },

    setEntityValue: function(id, attr, key, value, ast) {
      var pos, v;

      if (value.indexOf('{{') !== -1) {
        value = this.parseString(value);
      }

      if (attr) {
        pos = this.entryIds[id];
        if (pos === undefined) {
          v = {$i: id};
          if (key) {
            v[attr] = {};
            v[attr][key] = value;
          } else {
            v[attr] = value;
          }
          ast.push(v);
          this.entryIds[id] = ast.length - 1;
          return;
        }
        if (key) {
          if (typeof(ast[pos][attr]) === 'string') {
            ast[pos][attr] = {
              $x: this.parseIndex(ast[pos][attr]),
              $v: {}
            };
          }
          ast[pos][attr].$v[key] = value;
          return;
        }
        ast[pos][attr] = value;
        return;
      }

      // Hash value
      if (key) {
        pos = this.entryIds[id];
        if (pos === undefined) {
          v = {};
          v[key] = value;
          ast.push({$i: id, $v: v});
          this.entryIds[id] = ast.length - 1;
          return;
        }
        if (typeof(ast[pos].$v) === 'string') {
          ast[pos].$x = this.parseIndex(ast[pos].$v);
          ast[pos].$v = {};
        }
        ast[pos].$v[key] = value;
        return;
      }

      // simple value
      ast.push({$i: id, $v: value});
      this.entryIds[id] = ast.length - 1;
    },

    parseString: function(str) {
      var chunks = str.split(this.patterns.placeables);
      var complexStr = [];

      var len = chunks.length;
      var placeablesCount = (len - 1) / 2;

      if (placeablesCount >= MAX_PLACEABLES) {
        throw new L10nError('Too many placeables (' + placeablesCount +
                            ', max allowed is ' + MAX_PLACEABLES + ')');
      }

      for (var i = 0; i < chunks.length; i++) {
        if (chunks[i].length === 0) {
          continue;
        }
        if (i % 2 === 1) {
          complexStr.push({t: 'idOrVar', v: chunks[i]});
        } else {
          complexStr.push(chunks[i]);
        }
      }
      return complexStr;
    },

    unescapeString: function(str) {
      if (str.lastIndexOf('\\') !== -1) {
        str = str.replace(this.patterns.controlChars, '$1');
      }
      return str.replace(this.patterns.unicode, function(match, token) {
        return unescape('%u' + '0000'.slice(token.length) + token);
      });
    },

    parseIndex: function(str) {
      var match = str.match(this.patterns.index);
      if (!match) {
        throw new L10nError('Malformed index');
      }
      if (match[2]) {
        return [{t: 'idOrVar', v: match[1]}, match[2]];
      } else {
        return [{t: 'idOrVar', v: match[1]}];
      }
    }
  };



  var KNOWN_MACROS = ['plural'];

  var MAX_PLACEABLE_LENGTH = 2500;
  var rePlaceables = /\{\{\s*(.+?)\s*\}\}/g;

  function createEntry(node, env) {
    var keys = Object.keys(node);

    // the most common scenario: a simple string with no arguments
    if (typeof node.$v === 'string' && keys.length === 2) {
      return node.$v;
    }

    var attrs;

    /* jshint -W084 */
    for (var i = 0, key; key = keys[i]; i++) {
      if (key[0] === '$') {
        continue;
      }

      if (!attrs) {
        attrs = Object.create(null);
      }
      attrs[key] = createAttribute(node[key], env, node.$i + '.' + key);
    }

    return {
      id: node.$i,
      value: node.$v === undefined ? null : node.$v,
      index: node.$x || null,
      attrs: attrs || null,
      env: env,
      // the dirty guard prevents cyclic or recursive references
      dirty: false
    };
  }

  function createAttribute(node, env, id) {
    if (typeof node === 'string') {
      return node;
    }

    var value;
    if (Array.isArray(node)) {
      value = node;
    }

    return {
      id: id,
      value: value || node.$v || null,
      index: node.$x || null,
      env: env,
      dirty: false
    };
  }


  function format(args, entity) {
    if (typeof entity === 'string') {
      return entity;
    }

    if (entity.dirty) {
      throw new L10nError('Cyclic reference detected: ' + entity.id);
    }

    entity.dirty = true;
    var val;
    // if format fails, we want the exception to bubble up and stop the whole
    // resolving process;  however, we still need to clean up the dirty flag
    try {
      val = resolveValue(args, entity.env, entity.value, entity.index);
    } finally {
      entity.dirty = false;
    }
    return val;
  }

  function resolveIdentifier(args, env, id) {
    if (KNOWN_MACROS.indexOf(id) > -1) {
      return env['__' + id];
    }

    if (args && args.hasOwnProperty(id)) {
      if (typeof args[id] === 'string' || (typeof args[id] === 'number' &&
          !isNaN(args[id]))) {
        return args[id];
      } else {
        throw new L10nError('Arg must be a string or a number: ' + id);
      }
    }

    // XXX: special case for Node.js where still:
    // '__proto__' in Object.create(null) => true
    if (id in env && id !== '__proto__') {
      return format(args, env[id]);
    }

    throw new L10nError('Unknown reference: ' + id);
  }

  function subPlaceable(args, env, id) {
    var value;
    try {
      value = resolveIdentifier(args, env, id);
    } catch (err) {
      return '{{ ' + id + ' }}';
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // prevent Billion Laughs attacks
      if (value.length >= MAX_PLACEABLE_LENGTH) {
        throw new L10nError('Too many characters in placeable (' +
                            value.length + ', max allowed is ' +
                            MAX_PLACEABLE_LENGTH + ')');
      }
      return value;
    }

    return '{{ ' + id + ' }}';
  }

  function interpolate(args, env, arr) {
    return arr.reduce(function(prev, cur) {
      if (typeof cur === 'string') {
        return prev + cur;
      } else if (cur.t === 'idOrVar'){
        return prev + subPlaceable(args, env, cur.v);
      }
    }, '');
  }

  function resolveSelector(args, env, expr, index) {
      var selectorName = index[0].v;
      var selector = resolveIdentifier(args, env, selectorName);

      if (typeof selector !== 'function') {
        // selector is a simple reference to an entity or args
        return selector;
      }

      var argValue = index[1] ?
        resolveIdentifier(args, env, index[1]) : undefined;

      if (selector === env.__plural) {
        // special cases for zero, one, two if they are defined on the hash
        if (argValue === 0 && 'zero' in expr) {
          return 'zero';
        }
        if (argValue === 1 && 'one' in expr) {
          return 'one';
        }
        if (argValue === 2 && 'two' in expr) {
          return 'two';
        }
      }

      return selector(argValue);
  }

  function resolveValue(args, env, expr, index) {
    if (typeof expr === 'string' ||
        typeof expr === 'boolean' ||
        typeof expr === 'number' ||
        !expr) {
      return expr;
    }

    if (Array.isArray(expr)) {
      return interpolate(args, env, expr);
    }

    // otherwise, it's a dict
    if (index) {
      // try to use the index in order to select the right dict member
      var selector = resolveSelector(args, env, expr, index);
      if (expr.hasOwnProperty(selector)) {
        return resolveValue(args, env, expr[selector]);
      }
    }

    // if there was no index or no selector was found, try 'other'
    if ('other' in expr) {
      return resolveValue(args, env, expr.other);
    }

    // XXX Specify entity id
    throw new L10nError('Unresolvable value');
  }

  var Resolver = {
    createEntry: createEntry,
    format: format,
    rePlaceables: rePlaceables
  };



  /* Utility functions */

  // Recursively walk an AST node searching for content leaves
  function walkContent(node, fn) {
    if (typeof node === 'string') {
      return fn(node);
    }

    if (node.t === 'idOrVar') {
      return node;
    }

    var rv = Array.isArray(node) ? [] : {};
    var keys = Object.keys(node);

    for (var i = 0, key; (key = keys[i]); i++) {
      // don't change identifier ($i) nor indices ($x)
      if (key === '$i' || key === '$x') {
        rv[key] = node[key];
      } else {
        rv[key] = walkContent(node[key], fn);
      }
    }
    return rv;
  }


  /* Pseudolocalizations
   *
   * PSEUDO is a dict of strategies to be used to modify the English
   * context in order to create pseudolocalizations.  These can be used by
   * developers to test the localizability of their code without having to
   * actually speak a foreign language.
   *
   * Currently, the following pseudolocales are supported:
   *
   *   qps-ploc - Ȧȧƈƈḗḗƞŧḗḗḓ Ḗḗƞɠŀīīşħ
   *
   *     In Accented English all English letters are replaced by accented
   *     Unicode counterparts which don't impair the readability of the content.
   *     This allows developers to quickly test if any given string is being
   *     correctly displayed in its 'translated' form.  Additionally, simple
   *     heuristics are used to make certain words longer to better simulate the
   *     experience of international users.
   *
   *   qps-plocm - ɥsıʅƃuƎ pǝɹoɹɹıW
   *
   *     Mirrored English is a fake RTL locale.  All words are surrounded by
   *     Unicode formatting marks forcing the RTL directionality of characters.
   *     In addition, to make the reversed text easier to read, individual
   *     letters are flipped.
   *
   *     Note: The name above is hardcoded to be RTL in case code editors have
   *     trouble with the RLO and PDF Unicode marks.  In reality, it should be
   *     surrounded by those marks as well.
   *
   * See https://bugzil.la/900182 for more information.
   *
   */

  var reAlphas = /[a-zA-Z]/g;
  var reVowels = /[aeiouAEIOU]/g;

  // ȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ + [\\]^_` + ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑ
  var ACCENTED_MAP = '\u0226\u0181\u0187\u1E12\u1E16\u0191\u0193\u0126\u012A' +
                     '\u0134\u0136\u013F\u1E3E\u0220\u01FE\u01A4\u024A\u0158' +
                     '\u015E\u0166\u016C\u1E7C\u1E86\u1E8A\u1E8E\u1E90' +
                     '[\\]^_`' +
                     '\u0227\u0180\u0188\u1E13\u1E17\u0192\u0260\u0127\u012B' +
                     '\u0135\u0137\u0140\u1E3F\u019E\u01FF\u01A5\u024B\u0159' +
                     '\u015F\u0167\u016D\u1E7D\u1E87\u1E8B\u1E8F\u1E91';

  // XXX Until https://bugzil.la/1007340 is fixed, ᗡℲ⅁⅂⅄ don't render correctly
  // on the devices.  For now, use the following replacements: pɟפ˥ʎ
  // ∀ԐↃpƎɟפHIſӼ˥WNOԀÒᴚS⊥∩ɅＭXʎZ + [\\]ᵥ_, + ɐqɔpǝɟƃɥıɾʞʅɯuodbɹsʇnʌʍxʎz
  var FLIPPED_MAP = '\u2200\u0510\u2183p\u018E\u025F\u05E4HI\u017F' +
                    '\u04FC\u02E5WNO\u0500\xD2\u1D1AS\u22A5\u2229\u0245' +
                    '\uFF2DX\u028EZ' +
                    '[\\]\u1D65_,' +
                    '\u0250q\u0254p\u01DD\u025F\u0183\u0265\u0131\u027E' +
                    '\u029E\u0285\u026Fuodb\u0279s\u0287n\u028C\u028Dx\u028Ez';

  function makeLonger(val) {
    return val.replace(reVowels, function(match) {
      return match + match.toLowerCase();
    });
  }

  function replaceChars(map, val) {
    // Replace each Latin letter with a Unicode character from map
    return val.replace(reAlphas, function(match) {
      return map.charAt(match.charCodeAt(0) - 65);
    });
  }

  var reWords = /[^\W0-9_]+/g;

  function makeRTL(val) {
    // Surround each word with Unicode formatting codes, RLO and PDF:
    //   U+202E:   RIGHT-TO-LEFT OVERRIDE (RLO)
    //   U+202C:   POP DIRECTIONAL FORMATTING (PDF)
    // See http://www.w3.org/International/questions/qa-bidi-controls
    return val.replace(reWords, function(match) {
      return '\u202e' + match + '\u202c';
    });
  }

  // strftime tokens (%a, %Eb) and template {vars}
  var reExcluded = /(%[EO]?\w|\{\s*.+?\s*\})/;

  function mapContent(fn, val) {
    if (!val) {
      return val;
    }
    var parts = val.split(reExcluded);
    var modified = parts.map(function(part) {
      if (reExcluded.test(part)) {
        return part;
      }
      return fn(part);
    });
    return modified.join('');
  }

  function Pseudo(id, name, charMap, modFn) {
    this.id = id;
    this.translate = mapContent.bind(null, function(val) {
      return replaceChars(charMap, modFn(val));
    });
    this.name = this.translate(name);
  }

  var PSEUDO = {
    'qps-ploc': new Pseudo('qps-ploc', 'Runtime Accented',
                           ACCENTED_MAP, makeLonger),
    'qps-plocm': new Pseudo('qps-plocm', 'Runtime Mirrored',
                            FLIPPED_MAP, makeRTL)
  };



  function Locale(id, ctx) {
    this.id = id;
    this.ctx = ctx;
    this.isReady = false;
    this.entries = Object.create(null);
    this.entries.__plural = getPluralRule(this.isPseudo() ?
                                          this.ctx.defaultLocale : id);
  }

  Locale.prototype.isPseudo = function() {
    return this.ctx.qps.indexOf(this.id) !== -1;
  };

  var bindingsIO = {
    extra: function(id, ver, path, type, callback, errback) {
      if (type === 'properties') {
        type = 'text';
      }
      navigator.mozApps.getLocalizationResource(id, ver, path, type).
        then(callback.bind(null, null), errback);
    },
    app: function(id, ver, path, type, callback, errback, sync) {
      switch (type) {
        case 'properties':
          io.load(path, callback, sync);
          break;
        case 'json':
          io.loadJSON(path, callback, sync);
          break;
      }
    },
  };

  Locale.prototype.build = function L_build(callback) {
    var sync = !callback;
    var ctx = this.ctx;
    var self = this;

    var l10nLoads = ctx.resLinks.length;

    function onL10nLoaded(err) {
      if (err) {
        ctx._emitter.emit('fetcherror', err);
      }
      if (--l10nLoads <= 0) {
        self.isReady = true;
        if (callback) {
          callback();
        }
      }
    }

    if (l10nLoads === 0) {
      onL10nLoaded();
      return;
    }

    function onJSONLoaded(err, json) {
      if (!err && json) {
        self.addAST(json);
      }
      onL10nLoaded(err);
    }

    function onPropLoaded(err, source) {
      if (!err && source) {
        var ast = PropertiesParser.parse(ctx, source);
        self.addAST(ast);
      }
      onL10nLoaded(err);
    }

    var idToFetch = this.isPseudo() ? ctx.defaultLocale : this.id;
    var appVersion = null;
    var source = 'app';
    if (typeof(navigator) !== 'undefined') {
      source = navigator.mozL10n._config.localeSources[this.id] || 'app';
      appVersion = navigator.mozL10n._config.appVersion;
    }

    for (var i = 0; i < ctx.resLinks.length; i++) {
      var resLink = decodeURI(ctx.resLinks[i]);
      var path = resLink.replace('{locale}', idToFetch);
      var type = path.substr(path.lastIndexOf('.') + 1);

      var cb;
      switch (type) {
        case 'json':
          cb = onJSONLoaded;
          break;
        case 'properties':
          cb = onPropLoaded;
          break;
      }
      bindingsIO[source](this.id,
        appVersion, path, type, cb, onL10nLoaded, sync);
    }
  };

  function createPseudoEntry(node, entries) {
    return Resolver.createEntry(
      walkContent(node, PSEUDO[this.id].translate),
      entries);
  }

  Locale.prototype.addAST = function(ast) {
    /* jshint -W084 */

    var createEntry = this.isPseudo() ?
      createPseudoEntry.bind(this) : Resolver.createEntry;

    for (var i = 0, node; node = ast[i]; i++) {
      this.entries[node.$i] = createEntry(node, this.entries);
    }
  };




  function Context(id) {
    this.id = id;
    this.isReady = false;
    this.isLoading = false;

    this.defaultLocale = 'en-US';
    this.availableLocales = [];
    this.supportedLocales = [];
    this.qps = [];

    this.resLinks = [];
    this.locales = {};

    this._emitter = new EventEmitter();
    this._ready = new Promise(this.once.bind(this));
  }


  // Getting translations

  function reportMissing(id, err) {
    this._emitter.emit('notfounderror', err);
    return id;
  }

  function getWithFallback(id) {
    /* jshint -W084 */
    var cur = 0;
    var loc;
    var locale;
    while (loc = this.supportedLocales[cur]) {
      locale = this.getLocale(loc);
      if (!locale.isReady) {
        // build without callback, synchronously
        locale.build(null);
      }
      var entry = locale.entries[id];
      if (entry === undefined) {
        cur++;
        reportMissing.call(this, id, new L10nError(
          '"' + id + '"' + ' not found in ' + loc + ' in ' + this.id,
          id, loc));
        continue;
      }
      return entry;
    }

    throw new L10nError(
      '"' + id + '"' + ' missing from all supported locales in ' + this.id, id);
  }

  function formatValue(args, entity) {
    if (typeof entity === 'string') {
      return entity;
    }

    try {
      return Resolver.format(args, entity);
    } catch (err) {
      this._emitter.emit('resolveerror', err);
      return entity.id;
    }
  }

  function formatEntity(args, entity) {
    if (!entity.attrs) {
      return {
        value: formatValue.call(this, args, entity),
        attrs: null
      };
    }

    var formatted = {
      value: formatValue.call(this, args, entity),
      attrs: Object.create(null)
    };

    for (var key in entity.attrs) {
      /* jshint -W089 */
      formatted.attrs[key] = formatValue.call(this, args, entity.attrs[key]);
    }

    return formatted;
  }

  function formatAsync(fn, id, args) {
    return this._ready.then(
      getWithFallback.bind(this, id)).then(
        fn.bind(this, args),
        reportMissing.bind(this, id));
  }

  Context.prototype.formatValue = function(id, args) {
    return formatAsync.call(this, formatValue, id, args);
  };

  Context.prototype.formatEntity = function(id, args) {
    return formatAsync.call(this, formatEntity, id, args);
  };

  function legacyGet(fn, id, args) {
    if (!this.isReady) {
      throw new L10nError('Context not ready');
    }

    var entry;
    try {
      entry = getWithFallback.call(this, id);
    } catch (err) {
      // Don't handle notfounderrors in individual locales in any special way
      if (err.loc) {
        throw err;
      }
      // For general notfounderrors, report them and return legacy fallback
      reportMissing.call(this, id, err);
      // XXX legacy compat;  some Gaia code checks if returned value is falsy or
      // an empty string to know if a translation is available;  this is bad and
      // will be fixed eventually in https://bugzil.la/1020138
      return '';
    }

    // If translation is broken use regular fallback-on-id approach
    return fn.call(this, args, entry);
  }

  Context.prototype.get = function(id, args) {
    return legacyGet.call(this, formatValue, id, args);
  };

  Context.prototype.getEntity = function(id, args) {
    return legacyGet.call(this, formatEntity, id, args);
  };

  Context.prototype.getLocale = function getLocale(code) {
    /* jshint -W093 */

    var locales = this.locales;
    if (locales[code]) {
      return locales[code];
    }

    return locales[code] = new Locale(code, this);
  };


  // Getting ready

  function negotiate(available, requested, defaultLocale) {
    var supportedLocale;
    // Find the first locale in the requested list that is supported.
    for (var i = 0; i < requested.length; i++) {
      var locale = requested[i];
      if (available.indexOf(locale) !== -1) {
        supportedLocale = locale;
        break;
      }
    }
    if (!supportedLocale ||
        supportedLocale === defaultLocale) {
      return [defaultLocale];
    }

    return [supportedLocale, defaultLocale];
  }

  function freeze(supported) {
    var locale = this.getLocale(supported[0]);
    if (locale.isReady) {
      setReady.call(this, supported);
    } else {
      locale.build(setReady.bind(this, supported));
    }
  }

  function setReady(supported) {
    this.supportedLocales = supported;
    this.isReady = true;
    this._emitter.emit('ready');
  }

  Context.prototype.registerLocales = function(defLocale, available) {

    if (defLocale) {
      this.defaultLocale = defLocale;
    }
    /* jshint boss:true */
    this.availableLocales = [this.defaultLocale];
    this.qps = Object.keys(PSEUDO);

    if (available) {
      for (var i = 0, loc; loc = available[i]; i++) {
        if (this.availableLocales.indexOf(loc) === -1) {
          this.availableLocales.push(loc);
          var pos = this.qps.indexOf(loc);
          if (pos !== -1) {
            // remove from this context's runtime pseudolocales
            this.qps.splice(pos, 1);
          }
        }
      }
    }
  };

  Context.prototype.requestLocales = function requestLocales() {
    if (this.isLoading && !this.isReady) {
      throw new L10nError('Context not ready');
    }

    this.isLoading = true;
    var requested = Array.prototype.slice.call(arguments);
    if (requested.length === 0) {
      throw new L10nError('No locales requested');
    }

    var supported = negotiate(
      this.availableLocales.concat(this.qps),
      requested,
      this.defaultLocale);

    // freeze only if the first language in the fallback chain is new
    if (this.supportedLocales[0] !== supported[0]) {
      freeze.call(this, supported);
    }
  };


  // Events

  Context.prototype.addEventListener = function(type, listener) {
    this._emitter.addEventListener(type, listener);
  };

  Context.prototype.removeEventListener = function(type, listener) {
    this._emitter.removeEventListener(type, listener);
  };

  Context.prototype.ready = function(callback) {
    if (this.isReady) {
      setTimeout(callback);
    }
    this.addEventListener('ready', callback);
  };

  Context.prototype.once = function(callback) {
    /* jshint -W068 */
    if (this.isReady) {
      setTimeout(callback);
      return;
    }

    var callAndRemove = (function() {
      this.removeEventListener('ready', callAndRemove);
      callback();
    }).bind(this);
    this.addEventListener('ready', callAndRemove);
  };



  var DEBUG = false;
  var isPretranslated = false;
  var rtlList = ['ar', 'he', 'fa', 'ps', 'qps-plocm', 'ur'];
  var nodeObserver = null;
  var pendingElements = null;

  var moConfig = {
    attributes: true,
    characterData: false,
    childList: true,
    subtree: true,
    attributeFilter: ['data-l10n-id', 'data-l10n-args']
  };

  // Public API

  navigator.mozL10n = {
    ctx: new Context(window.document ? document.URL : null),
    get: function get(id, ctxdata) {
      return navigator.mozL10n.ctx.get(id, ctxdata);
    },
    formatValue: function(id, ctxdata) {
      return navigator.mozL10n.ctx.formatValue(id, ctxdata);
    },
    formatEntity: function(id, ctxdata) {
      return navigator.mozL10n.ctx.formatEntity(id, ctxdata);
    },
    translateFragment: function (fragment) {
      return translateFragment.call(navigator.mozL10n, fragment);
    },
    setAttributes: setL10nAttributes,
    getAttributes: getL10nAttributes,
    ready: function ready(callback) {
      return navigator.mozL10n.ctx.ready(callback);
    },
    once: function once(callback) {
      return navigator.mozL10n.ctx.once(callback);
    },
    get readyState() {
      return navigator.mozL10n.ctx.isReady ? 'complete' : 'loading';
    },
    language: {
      set code(lang) {
        navigator.mozL10n.ctx.requestLocales(lang);
      },
      get code() {
        return navigator.mozL10n.ctx.supportedLocales[0];
      },
      get direction() {
        return getDirection(navigator.mozL10n.ctx.supportedLocales[0]);
      }
    },
    qps: PSEUDO,
    _config: {
      appVersion: null,
      localeSources: Object.create(null),
    },
    _getInternalAPI: function() {
      return {
        Error: L10nError,
        Context: Context,
        Locale: Locale,
        Resolver: Resolver,
        getPluralRule: getPluralRule,
        rePlaceables: rePlaceables,
        translateDocument: translateDocument,
        onMetaInjected: onMetaInjected,
        PropertiesParser: PropertiesParser,
        walkContent: walkContent,
        buildLocaleList: buildLocaleList
      };
    }
  };

  navigator.mozL10n.ctx.ready(onReady.bind(navigator.mozL10n));

  navigator.mozL10n.ctx.addEventListener('notfounderror',
    function reportMissingEntity(e) {
      if (DEBUG || e.loc === 'en-US') {
        console.warn(e.toString());
      }
  });

  if (DEBUG) {
    navigator.mozL10n.ctx.addEventListener('fetcherror',
      console.error.bind(console));
    navigator.mozL10n.ctx.addEventListener('parseerror',
      console.error.bind(console));
    navigator.mozL10n.ctx.addEventListener('resolveerror',
      console.error.bind(console));
  }

  function getDirection(lang) {
    return (rtlList.indexOf(lang) >= 0) ? 'rtl' : 'ltr';
  }

  var readyStates = {
    'loading': 0,
    'interactive': 1,
    'complete': 2
  };

  function waitFor(state, callback) {
    state = readyStates[state];
    if (readyStates[document.readyState] >= state) {
      callback();
      return;
    }

    document.addEventListener('readystatechange', function l10n_onrsc() {
      if (readyStates[document.readyState] >= state) {
        document.removeEventListener('readystatechange', l10n_onrsc);
        callback();
      }
    });
  }

  if (window.document) {
    isPretranslated =
      navigator.mozL10n.ctx.qps.indexOf(navigator.language) === -1 &&
        (document.documentElement.lang === navigator.language);

    // XXX always pretranslate if data-no-complete-bug is set;  this is
    // a workaround for a netError page not firing some onreadystatechange
    // events;  see https://bugzil.la/444165
    var pretranslate = document.documentElement.dataset.noCompleteBug ?
      true : !isPretranslated;
    waitFor('interactive', init.bind(navigator.mozL10n, pretranslate));
  }

  function initObserver() {
    nodeObserver = new MutationObserver(onMutations.bind(navigator.mozL10n));
    nodeObserver.observe(document, moConfig);
  }

  function init(pretranslate) {
    if (!pretranslate) {
      // initialize MO early to collect nodes injected between now and when
      // resources are loaded because we're not going to translate the whole
      // document once l10n resources are ready
      initObserver();
    }
    initResources.call(navigator.mozL10n);
  }

  function initResources() {
    /* jshint boss:true */

    var meta = {};
    var nodes = document.head
                        .querySelectorAll('link[rel="localization"],' +
                                          'meta[name="availableLanguages"],' +
                                          'meta[name="defaultLanguage"],' +
                                          'meta[name="appVersion"],' +
                                          'script[type="application/l10n"]');
    for (var i = 0, node; node = nodes[i]; i++) {
      var type = node.getAttribute('rel') || node.nodeName.toLowerCase();
      switch (type) {
        case 'localization':
          this.ctx.resLinks.push(node.getAttribute('href'));
          break;
        case 'meta':
          onMetaInjected.call(this, node, meta);
          break;
        case 'script':
          onScriptInjected.call(this, node);
          break;
      }
    }

    var additionalLanguagesPromise;

    if (navigator.mozApps && navigator.mozApps.getAdditionalLanguages) {
      // if the environment supports langpacks, register extra languages…
      additionalLanguagesPromise =
        navigator.mozApps.getAdditionalLanguages().catch(function(e) {
          console.error('Error while loading getAdditionalLanguages', e);
        });

      // …and listen to langpacks being added and removed
      document.addEventListener('additionallanguageschange', function(evt) {
        registerLocales.call(this, meta, evt.detail);
        this.ctx.requestLocales.apply(
          this.ctx, navigator.languages || [navigator.language]);
      }.bind(this));
    } else {
      additionalLanguagesPromise = Promise.resolve();
    }

    additionalLanguagesPromise.then(function(extraLangs) {
      registerLocales.call(this, meta, extraLangs);
      initLocale.call(this);
    }.bind(this));
  }

  function registerLocales(meta, extraLangs) {
    var locales = buildLocaleList.call(this, meta, extraLangs);
    navigator.mozL10n._config.localeSources = locales[1];
    this.ctx.registerLocales(locales[0], Object.keys(locales[1]));
  }

  function getMatchingLangpack(appVersion, langpacks) {
    for (var i = 0, langpack; (langpack = langpacks[i]); i++) {
      if (langpack.target === appVersion) {
        return langpack;
      }
    }
    return null;
  }

  function buildLocaleList(meta, extraLangs) {
    var loc, lp;
    var localeSources = Object.create(null);
    var defaultLocale = meta.defaultLocale || this.ctx.defaultLocale;

    if (meta.availableLanguages) {
      for (loc in meta.availableLanguages) {
        localeSources[loc] = 'app';
      }
    }

    if (extraLangs) {
      for (loc in extraLangs) {
        lp = getMatchingLangpack(this._config.appVersion, extraLangs[loc]);

        if (!lp) {
          continue;
        }
        if (!(loc in localeSources) ||
            !meta.availableLanguages[loc] ||
            parseInt(lp.revision) > meta.availableLanguages[loc]) {
          localeSources[loc] = 'extra';
        }
      }
    }

    if (!(defaultLocale in localeSources)) {
      localeSources[defaultLocale] = 'app';
    }
    return [defaultLocale, localeSources];
  }

  function splitAvailableLanguagesString(str) {
    var langs = {};

    str.split(',').forEach(function(lang) {
      // code:revision
      lang = lang.trim().split(':');
      // if revision is missing, use NaN
      langs[lang[0]] = parseInt(lang[1]);
    });
    return langs;
  }

  function onMetaInjected(node, meta) {
    switch (node.getAttribute('name')) {
      case 'availableLanguages':
        meta.availableLanguages =
          splitAvailableLanguagesString(node.getAttribute('content'));
        break;
      case 'defaultLanguage':
        meta.defaultLanguage = node.getAttribute('content');
        break;
      case 'appVersion':
        navigator.mozL10n._config.appVersion = node.getAttribute('content');
        break;
    }
  }

  function onScriptInjected(node) {
    var lang = node.getAttribute('lang');
    var locale = this.ctx.getLocale(lang);
    locale.addAST(JSON.parse(node.textContent));
  }

  function initLocale() {
    this.ctx.requestLocales.apply(
      this.ctx, navigator.languages || [navigator.language]);
    window.addEventListener('languagechange', function l10n_langchange() {
      this.ctx.requestLocales.apply(
        this.ctx, navigator.languages || [navigator.language]);
    }.bind(this));
  }

  function localizeMutations(mutations) {
    var mutation;
    var targets = new Set();

    for (var i = 0; i < mutations.length; i++) {
      mutation = mutations[i];
      if (mutation.type === 'childList') {
        var addedNode;

        for (var j = 0; j < mutation.addedNodes.length; j++) {
          addedNode = mutation.addedNodes[j];
          if (addedNode.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }
          targets.add(addedNode);
        }
      }

      if (mutation.type === 'attributes') {
        targets.add(mutation.target);
      }
    }

    targets.forEach(function(target) {
      if (target.childElementCount) {
        translateFragment.call(this, target);
      } else if (target.hasAttribute('data-l10n-id')) {
        translateElement.call(this, target);
      }
    }, this);
  }

  function onMutations(mutations, self) {
    self.disconnect();
    localizeMutations.call(this, mutations);
    self.observe(document, moConfig);
  }

  function onReady() {
    if (!isPretranslated) {
      translateDocument.call(this);
    }
    isPretranslated = false;

    if (pendingElements) {
      /* jshint boss:true */
      for (var i = 0, element; element = pendingElements[i]; i++) {
        translateElement.call(this, element);
      }
      pendingElements = null;
    }

    if (!nodeObserver) {
      initObserver();
    }
    fireLocalizedEvent.call(this);
  }

  function fireLocalizedEvent() {
    var event = new CustomEvent('localized', {
      'bubbles': false,
      'cancelable': false,
      'detail': {
        'language': this.ctx.supportedLocales[0]
      }
    });
    window.dispatchEvent(event);
  }

  /* jshint -W104 */

  function translateDocument() {
    document.documentElement.lang = this.language.code;
    document.documentElement.dir = this.language.direction;
    translateFragment.call(this, document.documentElement);
  }

  function translateFragment(element) {
    if (element.hasAttribute('data-l10n-id')) {
      translateElement.call(this, element);
    }

    var nodes = getTranslatableChildren(element);
    for (var i = 0; i < nodes.length; i++ ) {
      translateElement.call(this, nodes[i]);
    }
  }

  function setL10nAttributes(element, id, args) {
    element.setAttribute('data-l10n-id', id);
    if (args) {
      element.setAttribute('data-l10n-args', JSON.stringify(args));
    }
  }

  function getL10nAttributes(element) {
    return {
      id: element.getAttribute('data-l10n-id'),
      args: JSON.parse(element.getAttribute('data-l10n-args'))
    };
  }

  function getTranslatableChildren(element) {
    return element ? element.querySelectorAll('*[data-l10n-id]') : [];
  }

  var allowedHtmlAttrs = {
    'ariaLabel': 'aria-label',
    'ariaValueText': 'aria-valuetext',
    'ariaMozHint': 'aria-moz-hint',
    'label': 'label',
    'placeholder': 'placeholder',
    'title': 'title'
  };

  function translateElement(element) {
    if (!this.ctx.isReady) {
      if (!pendingElements) {
        pendingElements = [];
      }
      pendingElements.push(element);
      return;
    }

    var l10n = getL10nAttributes(element);

    if (!l10n.id) {
      return false;
    }

    var entity = this.ctx.getEntity(l10n.id, l10n.args);

    if (!entity) {
      return false;
    }

    if (typeof entity.value === 'string') {
      setTextContent.call(this, l10n.id, element, entity.value);
    }

    for (var key in entity.attrs) {
      var attr = entity.attrs[key];
      if (allowedHtmlAttrs.hasOwnProperty(key)) {
        element.setAttribute(allowedHtmlAttrs[key], attr);
      } else if (key === 'innerHTML') {
        // XXX: to be removed once bug 994357 lands
        element.innerHTML = attr;
      }
    }

    return true;
  }

  function setTextContent(id, element, text) {
    if (element.firstElementChild) {
      throw new L10nError(
        'setTextContent is deprecated (https://bugzil.la/1053629). ' +
        'Setting text content of elements with child elements is no longer ' +
        'supported by l10n.js. Offending data-l10n-id: "' + id +
        '" on element ' + element.outerHTML + ' in ' + this.ctx.id);
    }

    element.textContent = text;
  }

})(this);

define("shared/js/l10n", function(){});

/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */



/**
 * This lib relies on `l10n.js' to implement localizable date/time strings.
 *
 * The proposed `DateTimeFormat' object should provide all the features that are
 * planned for the `Intl.DateTimeFormat' constructor, but the API does not match
 * exactly the ES-i18n draft.
 *   - https://bugzilla.mozilla.org/show_bug.cgi?id=769872
 *   - http://wiki.ecmascript.org/doku.php?id=globalization:specification_drafts
 *
 * Besides, this `DateTimeFormat' object provides two features that aren't
 * planned in the ES-i18n spec:
 *   - a `toLocaleFormat()' that really works (i.e. fully translated);
 *   - a `fromNow()' method to handle relative dates ("pretty dates").
 *
 * WARNING: this library relies on the non-standard `toLocaleFormat()' method,
 * which is specific to Firefox -- no other browser is supported.
 */

navigator.mozL10n.DateTimeFormat = function(locales, options) {
  var _ = navigator.mozL10n.get;

  // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleFormat
  function localeFormat(d, format) {
    var tokens = format.match(/(%E.|%O.|%.)/g);

    for (var i = 0; tokens && i < tokens.length; i++) {
      var value = '';

      // http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
      switch (tokens[i]) {
        // localized day/month names
        case '%a':
          value = _('weekday-' + d.getDay() + '-short');
          break;
        case '%A':
          value = _('weekday-' + d.getDay() + '-long');
          break;
        case '%b':
        case '%h':
          value = _('month-' + d.getMonth() + '-short');
          break;
        case '%B':
          value = _('month-' + d.getMonth() + '-long');
          break;
        case '%Eb':
          value = _('month-' + d.getMonth() + '-genitive');
          break;

        // like %H, but in 12-hour format and without any leading zero
        case '%I':
          value = d.getHours() % 12 || 12;
          break;

        // like %d, without any leading zero
        case '%e':
          value = d.getDate();
          break;

        // %p: 12 hours format (AM/PM)
        case '%p':
          value = d.getHours() < 12 ? _('time_am') : _('time_pm');
          break;

        // localized date/time strings
        case '%c':
        case '%x':
        case '%X':
          // ensure the localized format string doesn't contain any %c|%x|%X
          var tmp = _('dateTimeFormat_' + tokens[i]);
          if (tmp && !(/(%c|%x|%X)/).test(tmp)) {
            value = localeFormat(d, tmp);
          }
          break;

        // other tokens don't require any localization
      }

      format = format.replace(tokens[i], value || d.toLocaleFormat(tokens[i]));
    }

    return format;
  }

  /**
   * Returns the parts of a number of seconds
   */
  function relativeParts(seconds) {
    seconds = Math.abs(seconds);
    var descriptors = {};
    var units = [
      'years', 86400 * 365,
      'months', 86400 * 30,
      'weeks', 86400 * 7,
      'days', 86400,
      'hours', 3600,
      'minutes', 60
    ];

    if (seconds < 60) {
      return {
        minutes: Math.round(seconds / 60)
      };
    }

    for (var i = 0, uLen = units.length; i < uLen; i += 2) {
      var value = units[i + 1];
      if (seconds >= value) {
        descriptors[units[i]] = Math.floor(seconds / value);
        seconds -= descriptors[units[i]] * value;
      }
    }
    return descriptors;
  }

  /**
   * Returns a translated string which respresents the
   * relative time before or after a date.
   * @param {String|Date} time before/after the currentDate.
   * @param {String} useCompactFormat whether to use a compact display format.
   * @param {Number} maxDiff returns a formatted date if the diff is greater.
   */
  function prettyDate(time, useCompactFormat, maxDiff) {
    maxDiff = maxDiff || 86400 * 10; // default = 10 days

    switch (time.constructor) {
      case String: // timestamp
        time = parseInt(time);
        break;
      case Date:
        time = time.getTime();
        break;
    }

    var secDiff = (Date.now() - time) / 1000;
    if (isNaN(secDiff)) {
      return _('incorrectDate');
    }

    if (Math.abs(secDiff) > 60) {
      // round milliseconds up if difference is over 1 minute so the result is
      // closer to what the user would expect (1h59m59s300ms diff should return
      // "in 2 hours" instead of "in an hour")
      secDiff = secDiff > 0 ? Math.ceil(secDiff) : Math.floor(secDiff);
    }

    if (secDiff > maxDiff) {
      return localeFormat(new Date(time), '%x');
    }

    var f = useCompactFormat ? '-short' : '-long';
    var parts = relativeParts(secDiff);

    var affix = secDiff >= 0 ? '-ago' : '-until';
    for (var i in parts) {
      return _(i + affix + f, { value: parts[i]});
    }
  }

  // API
  return {
    localeDateString: function localeDateString(d) {
      return localeFormat(d, '%x');
    },
    localeTimeString: function localeTimeString(d) {
      return localeFormat(d, '%X');
    },
    localeString: function localeString(d) {
      return localeFormat(d, '%c');
    },
    localeFormat: localeFormat,
    fromNow: prettyDate,
    relativeParts: relativeParts
  };
};

define("shared/js/l10n_date", function(){});

// This module declares a dependency on the shared "l10n_date" module which
// itself depends on the shared "l10n" module (see the application's "shim"
// configuration for Alameda). Declaring the dependencies in this way ensures
// that this module exports the "l10n" module's global variable only after both
// shared libraries have been loaded in the correct order.
define('l10n',['shared/js/l10n_date'], function() {
  
  return navigator.mozL10n;
});

define('constants',['require','exports','module'],function(require, exports) {
  

  // ---------------------------------------------------------
  // Constants

  exports.DAYS_STARTING_MONDAY = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday', 'sunday'];

  exports.DAYS_STARTING_SUNDAY = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday'];

  exports.DAY_STRING_TO_L10N_ID = {
    'sunday': 'weekday-0-short',
    'monday': 'weekday-1-short',
    'tuesday': 'weekday-2-short',
    'wednesday': 'weekday-3-short',
    'thursday': 'weekday-4-short',
    'friday': 'weekday-5-short',
    'saturday': 'weekday-6-short'
  };

});

define('utils',['require','l10n','constants'],function(require) {


var mozL10n = require('l10n');
var constants = require('constants');

var Utils = {};
// Maintain references to millisecond multipliers
var dateMultipliers = {
  days: 1000 * 60 * 60 * 24,
  hours: 1000 * 60 * 60,
  minutes: 1000 * 60,
  seconds: 1000,
  milliseconds: 1
};
var units = Object.keys(dateMultipliers);

/**
 * Define a singleton method that returns a unified instance
 * based on arguments.
 *
 * @param {function} constructor - A constructor function used
 *        to create a new instance.
 * @param {function} [getKey] - A function called with (arguments),
 *        and returns a lookup key for this singleton.
 * @return {object} - returns the instance either created or retrieved
 *        from the singleton-map by the key.
 */
Utils.singleton = function(constructor, getKey) {
  var singletonMap = new Map();
  return function() {
    var arglist = Array.prototype.slice.call(arguments);
    var key = (typeof getKey === 'function') ? getKey(arglist) : constructor;
    var instance = singletonMap.get(key);
    if (!instance) {
      instance = Object.create(constructor.prototype);
      constructor.apply(instance, arglist);
      singletonMap.set(key, instance);
    }
    return instance;
  };
};

Utils.memoizedDomPropertyDescriptor = function(selector) {
  var memoizedValue = null;
  return {
    get: function() {
      if (memoizedValue === null) {
        memoizedValue = document.querySelector(selector);
      }
      return memoizedValue;
    },
    set: function(value) {
      memoizedValue = value;
    }
  };
};

/**
 * Extend the given prototype object with lazy getters.
 * selectorMap is a mapping of { propertyName: selector }.
 */
Utils.extendWithDomGetters = function(proto, selectorMap) {
  for (var property in selectorMap) {
    Object.defineProperty(proto, property,
      Utils.memoizedDomPropertyDescriptor(selectorMap[property]));
  }
  return proto;
};

Utils.dateMath = {
  /**
   * Convert object literals containing interval length to milliseconds
   *
   * @param {Object|Date|Number} interval An object literal containing days,
   *                                      hours, minutes etc.
   *                                      Optionally a number or date object.
   * @param {Object} opts Options object with a unitsPartial property containing
   *                      (if desired) a restriction on which properties will be
   *                      searched on the interval.
   * @return {Number} Millisecond value for interval length.
   */
  toMS: function(interval, opts) {
    var converted, sign, unitsPartial;

    // if a millisecond interval or a Date is passed in, return that
    if (interval instanceof Date || typeof interval === 'number') {
      return +interval;
    }

    opts = opts || {};
    unitsPartial = opts.unitsPartial || units;
    // Allow for 'hours' or 'hour'
    unitsPartial = unitsPartial.map(function(unit) {
      // String.prototype.endsWith is available in FF17+
      return unit.endsWith('s') ? unit : unit.concat('s');
    });

    // some will exit early when it returns a truthy value
    sign = unitsPartial.some(function(unit) {
      return interval[unit] < 0;
    });
    // Using as a multiplier later
    sign = sign ? -1 : 1;
    // collect passed in units and multiply by their millisecond/unit count
    converted = unitsPartial.map(function(unit) {
      var partial;
      // we're storing the sign out of the iterator
      partial = Math.abs(interval[unit]);
      // A missing property and 0 should be treated the same
      return partial ? partial * dateMultipliers[unit] : 0;
    });

    // add up each millisecond-converted term and multiply total by sign
    return sign * converted.reduce(function(a, b) { return a + b; });
  },
  /**
   * Convert millisecond values to object literals conformable to toMS()
   *
   * @param {Number} interval A millisecond value.
   * @param {Object} [opts] Options object with a unitsPartial property
   *                        containing (if desired) a restriction on which
   *                        properties will be reated for the return value.
   * @return {Object} Object literal with properties as deliniated by opts.
   */
  fromMS: function(interval, opts) {
    var times, sign, unitsPartial;

    opts = opts || {};
    unitsPartial = opts.unitsPartial || units;
    // Allow for 'hours' or 'hour'
    unitsPartial = unitsPartial.map(function(unit) {
      // String.prototype.endsWith is available in FF17+
      return unit.endsWith('s') ? unit : unit.concat('s');
    });
    // For negative intervals (time previous to now)
    // update interval to absolute value and store the sign
    // to apply to all units
    if (interval < 0) {
      sign = -1;
      interval = Math.abs(interval);
    } else {
      sign = 1;
    }

    // divide the time interval by the highest millisecond multiplier
    // store the truncated result and subtract that from the interval
    // update the interval to be the remainder
    times = unitsPartial.map(function(unit, index) {
      var truncated, mult;
      mult = dateMultipliers[unit];
      truncated = Math.floor(interval / mult);
      interval = interval - (truncated * mult);
      // units are either all positive or negative
      // only iterate to needed specificity
      return sign * truncated;
    });

    // Populate the returned object using units as property names
    // and times for values
    return times.reduce(function(out, unitTime, index) {
      out[unitsPartial[index]] = unitTime;
      return out;
    }, {});
  }
};

Utils.extend = function(initialObject, extensions) {
  // extend({}, a, b, c ... d) -> {...}
  // rightmost properties (on 'd') take precedence
  extensions = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < extensions.length; i++) {
    var extender = extensions[i];
    for (var prop in extender) {
      var descriptor = Object.getOwnPropertyDescriptor(extender, prop);
      if (descriptor && descriptor.value !== undefined) {
        initialObject[prop] = extender[prop];
      }
    }
  }
  return initialObject;
};

Utils.escapeHTML = function(str, escapeQuotes) {
  var span = document.createElement('span');
  span.textContent = str;

  if (escapeQuotes) {
    return span.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }
  return span.innerHTML;
};

Utils.getLocalizedTimeHtml = function(date) {
  var f = new mozL10n.DateTimeFormat();
  var shortFormat = window.navigator.mozHour12 ?
        mozL10n.get('shortTimeFormat12') :
        mozL10n.get('shortTimeFormat24');
  return f.localeFormat(date, shortFormat.replace('%p', '<small>%p</small>'));
};

Utils.getLocalizedTimeText = function(date) {
  var f = new mozL10n.DateTimeFormat();
  var shortFormat = window.navigator.mozHour12 ?
        mozL10n.get('shortTimeFormat12') :
        mozL10n.get('shortTimeFormat24');
  return f.localeFormat(date, shortFormat);
};

Utils.changeSelectByValue = function(selectElement, value) {
  var options = selectElement.options;
  for (var i = 0; i < options.length; i++) {
    if (options[i].value == value) {
      if (selectElement.selectedIndex != i) {
        selectElement.selectedIndex = i;
      }
      break;
    }
  }
};

Utils.getSelectedValueByIndex = function(selectElement) {
  return selectElement.options[selectElement.selectedIndex].value;
};

var wakeTarget = {
  requests: {
    cpu: new Map(), screen: new Map(), wifi: new Map()
  },
  locks: {
    cpu: null, screen: null, wifi: null
  },
  timeouts: {
    cpu: null, screen: null, wifi: null
  }
};
function getLongestLock(type) {
  var max = 0;
  for (var i of wakeTarget.requests[type]) {
    var request = i[1];
    if (request.time > max) {
      max = request.time;
    }
  }
  return {
    time: max,
    lock: wakeTarget.locks[type],
    timeout: wakeTarget.timeouts[type]
  };
}
Utils.safeWakeLock = function(opts, fn) {
    /*
     * safeWakeLock
     *
     * Create a Wake lock that is automatically released after
     * timeoutMs. Locks are reentrant, and have no meaningful mutual
     * exclusion behavior.
     *
     * @param {Object} options - an object containing
     *                 [type] {string} a string passed to requestWakeLock
     *                                 default = 'cpu'. This string can be any
     *                                 resource exposed by the environment that
     *                                 this application was designed to run in.
     *                                 Gaia exposes three of them: 'cpu',
     *                                 'screen', and 'wifi'. Certified apps may
     *                                 expose more.
     *                 timeoutMs {number} number of milliseconds to hold
     *                                    the lock.
     * @param {Function} callback - a function to be called after all other
     *                              generated callbacks have been called.
     *                              function ([err]) -> undefined.
     */
  opts = opts || {};
  var type = opts.type || 'cpu';
  var timeoutMs = opts.timeoutMs | 0;
  var now = Date.now();
  var myKey = {};
  wakeTarget.requests[type].set(myKey, {
    time: now + timeoutMs
  });
  var max = getLongestLock(type);
  var unlockFn = function() {
    if (!myKey) {
      return;
    }
    wakeTarget.requests[type]. delete(myKey);
    var now = Date.now();
    var max = getLongestLock(type);
    if (max.time > now) {
      clearTimeout(wakeTarget.timeouts[type]);
      wakeTarget.timeouts[type] = setTimeout(unlockFn, max.time - now);
    } else {
      if (wakeTarget.locks[type]) {
        wakeTarget.locks[type].unlock();
      }
      wakeTarget.locks[type] = null;
      clearTimeout(wakeTarget.timeouts[type]);
      wakeTarget.timeouts[type] = null;
    }
    myKey = null;
  };
  clearTimeout(wakeTarget.timeouts[type]);
  wakeTarget.timeouts[type] = setTimeout(unlockFn, max.time - now);
  try {
    if (!wakeTarget.locks[type] && max.time > now) {
      wakeTarget.locks[type] = navigator.requestWakeLock(type);
    }
    fn(unlockFn);
  } catch (err) {
    unlockFn();
    throw err;
  }
};

Utils.repeatString = function rep(str, times) {
  var built = [], cur = str;
  for (var i = 0, j = 1; j <= times; i++) {
    if ((times & j) > 0) {
      built.push(cur);
    }
    cur = cur + cur;
    j = j << 1;
  }
  return built.join('');
};

Utils.format = {
  hms: function(sec, format) {
    var hour = 0;
    var min = 0;

    if (sec >= 3600) {
      hour = Math.floor(sec / 3600);
      sec -= hour * 3600;
    }

    if (sec >= 60) {
      min = Math.floor(sec / 60);
      sec -= min * 60;
    }

    hour = (hour < 10) ? '0' + hour : hour;
    min = (min < 10) ? '0' + min : min;
    sec = (sec < 10) ? '0' + sec : sec;

    if (typeof format !== 'undefined') {
      format = format.replace('hh', hour);
      format = format.replace('mm', min);
      format = format.replace('ss', sec);

      return format;
    }
    return hour + ':' + min + ':' + sec;
  },
  durationMs: function(ms) {
    var dm = Utils.dateMath.fromMS(ms, {
      unitsPartial: ['minutes', 'seconds', 'milliseconds']
    });
    var puts = function(x, n) {
      x = String(x);
      return Utils.repeatString('0', Math.max(0, n - x.length)) + x;
    };
    return [
      puts(dm.minutes, 2), ':',
      puts(dm.seconds, 2), '.',
      puts((dm.milliseconds / 10) | 0, 2)
    ].join('');
  }
};


Utils.async = {

  generator: function(latchCallback) {
    /*
     * Generator
     *
     * Create an async generator. Each time the generator is
     * called, it will return a new callback. When all issued
     * callbacks have been called, the latchCallback is called.
     *
     * If any of the callbacks are called with and error as
     * the first argument, the latchCallback will be called
     * immediately with that error.
     *
     * @latchCallback {Function} a function to be called after
     *           all other generated callbacks have been
     *           called
     *           function ([err]) -> undefined
     */
    var tracker = new Map();
    var issuedCallbackCount = 0;
    var disabled = false;
    var testFn = function(err) {
      var trackerSize;
      if (!disabled) {
        // FF18 defines size to be a method, so we need to test here:
        // Remove with FF18 support
        if (typeof tracker.size === 'function') {
          trackerSize = tracker.size();
        } else {
          trackerSize = tracker.size;
        }
        if (err || trackerSize === issuedCallbackCount) {
          disabled = true;
          latchCallback && latchCallback(err);
        }
      }
    };
    return function() {
      return (function() {
        var i = issuedCallbackCount++;
        return function(err) {
          tracker.set(i, true);
          testFn(err);
        };
      })();
    };
  },

  namedParallel: function(names, latchCallback) {
    /*
     * namedParallel
     *
     * Create an async namedParallel.
     *
     * The return value is an object containing the parameters
     * specified in the names array. Each parameter is set to
     * a callback. When all callbacks have been called, latchCallback
     * is called.
     *
     * If any named callback is called with an error as the first
     * parameter, latchCallback is immediately called with that
     * error. Future calls to callbacks are then no-ops.
     *
     * @names {List<String>} - A list of strings to be used as
     *        parameter names for callbacks on the returned object.
     */
    var generator = Utils.async.generator(latchCallback);
    var done = generator();
    var ret = {};
    for (var i = 0; i < names.length; i++) {
      ret[names[i]] = generator();
    }
    done();
    return ret;
  }

};

Utils.data = {

  defaultCompare: function ud_defaultCompare(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var diff = a - b;
      return diff !== 0 ? diff / Math.abs(diff) : diff;
    } else if ((typeof a === 'string' || a instanceof String) &&
               (typeof b === 'string' || b instanceof String)) {
      return (a < b) ? -1 : ((a > b) ? 1 : 0);
    } else if (Array.isArray(a) && Array.isArray(b)) {
      var commonLength = Math.min(a.length, b.length);
      for (var i = 0; i < commonLength; i++) {
        var compareResult = Utils.data.defaultCompare(a[i], b[i]);
        if (compareResult !== 0) {
          return compareResult;
        }
      }
      return b.length - a.length;
    } else {
      throw new Error('Cannot compare ' + JSON.stringify([a, b]));
    }
  },

  keyedCompare: function ud_keyedCompare(key) {
    return function internal_keyedCompare(a, b) {
      return Utils.data.defaultCompare(a[key], b[key]);
    };
  },

  binarySearch: function ud_binarySearch(key, list, compare) {
    compare = compare || Utils.data.defaultCompare;
    var botI = 0;
    var topI = list.length;
    var midI, comp, value;
    if (list.length > 0) {
      do {
        midI = botI + ((topI - botI) / 2) | 0;
        value = list[midI];
        comp = compare(value, key);
        if (comp < 0) {
          botI = midI + 1;
        } else if (comp > 0) {
          topI = midI - 1;
        }
      } while (comp !== 0 && botI < topI);
    }
    midI = comp === 0 ? midI : topI;
    value = list[midI];
    if (comp === 0 || value && compare(value, key) === 0) {
      return { match: true, index: midI, value: value };
    } else {
      var index;
      if (0 > midI) {
        index = 0;
      } else if (midI >= list.length) {
        index = list.length;
      } else {
        index = midI + (compare(value, key) < 0 ? 1 : 0);
      }
      return {
        match: false,
        index: index
      };
    }
  },

  sortedInsert: function ud_sortedInsert(item, list, compare, unique) {
    compare = compare || Utils.data.defaultCompare;
    var bs = Utils.data.binarySearch(item, list, compare);
    var inserted = !bs.match || !unique;
    if (inserted) {
      list.splice(bs.index, 0, item);
    }
    return (inserted) ? bs.index : null;
  },

  sortedRemove: function ud_sortedRemove(item, list, compare, multiple) {
    compare = compare || Utils.data.defaultCompare;
    var removed = false;
    if (!multiple) {
      var bs = Utils.data.binarySearch(item, list, compare);
      if (bs.match) {
        list.splice(bs.index, 1);
        removed = true;
      }
    } else {
      var biasedCompare = function(target, result, ic) {
        return function(a, b) {
          if (ic(a, target) === 0) {
            return result;
          } else {
            return ic(a, b);
          }
        };
      };
      var leftBound = Utils.data.binarySearch(item, list,
        biasedCompare(item, 1, compare));
      var rightBound = Utils.data.binarySearch(item, list,
        biasedCompare(item, -1, compare));
      if (leftBound.index < rightBound.index) {
        list.splice(leftBound.index, rightBound.index - leftBound.index);
        removed = true;
      }
    }
    return removed;
  }
};

Utils.addEventListenerOnce = function(element, type, fn, useCapture) {
  var handler = function(evt) {
    element.removeEventListener(type, handler, useCapture);
    fn(evt);
  };
  element.addEventListener(type, handler, useCapture);
};

Utils.summarizeDaysOfWeek = function(repeat) {
  var days = [];
  if (repeat) {
    for (var day in repeat) {
      if (repeat[day]) {
        days.push(day);
      }
    }
  }

  var _ = mozL10n.get;
  if (days.length === 7) {
    return _('everyday');
  } else if (days.length === 5 &&
             days.indexOf('saturday') === -1 &&
             days.indexOf('sunday') === -1) {
    return _('weekdays');
  } else if (days.length === 2 &&
             days.indexOf('saturday') !== -1 &&
             days.indexOf('sunday') !== -1) {
    return _('weekends');
  } else if (days.length === 0) {
    return _('never');
  } else {
    var weekStartsOnMonday = parseInt(_('weekStartsOnMonday'), 10);
    var allDays = (weekStartsOnMonday ?
                   constants.DAYS_STARTING_MONDAY :
                   constants.DAYS_STARTING_SUNDAY);

    var repeatStrings = [];
    allDays.forEach(function(day, idx) {
      if (days.indexOf(day) !== -1) {
        repeatStrings.push(_(constants.DAY_STRING_TO_L10N_ID[day]));
      }
    });

    // TODO: Use a localized separator.
    return repeatStrings.join(', ');
  }
};





return Utils;

});

/* global define */
define('audio_manager',['require'],function(require) {
  

  /**
   * The Settings App stores volumes in the range [0, 15] inclusive.
   * Whenever we need to play sounds, though, the Audio object
   * requires a float between [0.0, 1.0]. The conversion has to happen
   * somewhere. The AudioManager here draws the line right out of what
   * gets read from mozSettings.
   *
   * In other words, the conversion is not important to clients of
   * this class, who should treat the volume as a float with no
   * conversion. The only weirdness here is that unit tests must be
   * aware of the slight rounding differences when converting from a
   * float to the system level.
   */

  ////////////////////////////////////////////////////////////////
  // VolumeManager

  function isValidVolume(volume) {
    return (typeof volume === 'number' &&
            volume <= 1.0 &&
            volume >= 0.0);
  }

  var VOLUME_SETTING = 'audio.volume.alarm';
  var SYSTEM_VOLUME_MAX = 15;
  function systemVolumeToFloat(volume) {
    return (volume / SYSTEM_VOLUME_MAX);
  }

  function floatToSystemVolume(volume) {
    return Math.round(volume * SYSTEM_VOLUME_MAX);
  }

  function requestAlarmSystemVolume() {
    // Asynchronously load the alarm volume from mozSettings.
    return new Promise(function(resolve, reject) {
      var lock = navigator.mozSettings.createLock();
      var req = lock.get(VOLUME_SETTING);
      req.onsuccess = function() {
        var volume = systemVolumeToFloat(req.result[VOLUME_SETTING]);
        if (isValidVolume(volume)) {
          globalVolumeManager._volume = volume;
          resolve(volume);
        }
      };

      req.onerror = function() {
        var DEFAULT_VOLUME = 1.0;
        resolve(DEFAULT_VOLUME);
      };
    });
  }

  function VolumeManager() {
    this.VOLUME_KEY = 'defaultAlarmVolume';
    this.DEFAULT_VOLUME = 1.0;
    this._volume = this.DEFAULT_VOLUME;

    if (navigator.mozSettings) {
      navigator.mozSettings.addObserver(
        VOLUME_SETTING,
        this.onSystemAlarmVolumeChange.bind(this));
    }
  }

  VolumeManager.prototype = {
    onSystemAlarmVolumeChange: function(e) {
      // don't use the setter here
      this._volume = systemVolumeToFloat(e.settingValue);
    },

    get volume() {
      return this._volume;
    },

    set volume(volume) {
      this.setVolume(volume);
    },

    /** Set the volume with an optional completion callback. */
    setVolume: function(volume, cb) {
      if (isValidVolume(volume)) {
        this._volume = volume;

        if (navigator.mozSettings) {
          var lock = navigator.mozSettings.createLock();

          var opts = {};
          opts[VOLUME_SETTING] = floatToSystemVolume(volume);
          var req = lock.set(opts);

          if (cb) {
            req.onsuccess = cb;
          }
        }
      }
    }

  };

  ////////////////////////////////////////////////////////////////
  // AudioPlayer

  var globalVolumeManager = new VolumeManager();

  /**
   * The AudioPlayer class manages the playback of alarm ringtones. It
   * is lazy-loading, so that you can instantiate it immediately;
   * Audio objects are not actually created or loaded until you need
   * to play a sound.
   *
   * @param {function} [opts.interruptHandler]
   *   Optional callback/EventTarget to handle the 'mozinterruptbegin' event.
   */
  function AudioPlayer(opts) {
    opts = opts || {};
    this._audio = null;
    this._interruptHandler = opts.interruptHandler || null;
  }

  AudioPlayer.prototype = {

    /**
     * Play a ringtone from the shared/resources/media/alarms
     * directory, using the current global volume settings by default.
     * You can override the volume through opts.volume.
     *
     * @param {string} ringtoneName
     * @param {number} opts.volume Value between 0 and 1
     */
    playRingtone: function(ringtoneName, opts) {
      var volume = globalVolumeManager.volume;
      if (opts && 'volume' in opts) {
        volume = opts.volume;
      }
      this._prepare(); // Load up the audio element.
      this._audio.pause();
      this._audio.src = 'shared/resources/media/alarms/' + ringtoneName;
      this._audio.load(); // Required per MDN's HTMLMediaElement spec.
      this._audio.volume = volume;
      this._audio.play();
    },

    /**
     * Pause the currently-playing audio, if possible.
     */
    pause: function() {
      if (this._audio) {
        this._audio.pause();
      }
    },

    // Private methods:

    /**
     * Instantiate the Audio element and prepare it for playback.
     * For internal use only.
     * @private
     */
    _prepare: function() {
      if (!this._audio) {
        this._audio = new Audio();
        this._audio.mozAudioChannelType = 'alarm';
        this._audio.loop = true;
        this._audio.addEventListener('mozinterruptbegin', this);
      }
    },

    /**
     * @private
     */
    handleEvent: function(e) {
      if (e.type === 'mozinterruptbegin' && this._interruptHandler) {
        this._interruptHandler(e);
      }
    }
  };

  return {
    getAlarmVolume: function() {
      return globalVolumeManager.volume;
    },
    requestAlarmVolume: function() {
      return requestAlarmSystemVolume();
    },
    setAlarmVolume: function(volume, cb) {
      globalVolumeManager.setVolume(volume, cb);
    },
    createAudioPlayer: function(opts) {
      return new AudioPlayer(opts);
    },
    // Exposed for tests:
    systemVolumeToFloat: systemVolumeToFloat,
    floatToSystemVolume: floatToSystemVolume
  };
});


define('panels/alarm/post_message_proxy',['require'],function(require) {
  var objectMap = {}; // Map of object handlers.
  var responseMap = {}; // Map of callbacks awaiting function results.
  var sequenceNumber = 0; // ID for matching requests to responses.

  var PostMessageProxy = {

    /**
     * Create a PostMessageProxy. This returns an object that you can
     * call like any other JavaScript object, by proxying methods
     * through to another window.
     *
     * When you call a method, rather than returning its return value,
     * it reutrns a Promise that you can resolve to get the return
     * value from the remote function.
     *
     * @param whichWindow The window (usually window.parent or a child)
     * @param objectId A string to identify the object you're proxying
     */
    create: function(whichWindow, objectId) {
      return new Proxy({ window: whichWindow }, {
        get: function(target, name) {
          if (name in target) {
            return target[name];
          }
          return function() {
            var args = Array.slice(arguments);
            return new Promise((resolve, reject) => {
              var responseId = ++sequenceNumber;
              responseMap[responseId] = {
                resolve: resolve,
                reject: reject
              };
              target.window.postMessage({
                postMessageProxy: objectId,
                responseId: responseId,
                fn: name,
                args: args
              }, '*');
            });
          };
        }
      });
    },

    /**
     * On the other window, call PostMessateProxy.receive() to hook up
     * an object that processes messages from a proxy in another window.
     */
    receive: function(objectId, obj) {
      objectMap[objectId] = obj;
    },

    /**
     * Handle 'message' events from postMessage, both when receiving a
     * message to invoke a function call, and receiving a message with
     * the return value of that function call. Both callbacks are
     * handled here so that we only bind one listener for each
     * relevant window.
     */
    _messageHandler: function(evt) {
      var data = evt.data;
      if (data.postMessageProxy) {
        // Remote side (calling a function):
        var obj = objectMap[data.postMessageProxy];
        var { fn, args, responseId } = data;
        try {
          evt.source.postMessage({
            postMessageProxyResult: responseId,
            result: obj[fn].apply(obj, args)
          }, window.location.origin);
        } catch(e) {
          evt.source.postMessage({
            postMessageProxyResult: responseId,
            exception: e.toString(),
            stack: e.stack
          }, evt.origin);
        }
      } else if (data.postMessageProxyResult) {
        // Local side (return value):
        if (responseMap[data.postMessageProxyResult]) {
          var { resolve, reject } = responseMap[data.postMessageProxyResult];
          delete responseMap[data.postMessageProxyResult];
          if (data.exception) {
            var e = new Error();
            e.name = data.exception;
            e.stack = data.stack;
            reject(e);
          } else {
            resolve(data.result);
          }
        }
      }
    }
  };

  window.addEventListener('message', PostMessageProxy._messageHandler);

  return PostMessageProxy;

});

define('panels/alarm/child_window_manager',['require','utils'],function(require) {
  

  var Utils = require('utils');

  const READY_EVENT_TYPE = 'childWindowReady';

  /**
   * ChildWindowManager maintains the lifecycle of a child attention
   * window. When you instantiate a ChildWindowManager, no window
   * exists yet; use .whenReady() or postMessage() to call up the
   * child window and perform actions on it. Provided the child window
   * calls ChildWindowManager.fireReady(), this class takes care of
   * the bookkeeping to make sure that the child window is ready to
   * receive events before sending over any messages. Similarly, this
   * class acquires a CPU wake lock when opening the window to ensure
   * that your messages are delivered reliably without the phone going
   * to sleep while waiting for the child window to receive a message.
   */
  function ChildWindowManager(url) {
    this.url = url;
    this.childWindow = null;
    this.childWindowReady = false;
    this.childOnReadyCallbacks = [];
    this.releaseCpuLock = null;
    window.addEventListener('message', this);
  }

  ChildWindowManager.prototype = {
    /**
     * Post a message to the child window. If the window is not yet
     * open, acquire a CPU wake lock and open the window, then deliver
     * the message. Subsequent calls to postMessage will similarly
     * wait until the window is ready before delivery.
     */
    postMessage: function(message) {
      this.whenReady(() => {
        this.childWindow.postMessage(message, window.location.origin);
      });
    },

    /**
     * Closes the window. You may reinstantiate a window again by
     * sending another postMessage.
     */
    close: function() {
      if (this.childWindow && !this.childWindow.closed) {
        this.childWindow.close();
      }
      this.childWindow = null;
    },

    /**
     * Call a function when the window is ready and opened. This is
     * used internally by postMessage.
     */
    whenReady: function(callback) {
      if (!this.childWindow || this.childWindow.closed) {
        Utils.safeWakeLock({ timeoutMs: 30000 }, (releaseCpu) => {
          this.childWindow = window.open(this.url, '_blank', 'attention');
          this.childWindowReady = false;
          this.releaseCpuLock = releaseCpu;
        });
      }
      if (this.childWindowReady) {
        callback();
      } else {
        this.childOnReadyCallbacks.push(callback);
      }
    },

    /** Private. Handle DOM events. */
    handleEvent: function(evt) {
      if (evt.data.type === READY_EVENT_TYPE) {
        this.childWindowReady = true;
        while (this.childOnReadyCallbacks.length) {
          var callback = this.childOnReadyCallbacks.shift();
          callback();
        }
        if (this.releaseCpuLock) {
          this.releaseCpuLock();
        }
      }
    }
  };

  /**
   * Call this method from a child window when the child has loaded.
   * This fires a message to the parent window, instructing it to pass
   * along any queued events.
   */
  ChildWindowManager.fireReady = function() {
    if (!window.opener) {
      throw new Error('fireReady must be called from the child window.');
    }
    window.opener.postMessage({
      type: READY_EVENT_TYPE
    }, window.location.origin);
  };

  return ChildWindowManager;

});

define('ring_view',['require','utils','l10n','audio_manager','./panels/alarm/post_message_proxy','./panels/alarm/child_window_manager'],function(require) {


var Utils = require('utils');
var mozL10n = require('l10n');
var AudioManager = require('audio_manager');
var PostMessageProxy = require('./panels/alarm/post_message_proxy');
var ChildWindowManager = require('./panels/alarm/child_window_manager');

/**
 * RingView displays the alert screen when a timer or alarm fires.
 * This screen may receive multiple different alarm/timer events;
 * ideally it would display all events that fire, but currently it
 * only shows the most recent event.
 */
function RingView() {
  this.alerts = [];
  this.ringtonePlayer = AudioManager.createAudioPlayer({
    interruptHandler: this
  });

  this.snoozeButton.addEventListener('click', this.onClickSnooze.bind(this));
  this.closeButton.addEventListener('click', this.onClickClose.bind(this));
  window.addEventListener('beforeunload', this.onBeforeUnload.bind(this));
  window.addEventListener('timeformatchange', this.refreshDisplay.bind(this));

  this.activeAlarm = PostMessageProxy.create(window.opener, 'activeAlarm');

  PostMessageProxy.receive('ringView', this);

  if (window.opener) {
    mozL10n.once(() => {
      ChildWindowManager.fireReady();
    });
  }
}

// The time, in milliseconds, to keep the screen awake while showing
// an alarm. After this time, the screen shuts off and the alarm
// silences itself.
const WAKE_DURATION = 600000;

RingView.prototype = {

  /**
   * Fire the notification for an alarm or timer.
   *
   * Presently, we only display one notification at a time, and the
   * _most recent_ one at that. Each notification gets its own wake
   * lock, ensuring that the screen will remain on for WAKE_DURATION.
   *
   * @param {string} alert.type 'alarm' or 'timer'
   * @param {string} alert.label Label to display (optional).
   * @param {string} alert.sound Filename of a sound to play (optional).
   * @param {boolean} alert.vibrate True if the alert should vibrate.
   */
  addAlert: function(alert) {
    // If we previously had an alert visible, this one is
    // going to override it, as though the previous alert was
    // dismissed.
    if (this.alerts.length) {
      var oldAlert = this.alerts.shift();
      oldAlert.releaseScreenWakeLock();
    }

    alert.releaseScreenWakeLock = function() { };

    // Insert this alert at the front of the stack, so that it
    // overrides any previous alert that was being displayed.
    this.alerts.unshift(alert);

    this.refreshDisplay();

    // Acquire a CPU wake lock so that we don't fall asleep waiting
    // for the document to become visible. We'll only try to hold a
    // lock for a few seconds as we wait for the document to become
    // visible, out of an abundance of caution.
    Utils.safeWakeLock({ type: 'cpu', timeoutMs: 5000 }, (releaseCpu) => {
      // When the document is visible, acquire a screen wake lock so
      // that we can safely display the alert.
      this.whenVisible(() => {
          Utils.safeWakeLock({ type: 'screen', timeoutMs: WAKE_DURATION },
                             (releaseScreenWakeLock) => {
            // Once we have acquired the screen wake lock, we can
            // release the CPU lock.
            releaseCpu();

            // Save off the screen wake lock for when we dismiss the
            // alert; all alarms each have their own screen wake lock.
            alert.releaseScreenWakeLock = releaseScreenWakeLock;
        });
      });
    });
  },

  /**
   * Update the display to show the currently active alert. If there
   * are a stack of alerts pending, only the most recent alert is
   * shown, as added to this.alerts by this.addAlert().
   */
  refreshDisplay: function() {
    // First, silence any existing sound or vibration. If a previous
    // alarm was going off, this alarm may have different settings.
    // The new alarm will replace any prior settings.
    this.silence();

    var alert = this.alerts[0];

    // Set the label (blank or falsey becomes a default string).
    if (alert.label) {
      this.ringLabel.removeAttribute('data-l10n-id');
      this.ringLabel.textContent = alert.label;
    } else {
      this.ringLabel.setAttribute('data-l10n-id',
                                  alert.type === 'alarm' ? 'alarm' : 'timer');
    }

    // Display the proper screen widgets.
    this.ringDisplay.dataset.ringType = alert.type;

    // Set the time to display.
    this.time.innerHTML = Utils.getLocalizedTimeHtml(alert.time);

    if (alert.sound) {
      this.ringtonePlayer.playRingtone(alert.sound);
    }

    // Vibrate if we want to shakey shakey.
    if (alert.vibrate && ('vibrate' in navigator)) {
      clearInterval(this.vibrateInterval);
      var vibrateOnce = function() {
        navigator.vibrate([1000]);
      };
      this.vibrateInterval = setInterval(vibrateOnce, 2000);
      vibrateOnce();
    }

    document.documentElement.classList.add('ready');

    // If the window has been hidden, show the window.
    if (document.hidden) {
      window.focus();
    }
  },

  /**
   * Stop all sounds and vibration immediately.
   */
  silence: function() {
    // Stop the alert sound, if one was playin'.
    this.ringtonePlayer.pause();

    // Stop vibrating, if we were shakin'.
    clearInterval(this.vibrateInterval);
    this.vibrateInterval = null;
  },

  /**
   * Handle an interrupt as reported from the Audio player. This could
   * happen if an incoming call arrives while the alert is ringing. We
   * should silence our alarm to allow the phone call to take
   * precedence.
   */
  onInterrupt: function(evt) {
    this.silence();
  },

  /**
   * Clean up any state when we close this alert window. This includes
   * silencing the alarm and releasing any locks we have acquired.
   */
  onBeforeUnload: function(evt) {
    // Clean up any wake locks we still have.
    while (this.alerts.length) {
      var alert = this.alerts.shift();
      alert.releaseScreenWakeLock();
    }
    this.silence();
  },

  /**
   * Snooze the current alarm. (The snooze button is only visible for
   * alarms, not timers. Alarms have an ID; timers do not.)
   */
  onClickSnooze: function(evt) {
    var alert = this.alerts[0];
    this.activeAlarm.snoozeAlarm(alert.id);
    window.close();
  },

  /**
   * Close this window, notifying ActiveAlarm, which will pop the user
   * back to the appropriate location if they are still using the
   * Clock app.
   */
  onClickClose: function(evt) {
    var alert = this.alerts[0];
    this.activeAlarm.close(alert.type, alert.id);
    window.close();
  },

  /**
   * Call the callback when `document.hidden` is false. Due to a bug
   * in the B2G Browser API <https://bugzil.la/810431>, the window may
   * not be immediately visible, particularly if the screen is off.
   * The recommended workaround for that bug was to use setTimeout. If
   * the page is still hidden after that, we listen for
   * `visibilitychange`. When that bug has some action, we should
   * revisit how much of this method is needed.
   */
  whenVisible: function(cb) {
    if (!document.hidden) {
      cb();
    } else {
      setTimeout(() => {
        if (!document.hidden) {
          cb();
        } else {
          var listener = function(e) {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', listener);
              cb();
            }
          };
          document.addEventListener('visibilitychange', listener);
        }
      });
    }
  }

};

Utils.extendWithDomGetters(RingView.prototype, {
  time: '#ring-clock-time',
  ringLabel: '#ring-label',
  snoozeButton: '#ring-button-snooze',
  closeButton: '#ring-button-stop',
  ringDisplay: '.ring-display'
});

return RingView;

});


requirejs(['require_config'], function() {
  requirejs(['ring_view'], function(RingView) {
    window.ringView = new RingView();
  });
});

define("onring", function(){});


define('stopwatch',[],function() {

  

  var priv = new WeakMap();

  function Defaults() {
    this.startTime = 0;
    this.totalElapsed = 0;
    this.state = Stopwatch.RESET;
    this.laps = [];
  }

  /**
   * Stopwatch
   *
   * Create new or revive existing stopwatch objects.
   *
   * @param {Object} opts Optional stopwatch object to create or revive
   *                      a new or existing stopwatch object.
   *                 - startTime, number time in ms.
   *                 - totalElapsed, number time in ms.
   *                 - isStarted, started state boolean.
   *                 - laps, array of lap objects (lap = {time:, duration:}).
   */
  function Stopwatch(opts = {}) {
    var defaults = new Defaults();
    var obj = {};

    obj.startTime = opts.startTime || defaults.startTime;
    obj.totalElapsed = opts.totalElapsed || defaults.totalElapsed;
    obj.state = opts.state || defaults.state;
    obj.laps = opts.laps ? opts.laps.slice() : defaults.laps;

    priv.set(this, obj);
  }

  Stopwatch.RUNNING = 'RUNNING';
  Stopwatch.PAUSED = 'PAUSED';
  Stopwatch.RESET = 'RESET';

  Stopwatch.prototype = {

    constructor: Stopwatch,

    getState: function() {
      var sw = priv.get(this);
      return sw.state;
    },

    setState: function(state) {
      var sw = priv.get(this);
      sw.state = state;
    },

    /**
    * start Starts the stopwatch, either from a reset or paused state
    */
    start: function sw_start() {
      var sw = priv.get(this);
      if (sw.state === Stopwatch.RUNNING) {
        return;
      }
      var now = Date.now() - sw.totalElapsed;
      sw.startTime = now;
      this.setState(Stopwatch.RUNNING);
    },

    /**
    * getElapsedTime Calculates the total elapsed duration since the
    *                stopwatch was started
    * @return {Number} return total elapsed duration.
    */
    getElapsedTime: function sw_getElapsedTime() {
      var sw = priv.get(this);
      var elapsed = 0;
      if (sw.state === Stopwatch.RUNNING) {
        elapsed = Date.now() - sw.startTime;
      } else {
        elapsed = sw.totalElapsed;
      }
      return elapsed;
    },

    /**
    * pause Pauses the stopwatch
    */
    pause: function sw_pause() {
      var sw = priv.get(this);
      if (sw.state === Stopwatch.PAUSED) {
        return;
      }
      sw.totalElapsed = Date.now() - sw.startTime;
      this.setState(Stopwatch.PAUSED);
    },

    /**
    * nextLap Calculates the duration of the next lap.
    * @return {object} return an object containing:
    *         duration - the duration of this lap in ms.
    *         time - the start time of this lap in ms from epoch.
    */
    nextLap: function sw_nextLap() {
      var sw = priv.get(this);
      var now;
      if (sw.state === Stopwatch.RUNNING) {
        now = Date.now();
      } else {
        now = sw.startTime + sw.totalElapsed;
      }

      var lastLapTime;
      var newLap = {};

      if (sw.laps.length > 0) {
        lastLapTime = sw.laps[sw.laps.length - 1].time;
      } else {
        lastLapTime = 0;
      }

      newLap.duration = now - (sw.startTime + lastLapTime);
      newLap.time = now - sw.startTime;

      return newLap;
    },

    /**
    * lap Calculates a new lap duration since the last lap time,
    *     and mutates `priv[this].laps` to contain the new value.
    *     If the stopwatch isn't currently running, returns 0.
    * @return {number} return the lap duration in ms.
    */
    lap: function sw_lap() {
      var sw = priv.get(this);
      if (sw.state !== Stopwatch.RUNNING) {
        return 0;
      }
      var nl = this.nextLap();
      sw.laps.push(nl);
      return nl;
    },

    /**
    * getLaps Returns an array of laps, sorted by oldest first
    * @return {Array} return an array of laps.
    */
    getLaps: function sw_getLaps() {
      var sw = priv.get(this);
      return sw.laps.map(function(lap) {
        return lap;
      });
    },

    /**
    * reset Resets the stopwatch back to 0, clears laps
    */
    reset: function sw_reset() {
      priv.set(this, new Defaults());
    },

    /**
    * toSerializable Returns a serializable object for persisting Stopwatch data
    * @return {Object} A serializable object.
    */
    toSerializable: function sw_toSerializable() {
      var sw = priv.get(this);
      var obj = {};
      for (var i in sw) {
        if (sw.hasOwnProperty(i)) {
          obj[i] = Array.isArray(sw[i]) ? sw[i].slice() : sw[i];
        }
      }
      return obj;
    }

  };

  return Stopwatch;
});

define('text!panels/stopwatch/panel.html',[],function () { return '<div class="stopwatch-time"></div>\n<menu id="stopwatch-controls">\n  <button class="stopwatch-start edit-button" data-l10n-id="start">Start</button>\n  <button class="stopwatch-pause edit-button recommend" data-l10n-id="pause">Pause</button>\n  <button class="stopwatch-resume edit-button" data-l10n-id="resume">Resume</button>\n  <button class="stopwatch-reset edit-button danger" data-l10n-id="reset">Reset</button>\n  <button class="stopwatch-lap edit-button" data-l10n-id="lap">Lap</button>\n</menu>\n<div class="stopwatch-lap-list">\n  <!-- list of exisiting alarms, to be populated -->\n  <ul class="stopwatch-laps"></ul>\n</div>\n';});

define('text!panels/stopwatch/list_item.html',[],function () { return '<div class="lap-name">\n</div>\n<div class="lap-duration">\n  ${time}\n</div>\n';});

define('panels/stopwatch/main',['require','panel','stopwatch','utils','template','l10n','text!panels/stopwatch/panel.html','text!panels/stopwatch/list_item.html'],function(require) {
  

  var Panel = require('panel');
  var Stopwatch = require('stopwatch');
  var Utils = require('utils');
  var Template = require('template');
  var mozL10n = require('l10n');
  var html = require('text!panels/stopwatch/panel.html');
  var lapHtml = require('text!panels/stopwatch/list_item.html');
  var priv = new WeakMap();

  // This value is chosen such that the only reason you'll hit it is
  // because you're super bored, and small enough that phones won't
  // puke when displaying this many rows in the lap list.
  var MAX_STOPWATCH_LAPS = 1000;

  /**
   * Stopwatch.Panel
   *
   * Construct a UI panel for the Stopwatch panel.
   *
   * @return {Stopwatch.Panel} Stopwatch.Panel object.
   *
   */
  Stopwatch.Panel = function(element) {
    Panel.apply(this, arguments);

    this.nodes = {};
    this.lapTemplate = Template(lapHtml);
    this.interval = null;
    this.screenWakeLock = null;

    // Store maxLaps as a dataset attribute for easy access in tests.
    this.element.dataset.maxLaps = MAX_STOPWATCH_LAPS;
    this.element.innerHTML = html;
    // Gather elements
    [
      'start', 'pause', 'resume',
      'lap', 'reset', 'time',
      'lap-list', 'laps'
    ].forEach(function(sel) {
      this.nodes[sel] = this.element.querySelector('.stopwatch-' + sel);
    }, this);

    // Bind click events
    [
      'start', 'pause', 'resume', 'lap', 'reset'
    ].forEach(function(action) {
      var e = this.nodes[action];

      if (priv.has(e)) {
        priv.delete(e);
      }

      priv.set(e, {
        action: action == 'resume' ? 'start' : action
      });

      e.addEventListener('click', this);
    }, this);

    element.addEventListener(
      'panel-visibilitychange', this.onvisibilitychange.bind(this));

    this.setStopwatch(new Stopwatch());

  };

  Stopwatch.Panel.prototype = Object.create(Panel.prototype);


  Stopwatch.Panel.prototype.update = function() {
    var swp = priv.get(this);
    var e = swp.stopwatch.getElapsedTime();
    var time = Utils.format.durationMs(e);
    this.nodes.time.textContent = time;
    this.nodes.time.classList.toggle('over-100-minutes', e >= 1000 * 60 * 100);
    this.activeLap(false);
  };

  Stopwatch.Panel.prototype.showButtons = function() {
    Array.prototype.forEach.call(arguments, function(a) {
      this.nodes[a].classList.remove('hidden');
    }, this);
  };

  Stopwatch.Panel.prototype.hideButtons = function() {
    Array.prototype.forEach.call(arguments, function(a) {
      this.nodes[a].classList.add('hidden');
    }, this);
  };

  Stopwatch.Panel.prototype.setState = function(state) {
    switch (state) {
      case Stopwatch.RUNNING:
        this.onstart();
        break;

      case Stopwatch.PAUSED:
        this.onpause();
        break;

      case Stopwatch.RESET:
        this.onreset();
        break;
    }
    this.update();
  };

  Stopwatch.Panel.prototype.setStopwatch = function(stopwatch) {
    priv.set(this, {
      stopwatch: stopwatch
    });

    this.setState(stopwatch.getState());

    //Clear any existing lap indicators and make new ones
    var lapsUl = this.nodes.laps;
    lapsUl.textContent = '';
    var laps = stopwatch.getLaps();
    for (var i = 0; i < laps.length; i++) {
      this.onlap(laps[i]);
    }
    this.checkLapButton();
  };

  Stopwatch.Panel.prototype.onvisibilitychange = function(evt) {
    var stopwatch = priv.get(this).stopwatch;
    if (evt.detail.isVisible) {
      this.setState(stopwatch.getState());
    }
    if (this.screenWakeLock) {
      this.screenWakeLock.unlock();
      this.screenWakeLock = null;
    }
  };

  Stopwatch.Panel.prototype.checkLapButton = function() {
    var swp = priv.get(this);
    var maxLaps = parseInt(this.element.dataset.maxLaps, 10);
    // As the Stopwatch doesn't include the current "lap", we must
    // subtract one from maxLaps when deciding whether or not we can
    // add a lap. Using these calculations, if maxLaps is 10, the last
    // lap visible in the UI will be "Lap 10". Additionally, this
    // button can only be shown if the "pause" button is also visible,
    // as it must respect the state of the other buttons.
    var canAddLaps = (swp.stopwatch.getLaps().length < maxLaps - 1) &&
          !this.nodes.pause.classList.contains('hidden');
    this.nodes.lap.classList.toggle('hidden', !canAddLaps);
  };

  Stopwatch.Panel.prototype.handleEvent = function(event) {
    if (event.type == 'animationend') {
      Panel.prototype.handleEvent.apply(this, arguments);
      return;
    }

    var swp = priv.get(this);
    var button = priv.get(event.target);

    if (swp.stopwatch && swp.stopwatch[button.action]) {
      try {
        // call action on stopwatch
        var val = swp.stopwatch[button.action]();

        // call panel handler
        this['on' + button.action](val);
      } catch (err) {
        if (err instanceof Stopwatch.MaxLapsException) {
          // do nothing
        } else {
          throw err;
        }
      }
      this.checkLapButton();
    }
  };

  Stopwatch.Panel.prototype.onstart = function() {
    var tickfn = (function() {
      this.update();
      this.tick = requestAnimationFrame(tickfn);
    }).bind(this);
    tickfn();
    //bug#983393
    var laps = priv.get(this).stopwatch.getLaps().length+1;
    var maxLaps = parseInt(this.element.dataset.maxLaps, 10);
    if (laps<maxLaps) {
      this.showButtons('pause', 'lap');
      this.hideButtons('start', 'resume', 'reset');
    }
    this.screenWakeLock = navigator.requestWakeLock('screen');
  };

  Stopwatch.Panel.prototype.onpause = function() {
    cancelAnimationFrame(this.tick);
    this.update();
    this.nodes.reset.removeAttribute('disabled');
    this.showButtons('resume', 'reset');
    this.hideButtons('pause', 'start', 'lap');
    if (this.screenWakeLock) {
      this.screenWakeLock.unlock();
      this.screenWakeLock = null;
    }
  };

  Stopwatch.Panel.prototype.onresume = function() {
    this.onstart();
  };

  function createLapDom(num, time) {
    /* jshint validthis:true */
    var li = document.createElement('li');
    li.setAttribute('class', 'lap-cell');
    var html = this.lapTemplate.interpolate({
      time: Utils.format.durationMs(time)
    });
    li.innerHTML = html;
    mozL10n.setAttributes(
      li.querySelector('.lap-name'),
      'lap-number',
      { n: num }
    );
    return li;
  }

  function updateLapDom(num, time, li) {
    li.querySelector('.lap-duration').textContent =
      Utils.format.durationMs(time);
    mozL10n.setAttributes(
      li.querySelector('.lap-name'),
      'lap-number',
      { n: num }
    );
    return li;
  }

  Stopwatch.Panel.prototype.activeLap = function(force) {
    var stopwatch = priv.get(this).stopwatch;
    var num = stopwatch.getLaps().length + 1;
    if (num === 1 && !force) {
      return;
    }
    var node = this.nodes.laps;
    var lapnodes = node.querySelectorAll('li.lap-cell');
    var time = stopwatch.nextLap().duration;
    if (lapnodes.length === 0) {
      node.appendChild(createLapDom.call(this, num, time));
    } else {
      updateLapDom.call(this, num, time, lapnodes[0]);
    }
  };

  Stopwatch.Panel.prototype.onlap = function(val) {
    var stopwatch = priv.get(this).stopwatch;
    var node = this.nodes.laps;
    var laps = stopwatch.getLaps();
    var num = laps.length;
    this.activeLap(true);
    var li = createLapDom.call(this, num, val ? val.duration : 0);
    if (laps.length > 1) {
      var lapnodes = node.querySelectorAll('li.lap-cell');
      node.insertBefore(li, lapnodes[1]);
    } else {
      node.appendChild(li);
    }
  };

  Stopwatch.Panel.prototype.onreset = function() {
    cancelAnimationFrame(this.tick);
    this.showButtons('start', 'reset');
    this.hideButtons('pause', 'resume', 'lap');
    this.nodes.reset.setAttribute('disabled', 'true');
    // clear lap list
    this.nodes.laps.textContent = '';
    this.update();
  };

  return Stopwatch.Panel;
});

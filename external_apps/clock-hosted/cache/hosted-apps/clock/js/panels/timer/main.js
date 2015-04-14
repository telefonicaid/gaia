
/* exported GestureDetector */



/**
 * GestureDetector.js: generate events for one and two finger gestures.
 *
 * A GestureDetector object listens for touch events on a specified
 * element and generates higher-level events that describe one and two finger
 * gestures on the element.
 *
 * Supported events:
 *
 *  tap        like a click event
 *  dbltap     like dblclick
 *  pan        one finger motion
 *  swipe      when a finger is released following pan events
 *  holdstart  touch and hold. Must set an option to get these.
 *  holdmove   motion after a holdstart event
 *  holdend    when the finger goes up after holdstart/holdmove
 *  transform  2-finger pinch and twist gestures for scaling and rotation
 *
 * Each of these events is a bubbling CustomEvent with important details in the
 * event.detail field. The event details are not yet stable and are not yet
 * documented. See the calls to emitEvent() for details.
 *
 * To use this library, create a GestureDetector object by passing an element to
 * the GestureDetector() constructor and then calling startDetecting() on it.
 * The element will be the target of all the emitted gesture events. You can
 * also pass an optional object as the second constructor argument. If you're
 * interested in holdstart/holdmove/holdend events, pass {holdEvents:true} as
 * this second argument. Otherwise they will not be generated.
 * If you want to customize the pan threshold, pass {panThreshold:X} 
 * (X and Y in pixels) in the options argument.
 *
 * Implementation note: event processing is done with a simple finite-state
 * machine. This means that in general, the various kinds of gestures are
 * mutually exclusive. You won't get pan events until your finger has
 * moved more than a minimum threshold, for example, but it does, the FSM enters
 * a new state in which it can emit pan and swipe events and cannot emit hold
 * events. Similarly, if you've started a 1 finger pan/swipe gesture and
 * accidentally touch with a second finger, you'll continue to get pan events,
 * and won't suddenly start getting 2-finger transform events.
 *
 * This library never calls preventDefault() or stopPropagation on any of the
 * events it processes, so the raw touch events should still be
 * available for other code to process. It is not clear to me whether this is a
 * feature or a bug.
 */

var GestureDetector = (function() {

  //
  // Constructor
  //
  function GD(e, options) {
    this.element = e;
    this.options = options || {};
    this.options.panThreshold = this.options.panThreshold || GD.PAN_THRESHOLD;
    this.state = initialState;
    this.timers = {};
  }

  //
  // Public methods
  //

  GD.prototype.startDetecting = function() {
    var self = this;
    eventtypes.forEach(function(t) {
      self.element.addEventListener(t, self);
    });
  };

  GD.prototype.stopDetecting = function() {
    var self = this;
    eventtypes.forEach(function(t) {
      self.element.removeEventListener(t, self);
    });
  };

  //
  // Internal methods
  //

  GD.prototype.handleEvent = function(e) {
    var handler = this.state[e.type];
    if (!handler) {
      return;
    }
    // If this is a touch event handle each changed touch separately
    if (e.changedTouches) {
      // XXX https://bugzilla.mozilla.org/show_bug.cgi?id=785554
      // causes touchend events to list all touches as changed, so
      // warn if we see that bug
      if (e.type === 'touchend' && e.changedTouches.length > 1) {
        console.warn('gesture_detector.js: spurious extra changed touch on ' +
                     'touchend. See ' +
                     'https://bugzilla.mozilla.org/show_bug.cgi?id=785554');
      }

      for (var i = 0; i < e.changedTouches.length; i++) {
        handler(this, e, e.changedTouches[i]);
        // The first changed touch might have changed the state of the
        // FSM. We need this line to workaround the bug 785554, but it is
        // probably the right thing to have here, even once that bug is fixed.
        handler = this.state[e.type];
      }
    }
    else {    // Otherwise, just dispatch the event to the handler
      handler(this, e);
    }
  };

  GD.prototype.startTimer = function(type, time) {
    this.clearTimer(type);
    var self = this;
    this.timers[type] = setTimeout(function() {
      self.timers[type] = null;
      var handler = self.state[type];
      if (handler) {
        handler(self, type);
      }
    }, time);
  };

  GD.prototype.clearTimer = function(type) {
    if (this.timers[type]) {
      clearTimeout(this.timers[type]);
      this.timers[type] = null;
    }
  };

  // Switch to a new FSM state, and call the init() function of that
  // state, if it has one.  The event and touch arguments are optional
  // and are just passed through to the state init function.
  GD.prototype.switchTo = function(state, event, touch) {
    this.state = state;
    if (state.init) {
      state.init(this, event, touch);
    }
  };

  GD.prototype.emitEvent = function(type, detail) {
    if (!this.target) {
      console.error('Attempt to emit event with no target');
      return;
    }

    var event = this.element.ownerDocument.createEvent('CustomEvent');
    event.initCustomEvent(type, true, true, detail);
    this.target.dispatchEvent(event);
  };

  //
  // Tuneable parameters
  //
  GD.HOLD_INTERVAL = 1000;     // Hold events after 1000 ms
  GD.PAN_THRESHOLD = 20;       // 20 pixels movement before touch panning
  GD.DOUBLE_TAP_DISTANCE = 50;
  GD.DOUBLE_TAP_TIME = 500;
  GD.VELOCITY_SMOOTHING = 0.5;

  // Don't start sending transform events until the gesture exceeds a threshold
  GD.SCALE_THRESHOLD = 20;     // pixels
  GD.ROTATE_THRESHOLD = 22.5;  // degrees

  // For pans and zooms, we compute new starting coordinates that are part way
  // between the initial event and the event that crossed the threshold so that
  // the first event we send doesn't cause a big lurch. This constant must be
  // between 0 and 1 and says how far along the line between the initial value
  // and the new value we pick
  GD.THRESHOLD_SMOOTHING = 0.9;

  //
  // Helpful shortcuts and utility functions
  //

  var abs = Math.abs, floor = Math.floor, sqrt = Math.sqrt, atan2 = Math.atan2;
  var PI = Math.PI;

  // The names of events that we need to register handlers for
  var eventtypes = [
    'touchstart',
    'touchmove',
    'touchend'
  ];

  // Return the event's timestamp in ms
  function eventTime(e) {
    // In gecko, synthetic events seem to be in microseconds rather than ms.
    // So if the timestamp is much larger than the current time, assue it is
    // in microseconds and divide by 1000
    var ts = e.timeStamp;
    if (ts > 2 * Date.now()) {
      return Math.floor(ts / 1000);
    } else {
      return ts;
    }
  }


  // Return an object containg the space and time coordinates of
  // and event and touch. We freeze the object to make it immutable so
  // we can pass it in events and not worry about values being changed.
  function coordinates(e, t) {
    return Object.freeze({
      screenX: t.screenX,
      screenY: t.screenY,
      clientX: t.clientX,
      clientY: t.clientY,
      timeStamp: eventTime(e)
    });
  }

  // Like coordinates(), but return the midpoint between two touches
  function midpoints(e, t1, t2) {
    return Object.freeze({
      screenX: floor((t1.screenX + t2.screenX) / 2),
      screenY: floor((t1.screenY + t2.screenY) / 2),
      clientX: floor((t1.clientX + t2.clientX) / 2),
      clientY: floor((t1.clientY + t2.clientY) / 2),
      timeStamp: eventTime(e)
    });
  }

  // Given coordinates objects c1 and c2, return a new coordinates object
  // representing a point and time along the line between those points.
  // The position of the point is controlled by the THRESHOLD_SMOOTHING constant
  function between(c1, c2) {
    var r = GD.THRESHOLD_SMOOTHING;
    return Object.freeze({
      screenX: floor(c1.screenX + r * (c2.screenX - c1.screenX)),
      screenY: floor(c1.screenY + r * (c2.screenY - c1.screenY)),
      clientX: floor(c1.clientX + r * (c2.clientX - c1.clientX)),
      clientY: floor(c1.clientY + r * (c2.clientY - c1.clientY)),
      timeStamp: floor(c1.timeStamp + r * (c2.timeStamp - c1.timeStamp))
    });
  }

  // Compute the distance between two touches
  function touchDistance(t1, t2) {
    var dx = t2.screenX - t1.screenX;
    var dy = t2.screenY - t1.screenY;
    return sqrt(dx * dx + dy * dy);
  }

  // Compute the direction (as an angle) of the line between two touches
  // Returns a number d, -180 < d <= 180
  function touchDirection(t1, t2) {
    return atan2(t2.screenY - t1.screenY,
                 t2.screenX - t1.screenX) * 180 / PI;
  }

  // Compute the clockwise angle between direction d1 and direction d2.
  // Returns an angle a -180 < a <= 180.
  function touchRotation(d1, d2) {
    var angle = d2 - d1;
    if (angle > 180) {
      angle -= 360;
    } else if (angle <= -180) {
      angle += 360;
    }
    return angle;
  }

  // Determine if two taps are close enough in time and space to
  // trigger a dbltap event. The arguments are objects returned
  // by the coordinates() function.
  function isDoubleTap(lastTap, thisTap) {
    var dx = abs(thisTap.screenX - lastTap.screenX);
    var dy = abs(thisTap.screenY - lastTap.screenY);
    var dt = thisTap.timeStamp - lastTap.timeStamp;
    return (dx < GD.DOUBLE_TAP_DISTANCE &&
            dy < GD.DOUBLE_TAP_DISTANCE &&
            dt < GD.DOUBLE_TAP_TIME);
  }

  //
  // The following objects are the states of our Finite State Machine
  //

  // In this state we're not processing any gestures, just waiting
  // for an event to start a gesture and ignoring others
  var initialState = {
    name: 'initialState',
    init: function(d) {
      // When we enter or return to the initial state, clear
      // the detector properties that were tracking gestures
      // Don't clear d.lastTap here, though. We need it for dbltap events
      d.target = null;
      d.start = d.last = null;
      d.touch1 = d.touch2 = null;
      d.vx = d.vy = null;
      d.startDistance = d.lastDistance = null;
      d.startDirection = d.lastDirection = null;
      d.lastMidpoint = null;
      d.scaled = d.rotated = null;
    },

    // Switch to the touchstarted state and process the touch event there
    touchstart: function(d, e, t) {
      d.switchTo(touchStartedState, e, t);
    }
  };

  // One finger is down but we haven't generated any event yet. We're
  // waiting to see...  If the finger goes up soon, its a tap. If the finger
  // stays down and still, its a hold. If the finger moves its a pan/swipe.
  // And if a second finger goes down, its a transform
  var touchStartedState = {
    name: 'touchStartedState',
    init: function(d, e, t) {
      // Remember the target of the event
      d.target = e.target;
      // Remember the id of the touch that started
      d.touch1 = t.identifier;
      // Get the coordinates of the touch
      d.start = d.last = coordinates(e, t);
      // Start a timer for a hold
      // If we're doing hold events, start a timer for them
      if (d.options.holdEvents) {
        d.startTimer('holdtimeout', GD.HOLD_INTERVAL);
      }
    },

    touchstart: function(d, e, t) {
      // If another finger goes down in this state, then
      // go to transform state to start 2-finger gestures.
      d.clearTimer('holdtimeout');
      d.switchTo(transformState, e, t);
    },
    touchmove: function(d, e, t) {
      // Ignore any touches but the initial one
      // This could happen if there was still a finger down after
      // the end of a previous 2-finger gesture, e.g.
      if (t.identifier !== d.touch1) {
        return;
      }

      if (abs(t.screenX - d.start.screenX) > d.options.panThreshold ||
          abs(t.screenY - d.start.screenY) > d.options.panThreshold) {
        d.clearTimer('holdtimeout');
        d.switchTo(panStartedState, e, t);
      }
    },
    touchend: function(d, e, t) {
      // Ignore any touches but the initial one
      if (t.identifier !== d.touch1) {
        return;
      }

      // If there was a previous tap that was close enough in time
      // and space, then emit a 'dbltap' event
      if (d.lastTap && isDoubleTap(d.lastTap, d.start)) {
        d.emitEvent('tap', d.start);
        d.emitEvent('dbltap', d.start);
        // clear the lastTap property, so we don't get another one
        d.lastTap = null;
      }
      else {
        // Emit a 'tap' event using the starting coordinates
        // as the event details
        d.emitEvent('tap', d.start);

        // Remember the coordinates of this tap so we can detect double taps
        d.lastTap = coordinates(e, t);
      }

      // In either case clear the timer and go back to the initial state
      d.clearTimer('holdtimeout');
      d.switchTo(initialState);
    },

    holdtimeout: function(d) {
      d.switchTo(holdState);
    }

  };

  // A single touch has moved enough to exceed the pan threshold and now
  // we're going to generate pan events after each move and a swipe event
  // when the touch ends. We ignore any other touches that occur while this
  // pan/swipe gesture is in progress.
  var panStartedState = {
    name: 'panStartedState',
    init: function(d, e, t) {
      // Panning doesn't start until the touch has moved more than a
      // certain threshold. But we don't want the pan to have a jerky
      // start where the first event is a big distance. So proceed as
      // pan actually started at a point along the path between the
      // first touch and this current touch.
      d.start = d.last = between(d.start, coordinates(e, t));

      // If we transition into this state with a touchmove event,
      // then process it with that handler. If we don't do this then
      // we can end up with swipe events that don't know their velocity
      if (e.type === 'touchmove') {
        panStartedState.touchmove(d, e, t);
      }
    },

    touchmove: function(d, e, t) {
      // Ignore any fingers other than the one we're tracking
      if (t.identifier !== d.touch1) {
        return;
      }

      // Each time the touch moves, emit a pan event but stay in this state
      var current = coordinates(e, t);
      d.emitEvent('pan', {
        absolute: {
          dx: current.screenX - d.start.screenX,
          dy: current.screenY - d.start.screenY
        },
        relative: {
          dx: current.screenX - d.last.screenX,
          dy: current.screenY - d.last.screenY
        },
        position: current
      });

      // Track the pan velocity so we can report this with the swipe
      // Use a exponential moving average for a bit of smoothing
      // on the velocity
      var dt = current.timeStamp - d.last.timeStamp;
      var vx = (current.screenX - d.last.screenX) / dt;
      var vy = (current.screenY - d.last.screenY) / dt;

      if (d.vx == null) { // first time; no average
        d.vx = vx;
        d.vy = vy;
      }
      else {
        d.vx = d.vx * GD.VELOCITY_SMOOTHING +
          vx * (1 - GD.VELOCITY_SMOOTHING);
        d.vy = d.vy * GD.VELOCITY_SMOOTHING +
          vy * (1 - GD.VELOCITY_SMOOTHING);
      }

      d.last = current;
    },
    touchend: function(d, e, t) {
      // Ignore any fingers other than the one we're tracking
      if (t.identifier !== d.touch1) {
        return;
      }

      // Emit a swipe event when the finger goes up.
      // Report start and end point, dx, dy, dt, velocity and direction
      var current = coordinates(e, t);
      var dx = current.screenX - d.start.screenX;
      var dy = current.screenY - d.start.screenY;
      // angle is a positive number of degrees, starting at 0 on the
      // positive x axis and increasing clockwise.
      var angle = atan2(dy, dx) * 180 / PI;
      if (angle < 0) {
        angle += 360;
      }

      // Direction is 'right', 'down', 'left' or 'up'
      var direction;
      if (angle >= 315 || angle < 45) {
        direction = 'right';
      } else if (angle >= 45 && angle < 135) {
        direction = 'down';
      } else if (angle >= 135 && angle < 225) {
        direction = 'left';
      } else if (angle >= 225 && angle < 315) {
        direction = 'up';
      }

      d.emitEvent('swipe', {
        start: d.start,
        end: current,
        dx: dx,
        dy: dy,
        dt: e.timeStamp - d.start.timeStamp,
        vx: d.vx,
        vy: d.vy,
        direction: direction,
        angle: angle
      });

      // Go back to the initial state
      d.switchTo(initialState);
    }
  };

  // We enter this state if the user touches and holds for long enough
  // without moving much.  When we enter we emit a holdstart event. Motion
  // after the holdstart generates holdmove events. And when the touch ends
  // we generate a holdend event. holdmove and holdend events can be used
  // kind of like drag and drop events in a mouse-based UI. Currently,
  // these events just report the coordinates of the touch.  Do we need
  // other details?
  var holdState = {
    name: 'holdState',
    init: function(d) {
      d.emitEvent('holdstart', d.start);
    },

    touchmove: function(d, e, t) {
      var current = coordinates(e, t);
      d.emitEvent('holdmove', {
        absolute: {
          dx: current.screenX - d.start.screenX,
          dy: current.screenY - d.start.screenY
        },
        relative: {
          dx: current.screenX - d.last.screenX,
          dy: current.screenY - d.last.screenY
        },
        position: current
      });

      d.last = current;
    },

    touchend: function(d, e, t) {
      var current = coordinates(e, t);
      d.emitEvent('holdend', {
        start: d.start,
        end: current,
        dx: current.screenX - d.start.screenX,
        dy: current.screenY - d.start.screenY
      });
      d.switchTo(initialState);
    }
  };

  // We enter this state if a second touch starts before we start
  // recoginzing any other gesture.  As the touches move we track the
  // distance and angle between them to report scale and rotation values
  // in transform events.
  var transformState = {
    name: 'transformState',
    init: function(d, e, t) {
      // Remember the id of the second touch
      d.touch2 = t.identifier;

      // Get the two Touch objects
      var t1 = e.touches.identifiedTouch(d.touch1);
      var t2 = e.touches.identifiedTouch(d.touch2);

      // Compute and remember the initial distance and angle
      d.startDistance = d.lastDistance = touchDistance(t1, t2);
      d.startDirection = d.lastDirection = touchDirection(t1, t2);

      // Don't start emitting events until we're past a threshold
      d.scaled = d.rotated = false;
    },

    touchmove: function(d, e, t) {
      // Ignore touches we're not tracking
      if (t.identifier !== d.touch1 && t.identifier !== d.touch2) {
        return;
      }

      // Get the two Touch objects
      var t1 = e.touches.identifiedTouch(d.touch1);
      var t2 = e.touches.identifiedTouch(d.touch2);

      // Compute the new midpoints, distance and direction
      var midpoint = midpoints(e, t1, t2);
      var distance = touchDistance(t1, t2);
      var direction = touchDirection(t1, t2);
      var rotation = touchRotation(d.startDirection, direction);

      // Check all of these numbers against the thresholds. Otherwise
      // the transforms are too jittery even when you try to hold your
      // fingers still.
      if (!d.scaled) {
        if (abs(distance - d.startDistance) > GD.SCALE_THRESHOLD) {
          d.scaled = true;
          d.startDistance = d.lastDistance =
            floor(d.startDistance +
                  GD.THRESHOLD_SMOOTHING * (distance - d.startDistance));
        } else {
          distance = d.startDistance;
        }
      }
      if (!d.rotated) {
        if (abs(rotation) > GD.ROTATE_THRESHOLD) {
          d.rotated = true;
        } else {
          direction = d.startDirection;
        }
      }

      // If nothing has exceeded the threshold yet, then we
      // don't even have to fire an event.
      if (d.scaled || d.rotated) {
        // The detail field for the transform gesture event includes
        // 'absolute' transformations against the initial values and
        // 'relative' transformations against the values from the last
        // transformgesture event.
        d.emitEvent('transform', {
          absolute: { // transform details since gesture start
            scale: distance / d.startDistance,
            rotate: touchRotation(d.startDirection, direction)
          },
          relative: { // transform since last gesture change
            scale: distance / d.lastDistance,
            rotate: touchRotation(d.lastDirection, direction)
          },
          midpoint: midpoint
        });

        d.lastDistance = distance;
        d.lastDirection = direction;
        d.lastMidpoint = midpoint;
      }
    },

    touchend: function(d, e, t) {
      // If either finger goes up, we're done with the gesture.
      // The user might move that finger and put it right back down
      // again to begin another 2-finger gesture, so we can't go
      // back to the initial state while one of the fingers remains up.
      // On the other hand, we can't go back to touchStartedState because
      // that would mean that the finger left down could cause a tap or
      // pan event. So we need an afterTransform state that waits for
      // a finger to come back down or the other finger to go up.
      if (t.identifier === d.touch2) {
        d.touch2 = null;
      } else if (t.identifier === d.touch1) {
        d.touch1 = d.touch2;
        d.touch2 = null;
      } else {
        return; // It was a touch we weren't tracking
      }

      // If we emitted any transform events, now we need to emit
      // a transformend event to end the series.  The details of this
      // event use the values from the last touchmove, and the
      // relative amounts will 1 and 0, but they are included for
      // completeness even though they are not useful.
      if (d.scaled || d.rotated) {
        d.emitEvent('transformend', {
          absolute: { // transform details since gesture start
            scale: d.lastDistance / d.startDistance,
            rotate: touchRotation(d.startDirection, d.lastDirection)
          },
          relative: { // nothing has changed relative to the last touchmove
            scale: 1,
            rotate: 0
          },
          midpoint: d.lastMidpoint
        });
      }

      d.switchTo(afterTransformState);
    }
  };

  // We did a tranform and one finger went up. Wait for that finger to
  // come back down or the other finger to go up too.
  var afterTransformState = {
    name: 'afterTransformState',
    touchstart: function(d, e, t) {
      d.switchTo(transformState, e, t);
    },

    touchend: function(d, e, t) {
      if (t.identifier === d.touch1) {
        d.switchTo(initialState);
      }
    }
  };

  return GD;
}());

define("shared/js/gesture_detector", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.GestureDetector;
    };
}(this)));

define('text!picker/spinner.html',[],function () { return '<div class="picker-unit">${unit}</div>\n';});

define('picker/spinner',['require','template','shared/js/gesture_detector','text!picker/spinner.html'],function(require) {
  

  var Template = require('template');
  var GestureDetector = require('shared/js/gesture_detector');
  var spinnerHtml = require('text!picker/spinner.html');

  // units covered per millisecond threshold to kick off inertia
  var SPEED_THRESHOLD = 0.01;

  // max units covered by inertia
  var INERTIA_MAXIMUM = 15;

  // not the same as animation duration, this accounts for "slowing down",
  // measured in miliseconds
  var INERTIA_DURATION = 300;

  // number of milliseconds after last motion without leting go
  // we will select whatever is being "hovered" and cancel momentum
  var DRAGGING_TIMEOUT = 200;

  function calculateSpeed(previous, current) {
    /* jshint validthis:true */
    var motion = (previous.y - current.y) / this.unitHeight;
    var delta = current.time - previous.time;
    var speed = motion / delta;

    return parseFloat(speed.toFixed(4)) || 0;
  }

  function Touch(touch = {}) {
    this.x = touch.x || 0;
    this.y = touch.y || 0;
    this.time = touch.time || 0;
  }

  /**
   * Spinner
   *
   * Create a select list spinner.
   *
   * @param {Object} setup An object containing setup data.
   *                       - element, a DOM element to create
   *                         the spinner with.
   *                       - values, an array of values to
   *                         populate the spinner with.
   *
   *
   * new Spinner({
   *   element: this.selector[picker],
   *   values: values
   * });
   *
   *
   */
  function Spinner(setup = {}) {
    // define some non writable properties
    Object.defineProperties(this, {
      value: {
        get: function() {
          return this.values[this.index];
        },
        set: function(value) {
          this.select(this.values.indexOf(value));
        }
      },
      unitHeight: {
        get: function() {
          return this.element.children[0].clientHeight;
        }
      },
      space: {
        get: function() {
          return this.unitHeight * this.length;
        }
      },
      container: {
        value: setup.element.parentNode
      },
      element: {
        value: setup.element
      },
      values: {
        value: setup.values
      },
      length: {
        value: setup.values.length
      },
      textValues: {
        value: setup.textValues || setup.values
      }
    });

    this.template = new Template(spinnerHtml);

    this.top = 0;
    this.index = 0;

    this.previous = new Touch();
    this.current = new Touch();

    this.timeout = null;

    var html = '';

    for (var i = 0; i < this.length; i++) {
      html += this.template.interpolate({
        // Coerce the number value to a string
        unit: this.values[i] + ''
      });
    }

    this.element.innerHTML = html;

    this.container.addEventListener('touchstart', this, false);
    this.container.addEventListener('pan', this, false);
    this.container.addEventListener('swipe', this, false);
    this.container.addEventListener('keypress', this, false);
    this.container.setAttribute('aria-valuemax', this.upper);
    this.container.setAttribute('aria-valuemin', this.lower);
    this.container.setAttribute('aria-valuenow', this.index);
    this.container.setAttribute('aria-valuetext', this.textValues[this.index]);

    this.reset();

    new GestureDetector(this.container).startDetecting();
  }

  Spinner.prototype.reset = function() {
    this.index = 0;
    this.top = 0;
    this.update();
  };

  Spinner.prototype.update = function() {
    this.container.setAttribute('aria-valuenow', this.index);
    this.container.setAttribute('aria-valuetext', this.textValues[this.index]);
    this.element.style.transform = 'translateY(' + this.top + 'px)';
  };

  Spinner.prototype.select = function(index) {

    index = Math.round(index);

    if (index < 0) {
      index = 0;
    }

    if (index > this.length - 1) {
      index = this.length - 1;
    }

    if (index !== this.index) {
      this.index = index;
    }

    this.top = -this.index * this.unitHeight;
    this.update();

    return index;
  };

  Spinner.prototype.handleEvent = function(event) {
    this['on' + event.type](event);
  };

  Spinner.prototype.stopInteraction = function() {
    this.element.classList.add('animation-on');

    clearTimeout(this.timeout);

    this.select(this.index);
    this.speed = 0;
  };

  /**
   * ontouchstart - prevent default action (stops scrolling)
   */
  Spinner.prototype.ontouchstart = function(event) {
    event.preventDefault();
  };

  Spinner.prototype.onpan = function(event) {
    event.stopPropagation();
    var position = event.detail.position;
    var diff;

    // If this is the first pan event after a swipe...
    if (this.element.classList.contains('animation-on')) {
      this.element.classList.remove('animation-on');

      this.select(this.index);

      this.previous.y = position.clientY;
      this.previous.time = position.timeStamp;
      return;
    }

    this.current.y = position.clientY;
    this.current.time = position.timeStamp;
    this.speed = calculateSpeed.call(this, this.previous, this.current);

    diff = this.current.y - this.previous.y;

    this.top = this.top + diff;

    if (this.top > 0) {
      this.top = 0;
    }
    if (this.top < -this.space) {
      this.top = -this.space;
    }

    this.index = Math.round(Math.abs(this.top) / this.unitHeight);
    this.update();

    clearTimeout(this.timeout);

    var stopInteraction = this.stopInteraction.bind(this);
    this.timeout = setTimeout(stopInteraction, DRAGGING_TIMEOUT);

    this.previous.y = this.current.y;
    this.previous.time = this.current.time;
  };

  Spinner.prototype.onswipe = function(event) {

    event.stopPropagation();

    // Add momentum if speed is higher than a given threshold.
    var direction = this.speed > 0 ? 1 : -1;
    var speed = this.speed / direction;
    if (speed >= SPEED_THRESHOLD) {
      this.index += Math.round(
        Math.min(speed * INERTIA_DURATION, INERTIA_MAXIMUM) * direction
      );
    }

    this.stopInteraction();

  };

  Spinner.prototype.onkeypress = function(event) {
    this.element.classList.add('animation-on');
    if (event.keyCode == KeyEvent.DOM_VK_DOWN) {
      this.select(this.index - 1);
    } else {
      this.select(this.index + 1);
    }
  };

  return Spinner;
});

define('picker/picker',['require','picker/spinner','l10n'],function(require) {
  
  var Spinner = require('picker/spinner');
  var _ = require('l10n').get;
  /**
   * Picker
   *
   * Create an inline "picker", comprised of n "spinners".
   *
   * @param {Object} setup An object containing setup data.
   *                       - element, The container element.
   *                       - pickers, an object whose properties
   *                         correspond to a Picker that will
   *                         be created.
   *
   *
   * new Picker({
   *   element: 'time-picker',
   *   pickers: {
   *     hours: {
   *       range: [0, 24],
   *       valueText: 'nSpinnerHours'
   *     },
   *     minutes: {
   *       range: [0, 60],
   *       isPadded: true,
   *       valueText: 'nSpinnerMinutes'
   *     },
   *     seconds: {
   *       range: [0, 60],
   *       isPadded: true,
   *       valueText: 'nSpinnerSeconds'
   *     }
   *   }
   * });
   *
   */
  function Picker(setup) {
    this.nodes = {};
    this.spinners = {};
    this.pickers = Object.keys(setup.pickers);

    this.pickers.forEach(function(picker) {
      var values = [];
      var range = setup.pickers[picker].range;
      var isPadded = setup.pickers[picker].isPadded || false;
      var valueText = setup.pickers[picker].valueText;
      var textValues = [];

      this.nodes[picker] = setup.element.querySelector('.picker-' + picker);

      for (var i = range[0]; i <= range[1]; i++) {
        values.push(isPadded && i < 10 ? '0' + i : '' + i);
        if (valueText) {
          textValues.push(_(valueText, { n: i }));
        }
      }

      this.spinners[picker] = new Spinner({
        element: this.nodes[picker],
        values: values,
        textValues: textValues.length ? textValues : values
      });
    }, this);
  }

  Picker.prototype = {
    get value() {
      // Protect against uninitialized [[Get]] access
      if (typeof this.pickers === 'undefined') {
        return null;
      }

      return this.pickers.map(function(picker) {
        return this.spinners[picker].value;
      }, this).join(':');
    },

    set value(value) {
      // Protect against uninitialized [[Set]] access
      if (typeof this.pickers === 'undefined') {
        return null;
      }

      value.split(':').forEach(function(value, i) {
        this.spinners[this.pickers[i]].value = value;
      }, this);

      return this.value;
    },

    reset: function() {
      this.pickers.forEach(function(picker) {
        this.spinners[picker].reset();
      }, this);
    }
  };

  return Picker;
});

// outer IIFE
define('form_button',['require','utils'],function(require) {


var Utils = require('utils');

function createButton(formButton) {
  var button = document.createElement(formButton.tagName);
  button.className = formButton.className;
  if (formButton.id) {
    button.id = formButton.id;
  }
  var input = formButton.input;
  input.parentNode.insertBefore(button, input.nextSibling);
  formButton.button = button;
}

/**
 * A FormButton is a button that triggers an input. The text
 * of the currently selected value will display on the buttons's face.
 *
 * The `config` paramater supports the following optional properties.
 * `formatLabel` - A function that is given the current value of the input
 * and should return a string which will be used as the textContent of
 * the button.
 *
 * `tagName` - The name of the tag to create and insert into the
 * document as the main button used to trigger the input. The default
 * value is 'button'
 *
 * `className` The value of the className property that will be assigned to
 *  the button element the default value is 'icon icon-dialog'.
 *
 * `id` - A string that is used as the id of the button element.
 *
 * @constructor
 * @param {HTMLElement} input The input element to trigger.
 * @param {Object} config An optional config object.
 *
 */
function FormButton(input, config) {
  config = config || {};
  Utils.extend(this, config);

  this.input = input;
  createButton(this);

  this.input.classList.add('form-button-input');
  // hide input
  this.input.classList.add('form-button-hide');

  // set isSelect
  Object.defineProperty(this, 'isSelect', {
    value: this.input.nodeName === 'SELECT'
  });

  this.button.addEventListener('click', this.focus.bind(this), false);

  input.addEventListener('change', this.refresh.bind(this), false);
  input.addEventListener('blur', this.refresh.bind(this), false);

  // Bind this.refresh so that the listener can be easily removed.
  this.refresh = this.refresh.bind(this);
  // Update the dropdown when the language changes.
  window.addEventListener('localized', this.refresh);
  window.addEventListener('timeformatchange', this.refresh);
}

FormButton.prototype = {

  /** Remove all event handlers. */
  destroy: function() {
    window.removeEventListener('localized', this.refresh);
  },

  /**
   * focus Triggers a focus event on the input associated with this
   * FormButton.
   *
   * @param {Object} event an event object.
   */
  focus: function(event) {
    event.preventDefault();
    setTimeout(this.input.focus.bind(this.input), 10);
  },

  /**
   * refresh Updates the label text on the button to reflect
   * the current value of the input.
   *
   */
  refresh: function() {
    var value = this.value;
    this.button.textContent = this.formatLabel(value);
  },

  /**
   * value Returns the current value of the input.
   *
   * @return {String|Object} The value of the input.
   *
   */
  get value() {
    if (this.isSelect) {
      if (this.input.multiple) {
        var selectedOptions = {};
        var options = this.input.options;
        for (var i = 0; i < options.length; i++) {
          if (options[i].selected) {
            selectedOptions[options[i].value] = true;
          }
        }
        return selectedOptions;
      }
      if (this.input.selectedIndex !== -1) {
        return Utils.getSelectedValueByIndex(this.input);
      }
      return null;
    }
    // input node
    return this.input.value;
  },

  /**
   * value sets the current value of the input and update's the
   * button text.
   *
   * @param {String|Object} value A string of the current values or an
   * object with properties that map to input options if the input is
   * a multi select.
   *
   */
  set value(value) {
    if (this.isSelect) {
      if (this.input.multiple) {
        // multi select
        var options = this.input.options;
        for (var i = 0; i < options.length; i++) {
          options[i].selected = value[options[i].value] === true;
        }
      } else {
        // normal select element
        Utils.changeSelectByValue(this.input, value);
      }
    } else {
      // input element
      this.input.value = value;
    }
    // Update the text on the button to reflect the new input value
    this.refresh();
  },

  /**
   * An overrideable method that is called when updating the textContent
   * of the button.
   *
   * @return {String} The formatted text to display in the label.
   *
   */
  formatLabel: function(value) {
    return value;
  },

  /**
   * tagName The the name of the tag to insert into the document to use
   * as the button element.
   */
  tagName: 'button',

  /**
   * class The value to assign to the className property on the
   * generated button element.
   */
  className: 'icon icon-dialog'

};

  return FormButton;

// end outer IIFE
});

define('text!panels/timer/panel.html',[],function () { return '<div id="timer-dialog" class="panel skin-dark">\n\n  <div id="value-selector">\n    <!-- Time Picker -->\n\n    <div id="time-picker" data-type="picker">\n      <div class="picker-container">\n        <div class="picker-labels">\n          <div class="picker-label" id="hours" data-l10n-id="hours">\n            Hours\n          </div>\n          <div class="picker-label" id="minutes" data-l10n-id="minutes">\n            Minutes\n          </div>\n        </div>\n        <div class="picker-bar-background">\n        </div>\n        <div class="picker-hours-wrapper" role="spinbutton" aria-labelledby="hours">\n          <div class="picker-hours">\n          </div>\n        </div>\n        <div class="picker-minutes-wrapper" role="spinbutton" aria-labelledby="minutes">\n          <div class="picker-minutes">\n          </div>\n        </div>\n        <div class="value-indicator">\n          <div class="value-indicator-colon" aria-hidden="true">:</div>\n        </div>\n      </div>\n    </div>\n\n\n    <ul id="timer-edit" class="compact">\n      <li>\n        <button id="timer-create" class="recommend" data-l10n-id="start">\n          Start\n        </button>\n      </li>\n      <li>\n        <label data-l10n-id="sound">Sound:</label>\n        <select id="timer-sound">\n          <option value="0" data-l10n-id="noSound">No Sound</option>\n          <option value="ac_awake.opus" data-l10n-id="ac_awake_opus" selected></option>\n          <option value="ac_crystalize.opus" data-l10n-id="ac_crystalize_opus"></option>\n          <option value="ac_cycle.opus" data-l10n-id="ac_cycle_opus"></option>\n          <option value="ac_digicloud.opus" data-l10n-id="ac_digicloud_opus"></option>\n          <option value="ac_humming_waves.opus" data-l10n-id="ac_humming_waves_opus"></option>\n          <option value="ac_into_the_void.opus" data-l10n-id="ac_into_the_void_opus"></option>\n          <option value="ac_lightly.opus" data-l10n-id="ac_lightly_opus"></option>\n          <option value="ac_mobile.opus" data-l10n-id="ac_mobile_opus"></option>\n          <option value="ac_pinger.opus" data-l10n-id="ac_pinger_opus"></option>\n          <option value="ac_skip.opus" data-l10n-id="ac_skip_opus"></option>\n          <option value="ac_tri.opus" data-l10n-id="ac_tri_opus"></option>\n          <option value="ac_universal.opus" data-l10n-id="ac_universal_opus"></option>\n        </select>\n      </li>\n      <li>\n        <label class="pack-switch">\n          <input type="checkbox" id="timer-vibrate" checked class="uninit" />\n          <span data-l10n-id="vibrate">Vibrate:</span>\n       </label>\n      </li>\n    </ul>\n  </div>\n</div>\n<div id="timer-active">\n  <div id="timer-time-display">\n    <div id="timer-time">00:00</div>\n    <menu id="timer-controls">\n      <button id="timer-start" class="edit-button" data-l10n-id="resume">\n        Resume\n      </button>\n      <button id="timer-pause" class="edit-button" data-l10n-id="pause">\n        Pause\n      </button>\n      <button id="timer-cancel" class="danger" data-l10n-id="cancel">\n        Cancel\n      </button>\n    </menu>\n  </div>\n  <div id="timer-plus-time">\n    <button id="timer-plus" data-value="60" data-l10n-id="plusMinute">\n      +1 Min\n    </button>\n  </div>\n</div>\n';});

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

define('panels/timer/main',['require','panel','picker/picker','view','utils','timer','sounds','form_button','text!panels/timer/panel.html','audio_manager'],function(require) {


var Panel = require('panel');
var Picker = require('picker/picker');
var View = require('view');

var Utils = require('utils');
var Timer = require('timer');
var Sounds = require('sounds');
var FormButton = require('form_button');
var html = require('text!panels/timer/panel.html');
var AudioManager = require('audio_manager');

var priv = new WeakMap();

function timeFromPicker(value) {
  var hm, ms;
  hm = value.split(':');
  ms = Utils.dateMath.toMS({
        hours: hm[0],
        minutes: hm[1]
       });
  return ms;
}

/**
 * Timer.Panel
 *
 * Construct a UI panel for the Timer panel.
 *
 * @return {Timer.Panel} Timer.Panel object.
 *
 */
Timer.Panel = function(element) {
  Panel.apply(this, arguments);

  element.innerHTML = html;
  this.timer = null;
  this.nodes = {};

  this.picker = new Picker({
    element: this.element.querySelector('#time-picker'),
    pickers: {
      hours: {
        range: [0, 23],
        valueText: 'nSpinnerHours'
      },
      minutes: {
        range: [0, 59],
        isPadded: true,
        valueText: 'nSpinnerMinutes'
      }
    }
  });

  this.ringtonePlayer = AudioManager.createAudioPlayer();

  // Gather elements
  [
    'create', 'cancel', 'dialog', 'pause', 'start', 'sound', 'time', 'vibrate',
    'plus'
  ].forEach(function(id) {
    this.nodes[id] = this.element.querySelector('#timer-' + id);
  }, this);

  // Bind click events
  [
    'create', 'cancel', 'pause', 'start', 'plus'
  ].forEach(function(action) {
    var element = this.nodes[action];

    if (priv.has(element)) {
      priv.delete(element);
    }

    priv.set(element, {
      action: action,
      panel: this
    });

    element.addEventListener('click', this.onclick.bind(this), false);
  }, this);

  var sound = this.nodes.sound;

  sound.addEventListener('blur', this.pauseAlarm.bind(this), false);
  sound.addEventListener('change', this.previewAlarm.bind(this), false);

  var soundMenuConfig = {
    id: 'timer-sound-menu',
    formatLabel: Sounds.formatLabel
  };
  this.soundButton = new FormButton(sound, soundMenuConfig);
  this.soundButton.refresh();

  element.addEventListener('panel-visibilitychange',
                           this.onvisibilitychange.bind(this));

  // The start button is disable by default (picker at 00:00 by default)
  this.nodes.create.setAttribute('disabled', 'true');
  
  var create = this.nodes.create;
  var picker = this.picker;

  var enableButton = function() {
    if(timeFromPicker(picker.value) === 0) {
      create.setAttribute('disabled', 'true');
    } else {
      create.removeAttribute('disabled');
    }
  };

  // The start button is enable if the value of the timer is not 00:00
  picker.nodes.minutes.addEventListener('transitionend', enableButton);
  picker.nodes.hours.addEventListener('transitionend', enableButton);

  
  Timer.singleton(function(err, timer) {
    this.timer = timer;
    timer.onend = this.dialog.bind(this);
    if (this.visible) {
      // If the timer panel already became visible before we fetched
      // the timer, we must update the display to show the proper
      // timer status.
      this.onvisibilitychange({ detail: { isVisible: true } });
    }
  }.bind(this));
};

Timer.Panel.prototype = Object.create(Panel.prototype);

Timer.Panel.prototype.onvisibilitychange = function(evt) {
  var isVisible = evt.detail.isVisible;
  var nodes = this.nodes;
  var timer = this.timer;

  if (isVisible) {
    // No active timer, or timer has expired...
    //  - Show the new timer dialog
    if (timer === null || timer.state === Timer.INITIAL) {
      this.dialog();
    } else {

      if (timer.state !== Timer.INITIAL) {
        // Active timer exists...

        if (timer.state === Timer.STARTED) {
          // Reviving to started state,
          // show the pause button, hide the start button
          this.toggle(nodes.pause, nodes.start);
        } else if (timer.state === Timer.PAUSED) {
          // Reviving to paused state,
          // show the start button, hide the pause button
          this.toggle(nodes.start, nodes.pause);
        }

        this.dialog({ isVisible: false });
        this.tick();
      }
    }
  } else {
    this.pauseAlarm();
  }
};

/**
 * dialog Show or hide the Timer creation dialog.
 *
 * @param {Object} opts Optional parameters to show/hide dialog.
 *                      - isVisible, true|false (show|hide).
 *                        Defaults to true.
 *
 * @return {Object} Timer.Panel.
 */
Timer.Panel.prototype.dialog = function(opts = { isVisible: true }) {
  if (opts.isVisible) {
    window.cancelAnimationFrame(this.tickTimeout);
  }
  View.instance(this.nodes.dialog).visible = opts.isVisible;
  return this;
};

Timer.Panel.prototype.tick = function() {
  if (!this.timer || this.timer.remaining <= 0) {
    return;
  }
  this.update(this.timer.remaining);
  this.tickTimeout = window.requestAnimationFrame(this.tick.bind(this));
};

/**
 * Given milliseconds, render the time as a rounded-to-seconds
 * countdown.
 */
Timer.Panel.prototype.update = function(remaining = 0) {
  var newText = Utils.format.hms(Math.round(remaining / 1000), 'hh:mm:ss');
  // Use localized caching here to prevent unnecessary DOM repaints.
  if (this._cachedTimerText !== newText) {
    this.nodes.time.textContent = this._cachedTimerText = newText;
  }
  return this;
};

/**
 * toggle Toggle any two UI elements with each other.
 *
 * @param  {Node} show The node to show.
 * @param  {Node} hide The node to hide.
 *
 * @return {Object} Timer.Panel.
 */
Timer.Panel.prototype.toggle = function(show, hide) {
  show.classList.remove('hidden');
  hide.classList.add('hidden');
  return this;
};

/**
 * previewAlarm Plays the currently selected alarm value on a loop.
 */
Timer.Panel.prototype.previewAlarm = function() {
  var ringtoneName = Utils.getSelectedValueByIndex(this.nodes.sound);
  this.ringtonePlayer.playRingtone(ringtoneName);
};

/**
 * pauseAlarm stops the alarm if it is playing
 */
Timer.Panel.prototype.pauseAlarm = function() {
  this.ringtonePlayer.pause();
};

/**
 * handleEvent Handler for all panel bound UI events.
 *             (`this` context object is not Timer.Panel)
 *
 * @param  {Event} event The Event object.
 */
Timer.Panel.prototype.onclick = function(event) {
  var meta = priv.get(event.target);
  var value = event.target.dataset.value;
  var panel = meta.panel;
  var nodes = panel.nodes;
  var time;

  if (panel.timer && panel.timer[meta.action]) {
    if (typeof value !== 'undefined') {
      // meta.action === 'plus' => panel.timer.plus(+value);

      panel.timer[meta.action](+value);
      panel.update(panel.timer.remaining);
    } else {
      // meta.action => panel.timer[meta.action]()
      //
      // ie.
      //
      // if start => panel.timer.start()
      // if pause => panel.timer.pause()
      // if cancel => panel.timer.cancel()
      //
      panel.timer[meta.action]();
    }

    if (meta.action === 'cancel' || meta.action === 'new') {
      // Restore the panel to configured duration
      panel.update(panel.timer.configuredDuration);

      // Show new timer dialog
      panel.dialog();
      window.cancelAnimationFrame(this.tickTimeout);
    }

    if (meta.action === 'start') {
      panel.toggle(nodes.pause, nodes.start);
      panel.tick();
    }

    if (meta.action === 'pause') {
      panel.toggle(nodes.start, nodes.pause);
      window.cancelAnimationFrame(this.tickTimeout);
    }
  } else {

    if (meta.action === 'create') {
      time = timeFromPicker(panel.picker.value);

      if (!time) {
        return;
      } else {
        panel.timer.duration = time;
      }

      panel.timer.sound = nodes.sound.value;
      panel.timer.vibrate = nodes.vibrate.checked;
      panel.timer.start();
      panel.tick();

      // Update the UI
      panel.toggle(nodes.pause, nodes.start);

      // Hide the new timer dialog
      panel.dialog({ isVisible: false });

    }
  }
  panel.timer.commit(function(err, timer) {
    // NOOP: run after register/save
  });
};

return Timer.Panel;
});

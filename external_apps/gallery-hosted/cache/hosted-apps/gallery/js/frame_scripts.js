/* exported GestureDetector */

'use strict';

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

/* exported Format */
'use strict';

/**
 * format.js: simple formatters and string utilities.
 */

var Format = {

  /**
   * Pads a string to the number of characters specified.
   * @param {String} input value to add padding to.
   * @param {Integer} len length to pad to.
   * @param {String} padWith char to pad with (defaults to " ").
   */
  padLeft: function(input, len, padWith) {
    padWith = padWith || ' ';

    var pad = len - (input + '').length;
    while (--pad > -1) {
      input = padWith + input;
    }
    return input;
  }
};

'use strict';
/* global Format */

//
// Create a <video> element and  <div> containing a video player UI and
// add them to the specified container. The UI requires a GestureDetector
// to be running for the container or one of its ancestors.
//
// Some devices have only a single hardware video decoder and can only
// have one video tag playing anywhere at once. So this class is careful
// to only load content into a <video> element when the user really wants
// to play it. At other times it displays a poster image for the video.
// Initially, it displays the poster image. Pressing play starts the video.
// Pausing pauses the video but does not revert to the poster. Finishing the
// video reverts to the initial state with the poster image displayed.
// If we get a visiblitychange event saying that we've been hidden, we
// remember the playback position, pause the video take a temporary
// screenshot and display it, and unload the video. If shown again
// and if the user clicks play again, we resume the video where we left off.
//
// WARNING (bug 1135278):
//
// The VideoPlayer object registers event listeners on the window object
// and never unregisters them. This means that VideoPlayer objects will
// never be garbage collected since the window will always have a reference
// to every one that has been created.
//
// A conscious decision has been made to not fix this issue because:
//
// 1) Currently only gallery and camera use the object and they use a
//    fixed number of objects whose lifetime is the same as that of the
//    app.
// 2) We are moving towards replacing this VideoPlayer object with web
//    components (bug 1117885, bug 1131321)
//
function VideoPlayer(container) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }

  // Add a class to the container so we could find it later and use it as
  // a key in the instance weakmap.
  container.classList.add('video-player-container');
  VideoPlayer.instancesToLocalize.set(container, this);

  function newelt(parent, type, classes, l10n_id, attributes) {
    var e = document.createElement(type);
    if (classes) {
      e.className = classes;
    }
    if (l10n_id) {
      e.dataset.l10nId = l10n_id;
    }
    if (attributes) {
      for (var attribute in attributes) {
        e.setAttribute(attribute, attributes[attribute]);
      }
    }
    parent.appendChild(e);
    return e;
  }

  // This copies the controls structure of the Video app
  var poster = newelt(container, 'img', 'videoPoster');
  var player = newelt(container, 'video', 'videoPlayer');
  var controls = newelt(container, 'div', 'videoPlayerControls');
  var playbutton = newelt(controls, 'button', 'videoPlayerPlayButton',
                          'playbackPlay');
  var footer = newelt(controls, 'div', 'videoPlayerFooter hidden');
  var pausebutton = newelt(footer, 'button', 'videoPlayerPauseButton',
                           'playbackPause');
  var slider = newelt(footer, 'div', 'videoPlayerSlider', null,
                      { 'role': 'slider', 'aria-valuemin': 0 });
  var elapsedText = newelt(slider, 'span', 'videoPlayerElapsedText');
  var progress = newelt(slider, 'div', 'videoPlayerProgress');
  var backgroundBar = newelt(progress, 'div', 'videoPlayerBackgroundBar');
  var elapsedBar = newelt(progress, 'div', 'videoPlayerElapsedBar');
  var playHead = newelt(progress, 'div', 'videoPlayerPlayHead');
  var durationText = newelt(slider, 'span', 'videoPlayerDurationText');
  // expose fullscreen button, so that client can manipulate it directly
  var fullscreenButton = newelt(slider, 'button', 'videoPlayerFullscreenButton',
                                'playbackFullscreen');

  this.poster = poster;
  this.player = player;
  this.controls = controls;
  this.playing = false;

  player.preload = 'metadata';
  player.mozAudioChannelType = 'content';

  var self = this;
  var controlsHidden = false;
  var dragging = false;
  var pausedBeforeDragging = false;
  var endedTimer;
  var videourl;   // the url of the video to play
  var posterurl;  // the url of the poster image to display
  var rotation;   // Do we have to rotate the video? Set by load()
  var videotimestamp;
  var orientation = 0; // current player orientation

  // These are the raw (unrotated) size of the poster image, which
  // must have the same size as the video.
  var videowidth, videoheight;

  var playbackTime;
  var capturedFrame;

  this.load = function(video, posterimage, width, height, rotate, timestamp) {
    this.reset();
    videourl = video;
    posterurl = posterimage;
    rotation = rotate || 0;
    videowidth = width;
    videoheight = height;
    videotimestamp = timestamp;

    // If a locale is present and ready, go ahead and localize now.
    if (navigator.mozL10n.readyState === 'complete') {
      this.localize();
    }

    this.init();
    setPlayerSize();
  };

  this.reset = function() {
    videotimestamp = 0;
    hidePlayer();
    hidePoster();
  };

  this.init = function() {
    playbackTime = 0;
    hidePlayer();
    showPoster();
    this.pause();
  };

  function hidePlayer() {
    player.style.display = 'none';
    player.removeAttribute('src');
    player.load();
    self.playerShowing = false;
  }

  function showPlayer() {
    if (self.onloading) {
      self.onloading();
    }

    player.style.display = 'block';
    player.src = videourl;
    self.playerShowing = true;

    // The only place we call showPlayer() is from the play() function.
    // If play() has to show the player, call it again when we're ready to play.
    player.oncanplay = function() {
      player.oncanplay = null;
      if (playbackTime !== 0) {
        player.currentTime = playbackTime;
      }
      self.play();
    };
  }

  function hidePoster() {
    poster.style.display = 'none';
    poster.removeAttribute('src');
    if (capturedFrame) {
      URL.revokeObjectURL(capturedFrame);
      capturedFrame = null;
    }
  }

  function showPoster() {
    poster.style.display = 'block';
    if (capturedFrame) {
      poster.src = capturedFrame;
    }
    else {
      poster.src = posterurl;
    }
  }

  // Call this when the container size changes
  this.setPlayerSize = setPlayerSize;

  // Call this when phone orientation changes
  this.setPlayerOrientation = setPlayerOrientation;

  this.pause = function pause() {
    // Pause video playback
    if (self.playerShowing) {
      this.playing = false;
      player.pause();
    }

    // Hide the pause button and slider
    footer.classList.add('hidden');
    controlsHidden = true;

    // Show the big central play button
    playbutton.classList.remove('hidden');

    if (this.onpaused) {
      this.onpaused();
    }
  };

  // Set up the playing state
  this.play = function play() {
    if (!this.playerShowing) {
      // If we're displaying the poster image, we have to switch
      // to the player first. When the player is ready it wil call this
      // function again.
      hidePoster();
      showPlayer();
      return;
    }

    // Hide the play button
    playbutton.classList.add('hidden');
    this.playing = true;

    // Start playing the video
    player.play();

    // Show the controls
    footer.classList.remove('hidden');
    controlsHidden = false;

    if (this.onplaying) {
      this.onplaying();
    }
  };

  fullscreenButton.addEventListener('tap', function(e) {
    if (self.onfullscreentap) {
      // If the event propagate to controller, videoplayer will hide
      // the toolbar, so we stopPropagation here.
      e.stopPropagation();
      self.onfullscreentap();
    }
  });

  // Hook up the play button
  playbutton.addEventListener('tap', function(e) {
    // If we're not showing the player or are paused, go to the play state
    if (!self.playerShowing || player.paused) {
      self.play();
    }
    e.stopPropagation();
  });

  // Hook up the pause button
  pausebutton.addEventListener('tap', function(e) {
    self.pause();
    e.stopPropagation();
  });

  // A click anywhere else on the screen should toggle the footer
  // But only when the video is playing.
  controls.addEventListener('tap', function(e) {
    if (e.target === controls && !player.paused) {
      footer.classList.toggle('hidden');
      controlsHidden = !controlsHidden;
    }
  });

  // Set the video duration when we get metadata
  player.onloadedmetadata = function() {
    var formattedTime = formatTime(player.duration);
    durationText.textContent = formattedTime;
    slider.setAttribute('aria-valuemax', player.duration);
    // This sets the aria-label to a localized slider description
    navigator.mozL10n.setAttributes(slider, 'playbackSeekBar',
                                    {'duration': formattedTime});
    // start off in the paused state
    self.pause();
  };

  // Also resize the player on a resize event
  // (when the user rotates the phone)
  window.addEventListener('resize', function() {
    setPlayerSize();
  });

  // If we reach the end of a video, reset to beginning
  // This isn't always reliable, so we also set a timer in updateTime()
  player.onended = ended;

  function ended() {
    if (dragging) {
      return;
    }
    if (endedTimer) {
      clearTimeout(endedTimer);
      endedTimer = null;
    }
    self.pause();
    self.init();
  }

  // Update the slider and elapsed time as the video plays
  player.ontimeupdate = updateTime;

  // Set the elapsed time and slider position
  function updateTime() {
    if (!controlsHidden) {
      var formattedTime = formatTime(player.currentTime);
      elapsedText.textContent = formattedTime;
      slider.setAttribute('aria-valuenow', player.currentTime);
      slider.setAttribute('aria-valuetext', formattedTime);

      // We can't update a progress bar if we don't know how long
      // the video is. It is kind of a bug that the <video> element
      // can't figure this out for ogv videos.
      if (player.duration === Infinity || player.duration === 0) {
        return;
      }

      var percent = (player.currentTime / player.duration) * 100 + '%';
      var startEdge =
        navigator.mozL10n.language.direction === 'ltr' ? 'left' : 'right';
      elapsedBar.style.width = percent;
      playHead.style[startEdge] = percent;
    }

    // Since we don't always get reliable 'ended' events, see if
    // we've reached the end this way.
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=783512
    // If we're within 1 second of the end of the video, register
    // a timeout a half a second after we'd expect an ended event.
    if (!endedTimer) {
      if (!dragging && player.currentTime >= player.duration - 1) {
        var timeUntilEnd = (player.duration - player.currentTime + 0.5);
        endedTimer = setTimeout(ended, timeUntilEnd * 1000);
      }
    }
    else if (dragging && player.currentTime < player.duration - 1) {
      // If there is a timer set and we drag away from the end, cancel the timer
      clearTimeout(endedTimer);
      endedTimer = null;
    }
  }

  // Pause and unload the video if we're hidden so that other apps
  // can use the video decoder hardware.
  window.addEventListener('visibilitychange', visibilityChanged);

  function visibilityChanged() {
    if (document.hidden) {
      // If we're just showing the poster image when we're hidden
      // then we don't have to do anything special
      if (!self.playerShowing) {
        return;
      }

      self.pause();

      // If we're not at the beginning of the video, capture a
      // temporary poster image to display when we come back
      if (player.currentTime !== 0) {
        playbackTime = player.currentTime;
        captureCurrentFrame(function(blob) {
          capturedFrame = URL.createObjectURL(blob);
          hidePlayer();
          showPoster();
        });
      }
      else {
        // Even if we don't capture a frame, hide the video
        hidePlayer();
        showPoster();
      }
    }
  }

  function captureCurrentFrame(callback) {
    var canvas = document.createElement('canvas');
    canvas.width = videowidth;
    canvas.height = videoheight;
    var context = canvas.getContext('2d');
    context.drawImage(player, 0, 0);
    canvas.toBlob(callback);
  }

  // Make the video fit the container
  function setPlayerSize() {
    var containerWidth = container.clientWidth;
    var containerHeight = container.clientHeight;

    // Don't do anything if we don't know our size.
    // This could happen if we get a resize event before our metadata loads
    if (!videowidth || !videoheight) {
      return;
    }

    var width, height; // The size the video will appear, after rotation
    switch (rotation) {
    case 0:
    case 180:
      width = videowidth;
      height = videoheight;
      break;
    case 90:
    case 270:
      width = videoheight;
      height = videowidth;
    }

    var xscale = containerWidth / width;
    var yscale = containerHeight / height;
    var scale = Math.min(xscale, yscale);

    // Scale large videos down, and scale small videos up.
    // This might reduce image quality for small videos.
    width *= scale;
    height *= scale;

    var left = ((containerWidth - width) / 2);
    var top = ((containerHeight - height) / 2);

    var transform;
    switch (rotation) {
    case 0:
      transform = 'translate(' + left + 'px,' + top + 'px)';
      break;
    case 90:
      transform =
        'translate(' + (left + width) + 'px,' + top + 'px) ' +
        'rotate(90deg)';
      break;
    case 180:
      transform =
        'translate(' + (left + width) + 'px,' + (top + height) + 'px) ' +
        'rotate(180deg)';
      break;
    case 270:
      transform =
        'translate(' + left + 'px,' + (top + height) + 'px) ' +
        'rotate(270deg)';
      break;
    }

    transform += ' scale(' + scale + ')';

    poster.style.transform = transform;
    player.style.transform = transform;
  }

  // Update current player orientation
  function setPlayerOrientation(newOrientation) {
    orientation = newOrientation;
  }

  // Compute position based on player orientation
  function computePosition(panPosition, rect) {
    var position;
    switch (orientation) {
      case 0:
        position = (panPosition.clientX - rect.left) / rect.width;
        break;
      case 90:
        position = (rect.bottom - panPosition.clientY) / rect.height;
        break;
      case 180:
        position = (rect.right - panPosition.clientX) / rect.width;
        break;
      case 270:
        position = (panPosition.clientY - rect.top) / rect.height;
        break;
    }
    return position;
  }

  // handle drags on the time slider
  slider.addEventListener('pan', function pan(e) {
    e.stopPropagation();
    // We can't do anything if we don't know our duration
    if (player.duration === Infinity) {
      return;
    }

    if (!dragging) {  // Do this stuff on the first pan event only
      dragging = true;
      pausedBeforeDragging = player.paused;
      if (!pausedBeforeDragging) {
        player.pause();
      }
    }

    var rect = backgroundBar.getBoundingClientRect();
    var position = computePosition(e.detail.position, rect);
    var pos = Math.min(Math.max(position, 0), 1);
    // Handle pos so that slider moves correct way
    // when user drags it for RTL locales
    if (navigator.mozL10n.language.direction === 'rtl') {
      pos = 1 - pos;
    }
    player.currentTime = player.duration * pos;
    updateTime();
  });

  slider.addEventListener('swipe', function swipe(e) {
    e.stopPropagation();
    dragging = false;
    if (player.currentTime >= player.duration) {
      self.pause();
    } else if (!pausedBeforeDragging) {
      player.play();
    }
  });

  slider.addEventListener('keypress', function(e) {
    // The standard accessible control for sliders is arrow up/down keys.
    // Our screenreader synthesizes those events on swipe up/down gestures.
    // Currently, we only allow screen reader users to adjust sliders with a
    // constant step size (there is no page up/down equivalent). In the case
    // of videos, we make sure that the maximum amount of steps for the entire
    // duration is 20, or 2 second increments if the duration is less then 40
    // seconds.
    var step = Math.max(player.duration/20, 2);
    if (e.keyCode == e.DOM_VK_DOWN) {
      player.currentTime -= step;
    } else if (e.keyCode == e.DOM_VK_UP) {
      player.currentTime += step;
    }
  });

  function formatTime(time) {
    time = Math.round(time);
    var minutes = Math.floor(time / 60);
    var seconds = time % 60;
    if (minutes < 60) {
      return Format.padLeft(minutes, 2, '0') + ':' +
        Format.padLeft(seconds, 2, '0');
    } else {
      var hours = Math.floor(minutes / 60);
      minutes = Math.round(minutes % 60);
      return hours + ':' + Format.padLeft(minutes, 2, '0') + ':' +
        Format.padLeft(seconds, 2, '0');
    }
    return '';
  }

  // pause the video player if user unplugs headphone
  var acm = navigator.mozAudioChannelManager;
  if (acm) {
    acm.addEventListener('headphoneschange', function onheadphoneschange() {
      if (!acm.headphones && self.playing) {
        self.pause();
      }
    });
  }

  this.localize = function() {
    // XXX: Ideally, we would add the duration too, but that is not
    // available via fileinfo metadata yet.
    var label;
    var portrait = videowidth < videoheight;
    if (rotation == 90 || rotation == 270) {
      // If rotated sideways, then width and height are swapped.
      portrait = !portrait;
    }

    var orientation = navigator.mozL10n.get(
      portrait ? 'orientationPortrait' : 'orientationLandscape');
    if (videotimestamp) {
      var locale_entry = navigator.mozL10n.get(
        'videoDescription', { orientation: orientation });
      if (!self.dtf) {
        self.dtf = new navigator.mozL10n.DateTimeFormat();
      }
      label = self.dtf.localeFormat(videotimestamp, locale_entry);
    } else {
      label = navigator.mozL10n.get(
        'videoDescriptionNoTimestamp', { orientation: orientation });
    }
    poster.setAttribute('aria-label', label);
  };
}

VideoPlayer.prototype.hide = function() {
  // Call reset() to hide the poster and player
  this.controls.style.display = 'none';
};

VideoPlayer.prototype.show = function() {
  // Call init() to show the poster
  this.controls.style.display = 'block';
};

VideoPlayer.instancesToLocalize = new WeakMap();

navigator.mozL10n.ready(function() {
  // Retrieve VideoPlayer instances by searching for container nodes.
  for (var container of document.querySelectorAll('.video-player-container')) {
    var instance = VideoPlayer.instancesToLocalize.get(container);
    if (instance) {
      instance.localize();
    }
  }
});

'use strict';
/* global Downsample, VideoPlayer */
/*
 * media_frame.js:
 *
 * A MediaFrame displays a photo or a video. The gallery app uses
 * three side by side to support smooth panning from one item to the
 * next.  The Camera app uses one for image and video preview. The
 * Gallery app's open activity uses one of these to display the opened
 * item.
 *
 * MediaFrames have different behavior depending on whether they display
 * images or videos. Photo frames allow the user to zoom and pan on the photo.
 * Video frames allow the user to play and pause but don't allow zooming.
 *
 * When a frame is displaying a video, it handles mouse events.
 * When displaying a picture, however, it expects the client to handle events
 * and call the pan() and zoom() methods.
 *
 * The pan() method is a little unusual. It "uses" as much of the pan
 * event as it can, and returns a number indicating how much of the
 * horizontal motion it did not use. The gallery uses this returned
 * value for transitioning between frames.  If a frame displays a
 * photo that is not zoomed in at all, then it can't use any of the
 * pan, and returns the full amount which the gallery app turns into a
 * panning motion between frames.  But if the photo is zoomed in, then
 * the MediaFrame will just move the photo within itself, if it can, and
 * return 0.
 *
 * MediaFrame uses the #-moz-samplesize media fragment (via the downsample.js
 * module) to downsample large jpeg images while decoding them when necessary.
 * You can specify a maximum image decode size (in megapixels) when invoking
 * the constructor. The MediaFrame code also includes a runtime check for
 * the amount of RAM available on the device, and may limit the image decode
 * size on low-memory devices.
 *
 * MediaFrame uses the CSS background-image property to display images. This
 * means that the images are decoded even if the MediaFrame is offscreen and
 * the image is not visible. So if you create a lot of these and display big
 * images in them, you will use a lot of memory. Be careful!
 */
function MediaFrame(container, includeVideo, maxImageSize) {
  this.clear(); // Set all the properties we'll use to default values

  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  this.container = container;
  this.maximumImageSize = maxImageSize || 0;
  if (includeVideo !== false) {
    this.video = new VideoPlayer(container);
    this.video.hide();
  }

  // Add a class to the container so we could find it later and use it as
  // a key in the instance weakmap.
  container.classList.add('media-frame');
  MediaFrame.instancesToLocalize.set(container, this);
}

// WeakMap with the container nodes as keys and MediaFrame instances as values.
MediaFrame.instancesToLocalize = new WeakMap();

navigator.mozL10n.ready(function() {
  // Retrieve MediaFrame instances by searching for container nodes.
  for (var container of document.querySelectorAll('.media-frame')) {
    var instance = MediaFrame.instancesToLocalize.get(container);
    if (instance) {
      instance.localize();
    }
  }
});

MediaFrame.computeMaxImageDecodeSize = function(mem) {
  if (!mem) {
    return 0;
  }
  else if (mem < 256) {  // This is a Tarako-class device ultra low-end device.
    return 2 * 1024 * 1024;   // 2 megapixels
  }
  else if (mem < 512) {  // This is a low-end 256mb device
    // Normally we can handle 3mp images on devices like this, but if
    // this device has a big screen and low memory (like a memory
    // throttled Flame) then it needs something smaller than 3mp.
    var screensize = screen.width * window.devicePixelRatio *
      screen.height * window.devicePixelRatio;
    if (mem < 325 && screensize > 480 * 800) {
      return 2.5 * 1024 * 1024;  // 2.5mp megapixels for throttled Flame
    }

    return 3 * 1024 * 1024;      // 3 megapixels otherwise
  }
  else if (mem < 1024) { // A mid-range 512mb device
    return 5 * 1024 * 1024;   // 5 megapixels
  }
  else {                 // A high-end device with 1 gigabyte or more of memory
    // Allow 8 megapixels of image decode size per gigabyte of memory
    return (mem / 1024) * 8 * 1024 * 1024;
  }
};

//
// Find out how much memory this device has because we may need to limit image
// decode size on low-end devices.  Note that navigator.getFeature requires
// the "feature-detection" permission (at least for now) so we only run this
// code if the client app has that permission.
//
if (navigator.getFeature) {
  MediaFrame.pendingPromise = navigator.getFeature('hardware.memory');
  MediaFrame.pendingPromise.then(
    function resolve(mem) {
      delete MediaFrame.pendingPromise;
      MediaFrame.maxImageDecodeSize = MediaFrame.computeMaxImageDecodeSize(mem);
    },
    function reject(err) {
      // This should never happen!
      delete MediaFrame.pendingPromise;
      MediaFrame.maxImageDecodeSize = 0;
    }
  );
}

MediaFrame.prototype.displayImage = function displayImage(blob,
                                                          width,
                                                          height,
                                                          preview,
                                                          rotation,
                                                          mirrored)
{
  var self = this;

  // If we are still querying the device memory, wait for that query to
  // complete and then try again.
  if (MediaFrame.pendingPromise) {
    MediaFrame.pendingPromise.then(function resolve() {
      self.displayImage(blob, width, height, preview, rotation, mirrored);
    });
    return;
  }

  this.clear();  // Reset everything

  // Remember what we're displaying. This doesn't really need to be public
  // but the Gallery app uses it.
  this.imageblob = blob;

  // Create an element to display the image (using CSS background-image)
  this.image = document.createElement('div');
  this.container.appendChild(this.image);
  this.image.className = 'image-view';
  this.image.style.transformOrigin = 'center center';
  this.image.style.backgroundImage = 'none';
  this.image.style.backgroundSize = 'contain';
  this.image.style.backgroundRepeat = 'no-repeat';
  // It would be nice if users of this module could override this
  // background color.
  this.image.style.backgroundColor = '#222';
  this.image.setAttribute('role', 'img');

  // Figure out if we are going to downsample the image before displaying it
  // We expose fullSampleSize as part of the public api only for testing.
  this.fullSampleSize = computeFullSampleSize(blob, width, height);
  this.fullsizeWidth = this.fullSampleSize.scale(width);
  this.fullsizeHeight = this.fullSampleSize.scale(height);

  // Create a blob URL for it, combine it with the media fragment for
  // downsampling, and put it in CSS background-image format.
  this.imageurl = URL.createObjectURL(blob);
  this.fullBackgroundImage = 'url(' + this.imageurl + this.fullSampleSize + ')';

  // Note: There is a default value for orientation/mirrored since some
  // images don't have EXIF data to retrieve this information.
  this.rotation = rotation || 0;
  this.mirrored = mirrored || false;

  // Keep track of what kind of content we have
  this.displayingImage = true;

  // If a locale is present and ready, go ahead and localize now.
  // Otherwise, localization will be handled by the ready() callback above.
  if (navigator.mozL10n.readyState === 'complete') {
    this.localize();
  }

  // Determine whether we can use the preview image
  function usePreview(preview) {
    // If no preview at all, we can't use it.
    if (!preview) {
      return false;
    }

    // If we don't know the preview size, we can't use it.
    if (!preview.width || !preview.height) {
      return false;
    }

    // If there isn't a preview offset or file, we can't use it
    if (!preview.start && !preview.filename) {
      return false;
    }

    // If the aspect ratio does not match, we can't use it
    if (Math.abs(width / height - preview.width / preview.height) > 0.01) {
      return false;
    }

    // If setMinimumPreviewSize has been called, then a preview is big
    // enough if it is at least that big.
    if (self.minimumPreviewWidth && self.minimumPreviewHeight) {
      return Math.max(preview.width, preview.height) >=
        Math.max(self.minimumPreviewWidth, self.minimumPreviewHeight) &&
        Math.min(preview.width, preview.height) >=
        Math.min(self.minimumPreviewWidth, self.minimumPreviewHeight);
    }

    // Otherwise a preview is big enough if at least one dimension is >= the
    // screen size in both portrait and landscape mode.
    var screenWidth = window.innerWidth * window.devicePixelRatio;
    var screenHeight = window.innerHeight * window.devicePixelRatio;

    return ((preview.width >= screenWidth ||
             preview.height >= screenHeight) && // portrait
            (preview.width >= screenHeight ||
             preview.height >= screenWidth));  // landscape
  }

  // To save memory, we want to avoid displaying the image at full size
  // whenever we can display a smaller preview of it. In general, we only
  // want to decode the full-size image if the user zooms in on it.
  // This code determines whether we have a usable preview image (or whether
  // we can downsample the full-size image) and if so, displays that image
  if (usePreview(preview)) {
    if (preview.start) {
      gotPreview(blob.slice(preview.start, preview.end, 'image/jpeg'),
                 preview.width, preview.height);
    }
    else {
      var storage = navigator.getDeviceStorage('pictures');
      var getreq = storage.get(preview.filename);
      getreq.onsuccess = function() {
        gotPreview(getreq.result, preview.width, preview.height);
      };
      getreq.onerror = function() {
        noPreview();
      };
    }
  }
  else {
    noPreview();
  }

  // If we've got a usable preview blob from EXIF or an external file,
  // this is what we do with it.
  function gotPreview(previewblob, previewWidth, previewHeight) {
    // Create a blob URL for the preview
    self.previewurl = URL.createObjectURL(previewblob);
    // And put it in CSS background-image syntax
    self.previewBackgroundImage = 'url(' + self.previewurl + ')';
    // Remember the preview size
    self.previewWidth = previewWidth;
    self.previewHeight = previewHeight;
    // Update the CSS background image spec for the full image to use
    // both images so that the transition from the preview to the full
    // image is smooth.
    self.fullBackgroundImage += ', ' + self.previewBackgroundImage;

    // Start off with the preview image displayed
    self.displayingPreview = true;
    self._displayImage(self.previewBackgroundImage,
                       self.previewWidth, self.previewHeight);
  }

  // If we don't have a preview image we can use this is what we do.
  function noPreview() {
    self.previewurl = null;
    // Figure out whether we can downsample the fullsize image for
    // use as a preview
    var previewSampleSize = computePreviewSampleSize(blob, width, height);

    // If we can create a preview by downsampling...
    if (previewSampleSize !== Downsample.NONE) {
      // Combine the full image url with the downsample media fragment
      // to create a background image spec for the downsampled preview.
      self.previewBackgroundImage =
        'url(' + self.imageurl + previewSampleSize + ')';
      // Compute the preview size based on the downsample amount.
      self.previewWidth = previewSampleSize.scale(width);
      self.previewHeight = previewSampleSize.scale(height);

      // Update the full-size CSS background image spec to include this preview
      self.fullBackgroundImage += ', ' + self.previewBackgroundImage;

      // Now start off with the downsampled image displayed
      self.displayingPreview = true;
      self._displayImage(self.previewBackgroundImage,
                         self.previewWidth, self.previewHeight);
    }
    else {
      // If we can't (or don't need to) downsample the full image then note
      // that we don't have a preview and display the image at full size.
      self.previewBackgroundImage = null;
      self.displayingPreview = false;
      self._displayImage(self.fullBackgroundImage,
                         self.fullsizeWidth, self.fullsizeHeight);
    }
  }

  // If the blob is a JPEG then we can use #-moz-samplesize to downsample
  // it while decoding. If this is a particularly large image then to avoid
  // OOMs, we may not want to allow it to ever be decoded at full size
  function computeFullSampleSize(blob, width, height) {
    if (blob.type !== 'image/jpeg') {
      // We're not using #-moz-samplesize at all
      return Downsample.NONE;
    }

    // Determine the maximum size we will decode the image at, based on
    // device memory and the maximum size passed to the constructor.
    var max = MediaFrame.maxImageDecodeSize || 0;
    if (self.maximumImageSize && (max === 0 || self.maximumImageSize < max)) {
      max = self.maximumImageSize;
    }

    if (!max || width * height <= max) {
      return Downsample.NONE;
    }

    return Downsample.areaAtLeast(max / (width * height));
  }

  function computePreviewSampleSize(blob, width, height) {
    // If the image is not a JPEG we can't use a samplesize
    if (blob.type !== 'image/jpeg') {
      return Downsample.NONE;
    }

    //
    // Determine how much we can scale the image down and still have it
    // big enough to fill the screen in at least one dimension.
    //
    // For example, suppose we have a 1600x1200 photo and a 320x480 screen
    //
    //  portraitScale = Math.min(.2, .4) = 0.2
    //  landscapeScale = Math.min(.3, .266) = 0.266
    //  scale = 0.266
    //
    var screenWidth = window.innerWidth * window.devicePixelRatio;
    var screenHeight = window.innerHeight * window.devicePixelRatio;

    // To display the image in portrait orientation, this is how much we
    // have to scale it down to ensure that both dimensions fit
    var portraitScale = Math.min(screenWidth / width, screenHeight / height);

    // To display the image in landscape, this is we need to scale it
    // this much
    var landscapeScale = Math.min(screenHeight / width, screenWidth / height);

    // We need an image that is big enough in either orientation
    var scale = Math.max(portraitScale, landscapeScale);

    // Return the largest samplesize that still produces a big enough preview
    return Downsample.sizeNoMoreThan(scale);
  }
};

// An internal method to set the background image and size styles of
// the image div and to reposition the image appropriately. We use this when
// first displaying an image and when switching from the preview image to the
// full image and back. Note that the backgroundImage argument must be a
// string suitable for use in a CSS background-image property. When switching
// from the preview image to the full image, we actually use a string with
// two urls in it so that the full image replaces the preview image when it
// is loaded.
MediaFrame.prototype._displayImage = function(backgroundImage, width, height) {
  // The background image should be a string in CSS format.
  this.image.style.backgroundImage = backgroundImage;
  this.image.style.width = width + 'px';
  this.image.style.height = height + 'px';

  // Remember the width and height, but swap them for rotated images.
  if (this.rotation === 0 || this.rotation === 180) {
    this.itemWidth = width;
    this.itemHeight = height;
  } else {
    this.itemWidth = height;
    this.itemHeight = width;
  }

  // The image div has a new size, so we have to change its transform
  this.computeFit();
  this.setPosition();

  // Query the position of the image in order to flush the changes
  // made by setPosition() above. This prevents us from accidentally
  // animating those changes when the user double taps to zoom.
  var temp = this.image.clientLeft; // jshint ignore:line
};

// This function adds a label for accessibility to the image frame.
// Videos are localized within the video player, so this is only for images.
MediaFrame.prototype.localize = function localize() {
  if (!this.displayingImage) {
    return;
  }

  var portrait = this.fullsizeWidth < this.fullsizeHeight;
  if (this.rotation == 90 || this.rotation == 270) {
    // If rotated sideways, the width and height are swapped.
    portrait = !portrait;
  }

  var timestamp = this.imageblob.lastModifiedDate;
  var orientation = navigator.mozL10n.get(
    portrait ? 'orientationPortrait' : 'orientationLandscape');
  var label = '';

  if (timestamp) {
    var locale_entry = navigator.mozL10n.get(
      'imageDescription', { orientation: orientation });

    if (!this.dtf) {
      this.dtf = new navigator.mozL10n.DateTimeFormat();
    }

    label = this.dtf.localeFormat(new Date(timestamp), locale_entry);
  } else {
    label = navigator.mozL10n.get(
      'imageDescriptionNoTimestamp', { orientation: orientation });
  }

  this.image.setAttribute('aria-label', label);
};

MediaFrame.prototype._switchToFullSizeImage = function _switchToFull() {
  if (!this.displayingImage || !this.displayingPreview) {
    return;
  }
  this.displayingPreview = false;
  this._displayImage(this.fullBackgroundImage,
                     this.fullsizeWidth, this.fullsizeHeight);
};

MediaFrame.prototype._switchToPreviewImage = function _switchToPreview() {
  // If we're not displaying an image or already displaying preview
  // or don't have a preview to display then there is nothing to do.
  if (!this.displayingImage || this.displayingPreview ||
      !this.previewBackgroundImage) {
    return;
  }

  this.displayingPreview = true;
  this._displayImage(this.previewBackgroundImage,
                     this.previewWidth, this.previewHeight);
};

MediaFrame.prototype.displayVideo = function displayVideo(videoblob, posterblob,
                                                          width, height,
                                                          rotation)
{
  if (!this.video) {
    return;
  }

  this.clear();  // reset everything

  // Keep track of what kind of content we have
  this.displayingVideo = true;

  // Remember the blobs
  this.videoblob = videoblob;
  this.posterblob = posterblob;

  // Get new URLs for the blobs
  this.videourl = URL.createObjectURL(videoblob);
  this.posterurl = URL.createObjectURL(posterblob);

  // Display them in the video element.
  // The VideoPlayer class takes care of positioning itself, so we
  // don't have to do anything here with computeFit() or setPosition()
  this.video.load(this.videourl, this.posterurl, width, height, rotation || 0,
                  videoblob.lastModifiedDate);

  // Show the player controls
  this.video.show();
};

// Reset the frame state, release any urls and and hide everything
MediaFrame.prototype.clear = function clear() {
  // Reset the saved state
  this.displayingImage = false;
  this.displayingPreview = false;
  this.displayingVideo = false;
  this.itemWidth = this.itemHeight = null;
  this.imageblob = null;
  this.videoblob = null;
  this.posterblob = null;
  this.fullSampleSize = null;
  this.fullBackgroundImage = null;
  this.previewBackgroundImage = null;
  this.fullsizeWidth = this.fullsizeHeight = null;
  this.previewWidth = this.previewHeight = null;
  this.fit = null;

  if (this.imageurl) {
    URL.revokeObjectURL(this.imageurl);
  }
  this.imageurl = null;

  if (this.previewurl) {
    URL.revokeObjectURL(this.previewurl);
  }
  this.previewurl = null;

  if (this.image) {
    this.container.removeChild(this.image);
    this.image.style.backgroundImage = 'none';
  }
  this.image = null;

  // Hide the video player
  if (this.video) {
    this.video.reset();
    this.video.hide();
    if (this.videourl) {
      URL.revokeObjectURL(this.videourl);
    }
    this.videourl = null;
    if (this.posterurl) {
      URL.revokeObjectURL(this.posterurl);
    }
    this.posterurl = null;
  }
};

// Set the item's position based on this.fit
// The VideoPlayer object fits itself to its container, and it
// can't be zoomed or panned, so we only need to do this for images
MediaFrame.prototype.setPosition = function setPosition() {
  if (!this.fit || !this.displayingImage) {
    return;
  }

  var dx = this.fit.left, dy = this.fit.top;

  // We have to adjust the translation to account for the fact that the
  // scaling is being done around the middle of the image, rather than the
  // upper-left corner.  And we have to make this adjustment differently
  // for different rotations.
  switch (this.rotation) {
  case 0:
  case 180:
    dx += (this.fit.width - this.itemWidth) / 2;
    dy += (this.fit.height - this.itemHeight) / 2;
    break;
  case 90:
  case 270:
    dx += (this.fit.width - this.itemHeight) / 2;
    dy += (this.fit.height - this.itemWidth) / 2;
    break;
  }

  var sx = this.mirrored ? -this.fit.scale : this.fit.scale;
  var sy = this.fit.scale;

  var transform =
    'translate(' + dx + 'px, ' + dy + 'px) ' +
    'scale(' + sx + ',' + sy + ')' +
    'rotate(' + this.rotation + 'deg) ';

  this.image.style.transform = transform;
};

MediaFrame.prototype.computeFit = function computeFit() {
  if (!this.displayingImage) {
    return;
  }
  this.viewportWidth = this.container.offsetWidth;
  this.viewportHeight = this.container.offsetHeight;

  var scalex = this.viewportWidth / this.itemWidth;
  var scaley = this.viewportHeight / this.itemHeight;
  var scale = Math.min(Math.min(scalex, scaley), 1);

  // Set the image size and position
  var width = Math.floor(this.itemWidth * scale);
  var height = Math.floor(this.itemHeight * scale);

  this.fit = {
    width: width,
    height: height,
    left: Math.floor((this.viewportWidth - width) / 2),
    top: Math.floor((this.viewportHeight - height) / 2),
    scale: scale,
    baseScale: scale
  };
};

MediaFrame.prototype.reset = function reset() {
  // If we're not displaying the preview image, but we have one,
  // and it is the right size, then switch to it
  if (this.displayingImage && !this.displayingPreview &&
      this.previewBackgroundImage) {
    this._switchToPreviewImage(); // resets image size and position
    return;
  }

  // Otherwise, just resize and position the item we're already displaying
  this.computeFit();
  this.setPosition();
  // If frame is resized, the video's size also need to reset.
  if (this.displayingVideo) {
    this.video.setPlayerSize();
  }
};

// We call this from the resize handler when the user rotates the
// screen or when going into or out of fullscreen mode. If the user
// has not zoomed in, then we just fit the image to the new size (same
// as reset).  But if the user has zoomed in (and we need to stay
// zoomed for the new size) then we adjust the fit properties so that
// the pixel that was at the center of the screen before remains at
// the center now, or as close as possible
MediaFrame.prototype.resize = function resize() {
  var oldWidth = this.viewportWidth;
  var oldHeight = this.viewportHeight;
  var newWidth = this.container.offsetWidth;
  var newHeight = this.container.offsetHeight;

  var oldfit = this.fit; // The current image fit

  // If this is triggered by a resize event before the frame has computed
  // its size, then there is nothing we can do yet.
  if (!oldfit) {
    return;
  }

  // Compute the new fit.
  // This updates the the viewportWidth, viewportHeight and fit properties
  this.computeFit();

  // This is how the image would fit at the new screen size
  var newfit = this.fit;

  // If no zooming has been done (or almost no zooming), then a resize is just
  // a reset. The same is true if the new fit base scale is greater than the
  // old scale.
  // The scale is calculated with division, the value may not be accurate
  // because of IEEE 754. We use abs difference to do the equality checking.
  if (Math.abs(oldfit.scale - oldfit.baseScale) < 0.01 ||
      newfit.baseScale > oldfit.scale) {

    this.reset();
    return;
  }

  // Otherwise, just adjust the old fit as needed and use that so we
  // retain the zoom factor.
  oldfit.left += (newWidth - oldWidth) / 2;
  oldfit.top += (newHeight - oldHeight) / 2;
  oldfit.baseScale = newfit.baseScale;
  this.fit = oldfit;

  // Reposition this image without resetting the zoom
  this.setPosition();
};

// Zoom in by the specified factor, adjusting the pan amount so that
// the image pixels at (fixedX, fixedY) remain at that position.
// Assume that zoom gestures can't be done in the middle of swipes, so
// if we're calling zoom, then the swipe property will be 0.
// If time is specified and non-zero, then we set a CSS transition
// to animate the zoom.
MediaFrame.prototype.zoom = function zoom(scale, fixedX, fixedY, time) {
  // Ignore zooms if we're not displaying an image
  if (!this.displayingImage) {
    return;
  }

  // If we were displaying the preview switch to the full-size image.
  if (this.displayingPreview) {
    this._switchToFullSizeImage();
  }

  // Never zoom in farther than the native resolution of the image
  if (this.fit.scale * scale > 1) {
    scale = 1 / (this.fit.scale);
  }
  // And never zoom out to make the image smaller than it would normally be
  else if (this.fit.scale * scale < this.fit.baseScale) {
    scale = this.fit.baseScale / this.fit.scale;
  }

  this.fit.scale = this.fit.scale * scale;

  // Change the size of the photo
  this.fit.width = Math.floor(this.itemWidth * this.fit.scale);
  this.fit.height = Math.floor(this.itemHeight * this.fit.scale);

  // fixedX and fixedY are in viewport coordinates.
  // These are the photo coordinates displayed at that point in the viewport
  var photoX = fixedX - this.fit.left;
  var photoY = fixedY - this.fit.top;

  // After zooming, these are the new photo coordinates.
  // Note we just use the relative scale amount here, not this.fit.scale
  photoX = Math.floor(photoX * scale);
  photoY = Math.floor(photoY * scale);

  // To keep that point still, here are the new left and top values we need
  this.fit.left = fixedX - photoX;
  this.fit.top = fixedY - photoY;

  // Now make sure we didn't pan too much: If the image fits on the
  // screen, fixed it. If the image is bigger than the screen, then
  // make sure we haven't gone past any edges
  if (this.fit.width <= this.viewportWidth) {
    this.fit.left = (this.viewportWidth - this.fit.width) / 2;
  }
  else {
    // Don't let the left of the photo be past the left edge of the screen
    if (this.fit.left > 0) {
      this.fit.left = 0;
    }

    // Right of photo shouldn't be to the left of the right edge
    if (this.fit.left + this.fit.width < this.viewportWidth) {
      this.fit.left = this.viewportWidth - this.fit.width;
    }
  }

  if (this.fit.height <= this.viewportHeight) {
    this.fit.top = (this.viewportHeight - this.fit.height) / 2;
  }
  else {
    // Don't let the top of the photo be below the top of the screen
    if (this.fit.top > 0) {
      this.fit.top = 0;
    }

    // bottom of photo shouldn't be above the bottom of screen
    if (this.fit.top + this.fit.height < this.viewportHeight) {
      this.fit.top = this.viewportHeight - this.fit.height;
    }
  }

  // If a time was specified, set up a transition so that the
  // call to setPosition() below is animated
  if (time) {
    // If a time was specfied, animate the transformation
    var transition = 'transform ' + time + 'ms ease';
    this.image.style.transition = transition;

    var self = this;
    this.image.addEventListener('transitionend', function done() {
      self.image.removeEventListener('transitionend', done);
      self.image.style.transition = null;
    });
  }

  this.setPosition();
};

// If the item being displayed is larger than the continer, pan it by
// the specified amounts.  Return the "unused" dx amount for the gallery app
// to use for sideways swiping
MediaFrame.prototype.pan = function(dx, dy) {
  // We can only pan images, so return the entire dx amount
  if (!this.displayingImage) {
    return dx;
  }

  // Handle panning in the y direction first, since it is easier.
  // Don't pan in the y direction if we already fit on the screen
  if (this.fit.height > this.viewportHeight) {
    this.fit.top += dy;

    // Don't let the top of the photo be below the top of the screen
    if (this.fit.top > 0) {
      this.fit.top = 0;
    }

    // bottom of photo shouldn't be above the bottom of screen
    if (this.fit.top + this.fit.height < this.viewportHeight) {
      this.fit.top = this.viewportHeight - this.fit.height;
    }
  }

  // Now handle the X dimension. If we've already panned as far as we can
  // within the image (or if it isn't zoomed in) then return the "extra"
  // unused dx amount to the caller so that the caller can use them to
  // shift the frame left or right.
  var extra = 0;

  if (this.fit.width <= this.viewportWidth) {
    // In this case, the photo isn't zoomed in, so it is all extra
    extra = dx;
  }
  else {
    this.fit.left += dx;

    // If this would take the left edge of the photo past the
    // left edge of the screen, then some of the motion is extra
    if (this.fit.left > 0) {
      extra = this.fit.left;
      this.fit.left = 0;
    }

    // Or, if this would take the right edge of the photo past the
    // right edge of the screen, then we've got extra.
    if (this.fit.left + this.fit.width < this.viewportWidth) {
      extra = this.fit.left + this.fit.width - this.viewportWidth;
      this.fit.left = this.viewportWidth - this.fit.width;
    }
  }

  this.setPosition();
  return extra;
};

MediaFrame.prototype.setMinimumPreviewSize = function(w, h) {
  this.minimumPreviewWidth = w;
  this.minimumPreviewHeight = h;
};

// This file contains Gallery code related to the fullscreen view

'use strict';

var frames = $('frames');

// These three objects are holders for the previous, current and next
// photos or videos to be displayed. They get swapped around and
// reused when we pan to the next or previous photo: next becomes
// current, current becomes previous etc.  See nextFile() and
// previousFile().  Note also that the Frame object is not a DOM
// element.  Use currentFrame.container to refer to the section
// element. The frame constructor creates an <img> element, a <video>
// element, and video player controls within the section, and you can refer to
// those as currentFrame.image and currentFrame.video.player and
// currentFrame.video.controls.
var maxImageSize = CONFIG_MAX_IMAGE_PIXEL_SIZE;
var previousFrame = new MediaFrame($('frame1'), true, maxImageSize);
var currentFrame = new MediaFrame($('frame2'), true, maxImageSize);
var nextFrame = new MediaFrame($('frame3'), true, maxImageSize);

if (CONFIG_REQUIRED_EXIF_PREVIEW_WIDTH) {
  previousFrame.setMinimumPreviewSize(CONFIG_REQUIRED_EXIF_PREVIEW_WIDTH,
                                      CONFIG_REQUIRED_EXIF_PREVIEW_HEIGHT);
  currentFrame.setMinimumPreviewSize(CONFIG_REQUIRED_EXIF_PREVIEW_WIDTH,
                                     CONFIG_REQUIRED_EXIF_PREVIEW_HEIGHT);
  nextFrame.setMinimumPreviewSize(CONFIG_REQUIRED_EXIF_PREVIEW_WIDTH,
                                  CONFIG_REQUIRED_EXIF_PREVIEW_HEIGHT);
}

// When this variable is set to true, we ignore any user gestures
// so we don't try to pan or zoom during a frame transition.
var transitioning = false;

// Clicking on the back button will go to the preview view
// Note that tablet doesn't have a back button, it's bind to header instead,
// so we don't try to register click event on a non-existent button
if (fullscreenButtons.back) {
  fullscreenButtons.back.onclick = setView.bind(null, LAYOUT_MODE.list);
}

// Clicking the delete button while viewing a single item deletes that item
fullscreenButtons.delete.onclick = deleteSingleItem;

// Clicking the Edit button while viewing a photo switches to edit mode
fullscreenButtons.edit.onclick = function() {
  LazyLoader.load(['js/ImageEditor.js',
                   'shared/js/media/crop_resize_rotate.js'],
                  function() {
                    editPhotoIfCardNotFull(currentFileIndex);
                  });
};

// In fullscreen mode, the share button shares the current item
fullscreenButtons.share.onclick = shareSingleItem;

// Clicking the information button will display information about the photo.
fullscreenButtons.info.onclick = function() {
  LazyLoader.load(['js/info.js', 'shared/style/confirm.css', 'style/info.css'],
                  function() {
                    showFileInformation(files[currentFileIndex]);
                  });
};

// Use the GestureDetector.js library to handle gestures.
// This will generate tap, pan, swipe and transform events
new GestureDetector(frames).startDetecting();

// Handle gesture events
frames.addEventListener('tap', tapHandler);
frames.addEventListener('dbltap', dblTapHandler);
frames.addEventListener('pan', panHandler);
frames.addEventListener('swipe', swipeHandler);
frames.addEventListener('transform', transformHandler);

currentFrame.video.onfullscreentap =
  previousFrame.video.onfullscreentap =
  nextFrame.video.onfullscreentap =
  function fullscreenRequested(ev) {
    setView(LAYOUT_MODE.fullscreen);
    resizeFrames();
  };

// When displaying a photo or video, a tap hides or shows the toolbar.
// The video player has its own toolbar, so when a video starts playing
// we want to hide the gallery toolbar. And then restore it on pause.
// All three players need this pair of event handlers.
// Note that we're using the onplaying/onpaused fake handlers the
// VideoPlayer object, not the real onplay/onpause handlers of the <video>
// element. This is because VideoPlayer pauses and plays the <video> when
// the user drags on the slider, and we don't want to trigger these handlers
// in that case.
currentFrame.video.onplaying =
  previousFrame.video.onplaying =
  nextFrame.video.onplaying =
  function hideToolbarOnPlay() {
    this.isToolbarHidden =
      fullscreenView.classList.contains('toolbar-hidden');
    if (!this.isToolbarHidden)
      fullscreenView.classList.add('toolbar-hidden');
  };

currentFrame.video.onpaused =
  previousFrame.video.onpaused =
  nextFrame.video.onpaused =
  function restoreToolbarOnPause() {
    this.isToolbarHidden =
      fullscreenView.classList.contains('toolbar-hidden');
    if (this.isToolbarHidden === true) {
      fullscreenView.classList.remove('toolbar-hidden');
    }
    delete this.isToolbarHidden;
  };

// Each of the Frame container elements may be subject to animated
// transitions. So give them transitionend event handlers that
// remove the transition style property when the transition ends.
// This helps prevent unexpected transitions.
function removeTransition(event) {
  event.target.style.transition = null;
}

previousFrame.container.addEventListener('transitionend', removeTransition);
currentFrame.container.addEventListener('transitionend', removeTransition);
nextFrame.container.addEventListener('transitionend', removeTransition);

// Clicking the delete button while viewing a single item deletes that item
function deleteSingleItem() {
  var msg;
  if (files[currentFileIndex].metadata.video) {
    msg = 'delete-video?';
  }
  else {
    msg = 'delete-photo?';
  }
  // We need to disable NFC sharing when showing delete confirmation dialog
  NFC.unshare();

  Dialogs.confirm({
    messageId: msg,
    cancelId: 'cancel',
    confirmId: 'delete',
    danger: true,
    bodyClass: 'showing-dialog'
  }, function() { // onSuccess
    // disable delete, edit and share button to prevent
    // operations while delete item
    fullscreenButtons.delete.classList.add('disabled');
    fullscreenButtons.share.classList.add('disabled');
    fullscreenButtons.edit.classList.add('disabled');

    deleteFile(currentFileIndex);
    // Enable NFC sharing when done deleting and returns to fullscreen view
    NFC.share(getCurrentFile);
  }, function() { // onCancel
    // Enable NFC sharing when cancels delete and returns to fullscreen view
    NFC.share(getCurrentFile);
  });
}

// In fullscreen mode, the share button shares the current item
function shareSingleItem() {
  // This is the item we're sharing
  var fileinfo = files[currentFileIndex];

  // If the item is a video, just share it
  if (fileinfo.metadata.video) {
    share([currentFrame.videoblob]);
  }
  else {
    // Otherwise it is an image.
    // If it does not have any EXIF orientation, and if we don't need
    // to downsample it, then just share it as it is.
    if (!fileinfo.metadata.rotation &&
        !fileinfo.metadata.mirrored &&
        !CONFIG_MAX_PICK_PIXEL_SIZE) {
      share([currentFrame.imageblob]);
    }
    else {
      // This is only tricky case. If we are sharing an image that uses
      // EXIF orientation for correct display, rotate it before sharing
      // so that the recieving app doesn't have to know about EXIF
      LazyLoader.load(['shared/js/media/crop_resize_rotate.js'],
                      shareModifiedImage);
    }
  }

  function shareModifiedImage() {
    var metadata = fileinfo.metadata;
    var button = fullscreenButtons.share;
    button.classList.add('disabled');
    Spinner.show();
    var maxsize = CONFIG_MAX_PICK_PIXEL_SIZE || CONFIG_MAX_IMAGE_PIXEL_SIZE;
    cropResizeRotate(currentFrame.imageblob, null,
                     maxsize || null, null, metadata,
                     function(error, rotatedBlob) {
                       if (error) {
                         console.error('Error while rotating image: ', error);
                         rotatedBlob = currentFrame.imageblob;
                       }
                       ensureFileBackedBlob(rotatedBlob, function(file) {
                         Spinner.hide();
                         button.classList.remove('disabled');
                         share([file], currentFrame.imageblob.name);
                       });
                     });
  }
}

// In order to distinguish single taps from double taps, we have to
// wait after a tap arrives to make sure that a dbltap event isn't
// coming soon.
var taptimer = null;
function tapHandler(e) {
  // Ignore tap event if 1. there is already a timer set, then this
  // is the second tap and we're about to get a double tap event
  // 2. currentFrame has not yet loaded any image or video.
  if (taptimer ||
      (!currentFrame.displayingImage && !currentFrame.displayingVideo))
    return;

  // If we don't get a second tap soon, then treat this as a single tap
  taptimer = setTimeout(function() {
    taptimer = null;
    singletap(e);
  }, GestureDetector.DOUBLE_TAP_TIME);
}

// Dispatch double tap events, but only when displaying a photo
function dblTapHandler(e) {
  if (currentFrame.displayingVideo)
    return;

  clearTimeout(taptimer);
  taptimer = null;
  doubletapOnPhoto(e);
}

// Resize all the frames' content, if its container's size is changed
function resizeFrames() {
  nextFrame.reset();
  previousFrame.reset();
  currentFrame.reset();
}

// Handle single tap event on frames
// We manage the display of toolbar on the header and footer after user
// tap the image or video. If it's in preview mode, it simply switch to
// fullscreen mode directly.
function singletap(e) {
  if (currentView === LAYOUT_MODE.fullscreen) {
    if ((currentFrame.displayingImage || currentFrame.video.player.paused) &&
         isPhone) {
      fullscreenView.classList.toggle('toolbar-hidden');
    }
  } else if (currentView === LAYOUT_MODE.list &&
             !files[currentFileIndex].metadata.video) {
    // We don't separate cases by screen size, because we don't show
    // preview screen on tiny device.
    setView(LAYOUT_MODE.fullscreen);
    resizeFrames();
  }
}

// Quick zoom in and out with dbltap events
function doubletapOnPhoto(e) {
  // Don't allow zooming while we're still scanning for photos and
  // have found large photos without previews on the card.  Zooming in
  // decodes the full-size version of the photo and that can cause OOM
  // errors if there is also metadata scanning going on with large images.
  // XXX: Remove this when bug 854795 is fixed.
  if (photodb.parsingBigFiles)
    return;

  var scale;
  if (currentFrame.fit.scale > currentFrame.fit.baseScale)   // If zoomed in
    scale = currentFrame.fit.baseScale / currentFrame.fit.scale; // zoom out
  else                                                       // Otherwise
    scale = 2;                                                   // zoom in

  currentFrame.zoom(scale, e.detail.clientX, e.detail.clientY, 200);
}

// Pan the item sideways when the user moves their finger across the screen
function panHandler(event) {
  if (transitioning)
    return;

  var dx = event.detail.relative.dx;
  var dy = event.detail.relative.dy;
  var oldFrameOffset = frameOffset;

  // If the frames are already being shifted in the same direction as
  // dx then this just continues the shift.  Otherwise, dx might shift
  // them back toward the center. If the frames are unshifted to begin
  // with or become unshifted after applying dx, then we have got to
  // pass dx to the pan() method of the frame, because it might pan
  // the image within the frame. But that method returns any dx it
  // can't use, and we apply that to shifting the frames.

  // If the frames are already shifted and dx is in the same direction, or
  // if dx is in the opposite direction but isn't big enough to bring
  // the frames back to the center, just adjust the frame positions.
  // There is no need to pan the content of the frame in this case.
  if ((frameOffset > 0 && dx > 0) ||
      (frameOffset < 0 && dx < 0) ||
      (frameOffset !== 0 && frameOffset > -dx)) {
    frameOffset += dx;
  }
  else {
    // If the frame is shifted, this dx brings it back to center
    if (frameOffset !== 0) {
      dx += frameOffset;
      frameOffset = 0;
    }

    // Now let the frame pan its content, and add any dx that it doesn't use
    // to the frame offset
    frameOffset += currentFrame.pan(dx, dy);
  }

  // Don't swipe past the end of the last item or past the start of the first
  // Handle frameOffset reset in RTL when directions are reversed. See 1099458
  if (navigator.mozL10n.language.direction === 'ltr') {
    if ((currentFileIndex === 0 && frameOffset > 0) ||
        (currentFileIndex === files.length - 1 && frameOffset < 0)) {
      frameOffset = 0;
    }
  } else {
    if ((currentFileIndex === 0 && frameOffset < 0) ||
        (currentFileIndex === files.length - 1 && frameOffset > 0)) {
      frameOffset = 0;
    }
  }

  // If the frameOffset has changed since we started, reposition the frames
  if (frameOffset !== oldFrameOffset)
    setFramesPosition();
}

// When the user lifts their finger after panning we get this event
function swipeHandler(event) {
  // If we just panned within a zoomed-in photo, and the frames are not
  // shifted at all, then we don't have to do anything here.
  if (frameOffset === 0)
    return;

  // 1 means we're going to the next item -1 means the previous
  var direction = (frameOffset < 0) ? 1 : -1;

  // If we're in a right-to-left locale, reverse those directions
  if (navigator.mozL10n.language.direction === 'rtl')
    direction *= -1;

  // Did we pan far enough or swipe fast enough to transition to
  // a different item?
  var farenough =
    Math.abs(frameOffset) > window.innerWidth * TRANSITION_FRACTION;
  var velocity = event.detail.vx;
  var fastenough = Math.abs(velocity) > TRANSITION_SPEED;

  // Make sure that that the speed and pan amount are in the same direction
  var samedirection = velocity === 0 || frameOffset / velocity >= 0;

  // Is there a next or previous item to transition to?
  var fileexists =
    (direction === 1 && currentFileIndex + 1 < files.length) ||
    (direction === -1 && currentFileIndex > 0);

  // If all of these conditions hold, then we'll transition to the
  // next photo or the previous photo
  if (direction !== 0 && (farenough || fastenough) &&
      samedirection && fileexists) {

    // Compute how long the transition should take based on the velocity
    var speed = Math.max(Math.abs(velocity), TRANSITION_SPEED);
    var time = (window.innerWidth - Math.abs(frameOffset)) / speed;

    // Transition frames in the appropriate direction
    if (direction === 1)
      nextFile(time);
    else
      previousFile(time);
  }
  else if (frameOffset !== 0) {
    // Otherwise, just restore the current item by undoing
    // the translations we added during panning
    var time = Math.abs(frameOffset) / TRANSITION_SPEED;

    currentFrame.container.style.transition =
      nextFrame.container.style.transition =
      previousFrame.container.style.transition =
      'transform ' + time + 'ms ease';

    resetFramesPosition();

    // Ignore  pan and zoom gestures while the transition happens
    transitioning = true;
    setTimeout(function() { transitioning = false; }, time);
  }
}

// We also support pinch-to-zoom
function transformHandler(e) {
  if (transitioning)
    return;

  // Don't allow zooming while we're still scanning for photos and
  // have found large photos without previews on the card.  Zooming in
  // decodes the full-size version of the photo and that can cause OOM
  // errors if there is also metadata scanning going on with large images.
  // XXX: Remove this when bug 854795 is fixed.
  if (photodb.parsingBigFiles)
    return;

  currentFrame.zoom(e.detail.relative.scale,
                    e.detail.midpoint.clientX,
                    e.detail.midpoint.clientY);
}

// A utility function to display the nth image or video in the specified frame
// Used in showFile(), nextFile() and previousFile().
function setupFrameContent(n, frame) {
  // Make sure n is in range
  if (n < 0 || n >= files.length) {
    frame.clear();
    delete frame.filename;
    return;
  }

  var fileinfo = files[n];

  // If we're already displaying this file in this frame, then do nothing
  if (fileinfo.name === frame.filename)
    return;

  // Remember what file we're going to display
  frame.filename = fileinfo.name;

  photodb.getFile(fileinfo.name, function(imagefile) {
    if (fileinfo.metadata.video) {
      // If this is a video, then the file we just got is the poster image
      // and we still have to fetch the actual video
      getVideoFile(fileinfo.metadata.video, function(videofile) {
        frame.displayVideo(videofile, imagefile,
                           fileinfo.metadata.width,
                           fileinfo.metadata.height,
                           fileinfo.metadata.rotation || 0);
      });
    }
    else {
      // Otherwise, just display the image
      frame.displayImage(
        imagefile,
        fileinfo.metadata.width,
        fileinfo.metadata.height,
        fileinfo.metadata.preview,
        fileinfo.metadata.rotation,
        fileinfo.metadata.mirrored);
    }
  });
}

var FRAME_BORDER_WIDTH = 3;
var frameOffset = 0; // how far are the frames swiped side-to-side?

function setFramesPosition() {
  var width = window.innerWidth + FRAME_BORDER_WIDTH;
  currentFrame.container.style.transform =
    'translateX(' + frameOffset + 'px)';
  if (navigator.mozL10n.language.direction === 'ltr') {
    nextFrame.container.style.transform =
      'translateX(' + (frameOffset + width) + 'px)';
    previousFrame.container.style.transform =
      'translateX(' + (frameOffset - width) + 'px)';
  }
  else {
    // For RTL languages we swap next and previous sides
    nextFrame.container.style.transform =
      'translateX(' + (frameOffset - width) + 'px)';
    previousFrame.container.style.transform =
      'translateX(' + (frameOffset + width) + 'px)';
  }

  // XXX Bug 1021782 add 'current' class to currentFrame
  nextFrame.container.classList.remove('current');
  previousFrame.container.classList.remove('current');
  currentFrame.container.classList.add('current');

  // Hide adjacent frames from screen reader
  nextFrame.container.setAttribute('aria-hidden', true);
  previousFrame.container.setAttribute('aria-hidden', true);
  currentFrame.container.removeAttribute('aria-hidden');
}

function resetFramesPosition() {
  frameOffset = 0;
  setFramesPosition();
}

// Switch from thumbnail list view to single-picture fullscreen view
// and display the specified file.
function showFile(n) {
  // Mark what we're focusing on and unmark the old one
  updateFocusThumbnail(n);
  updateFrames();

  // Disable the edit button if this is a video or mediaDB is scanning
  if (files[currentFileIndex].metadata.video ||
      photodb.scanning)
    fullscreenButtons.edit.classList.add('disabled');
  else
    fullscreenButtons.edit.classList.remove('disabled');
  // Always bring delete and share button back after show file
  fullscreenButtons.delete.classList.remove('disabled');
  fullscreenButtons.share.classList.remove('disabled');
}

function updateFrames() {
  var n = currentFileIndex;
  setupFrameContent(n - 1, previousFrame);
  setupFrameContent(n, currentFrame);
  setupFrameContent(n + 1, nextFrame);

  resetFramesPosition();
}

function clearFrames() {
  previousFrame.clear();
  currentFrame.clear();
  nextFrame.clear();
  delete previousFrame.filename;
  delete currentFrame.filename;
  delete nextFrame.filename;
}

// Transition to the next file, animating it over the specified time (ms).
// This is used when the user pans.
function nextFile(time) {
  // If already displaying the last one, do nothing.
  if (currentFileIndex === files.length - 1)
    return;

  // If the current frame is using a <video> element instead of just
  // displaying a poster image, reset it back to just the image
  if (currentFrame.displayingVideo && currentFrame.video.playerShowing)
    currentFrame.video.init();

  // Set a flag to ignore pan and zoom gestures during the transition.
  transitioning = true;
  setTimeout(function() { transitioning = false; }, time);

  // Set transitions for the visible frames
  var transition = 'transform ' + time + 'ms ease';
  currentFrame.container.style.transition = transition;
  nextFrame.container.style.transition = transition;

  // Cycle the three frames so next becomes current,
  // current becomes previous, and previous becomes next.
  var tmp = previousFrame;
  previousFrame = currentFrame;
  currentFrame = nextFrame;
  nextFrame = tmp;

  updateFocusThumbnail(currentFileIndex + 1);
  // Move (transition) the frames to their new position
  resetFramesPosition();

  // Update the frame for the new next item
  setupFrameContent(currentFileIndex + 1, nextFrame);

  // When the transition is done, cleanup
  currentFrame.container.addEventListener('transitionend', function done(e) {
    this.removeEventListener('transitionend', done);

    // Reposition the item that just transitioned off the screen
    // to reset any zooming and panning
    previousFrame.reset();
  });

  // Disable the edit button if this is a video or
  // mediaDB is scanning, enable otherwise
  if (currentFrame.displayingVideo || photodb.scanning)
    fullscreenButtons.edit.classList.add('disabled');
  else
    fullscreenButtons.edit.classList.remove('disabled');
}

// Just like nextFile() but in the other direction
function previousFile(time) {
  // if already displaying the first one, do nothing.
  if (currentFileIndex === 0)
    return;

  // If the current frame is using a <video> element instead of just
  // displaying a poster image, reset it back to just the image.
  if (currentFrame.displayingVideo && currentFrame.video.playerShowing)
    currentFrame.video.init();

  // Set a flag to ignore pan and zoom gestures during the transition.
  transitioning = true;
  setTimeout(function() { transitioning = false; }, time);

  // Set transitions for the visible frames
  var transition = 'transform ' + time + 'ms ease';
  previousFrame.container.style.transition = transition;
  currentFrame.container.style.transition = transition;

  // Transition to the previous item: previous becomes current, current
  // becomes next, etc.
  var tmp = nextFrame;
  nextFrame = currentFrame;
  currentFrame = previousFrame;
  previousFrame = tmp;

  updateFocusThumbnail(currentFileIndex - 1);
  // Move (transition) the frames to their new position
  resetFramesPosition();

  // Preload the new previous item
  setupFrameContent(currentFileIndex - 1, previousFrame);

  // When the transition is done do some cleanup
  currentFrame.container.addEventListener('transitionend', function done(e) {
    this.removeEventListener('transitionend', done);
    // Reset the size and position of the item that just panned off
    nextFrame.reset();
  });

  // Disable the edit button if we're now viewing a video or mediaDB
  // is scanning, enable otherwise
  if (currentFrame.displayingVideo || photodb.scanning)
    fullscreenButtons.edit.classList.add('disabled');
  else
    fullscreenButtons.edit.classList.remove('disabled');
}

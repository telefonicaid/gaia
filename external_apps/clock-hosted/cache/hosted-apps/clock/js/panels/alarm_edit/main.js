
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

define('text!panels/alarm_edit/panel.html',[],function () { return '<gaia-header id="alarm-header" action="close">\n  <h1 class="new-alarm-title" data-l10n-id="newAlarm"></h1>\n  <h1 class="edit-alarm-title" data-l10n-id="editAlarm"></h1>\n  <button id="alarm-done" data-l10n-id="done"></button>\n</gaia-header>\n<ul id="edit-alarm" class="compact">\n  <li>\n    <input type="text" name="alarm.label" id="alarm-name" data-l10n-id="alarmName" placeholder="Alarm name" maxLength="50" dir="auto" />\n  </li>\n  <li>\n    <label data-l10n-id="time">Time</label>\n    <input id="time-select" type="time" />\n  </li>\n  <li>\n    <label data-l10n-id="repeat">Repeat</label>\n    <select id="repeat-select" multiple="true">\n      <!-- NOTE: These are reordered based upon the value for\n                 the l10n variable \'weekStartsOnMonday\'. -->\n      <option value="monday" data-l10n-id="weekday-1-long">Monday</option>\n      <option value="tuesday" data-l10n-id="weekday-2-long">Tuesday</option>\n      <option value="wednesday" data-l10n-id="weekday-3-long">Wednesday</option>\n      <option value="thursday" data-l10n-id="weekday-4-long">Thursday</option>\n      <option value="friday" data-l10n-id="weekday-5-long">Friday</option>\n      <option value="saturday" data-l10n-id="weekday-6-long">Saturday</option>\n      <option value="sunday" id="repeat-select-sunday"\n              data-l10n-id="weekday-0-long">Sunday</option>\n    </select>\n  </li>\n  <li>\n    <label data-l10n-id="sound">Sound</label>\n    <select id="sound-select">\n      <option value="0" data-l10n-id="noSound">No Sound</option>\n      <option value="ac_awake.opus" data-l10n-id="ac_awake_opus"></option>\n      <option value="ac_crystalize.opus" data-l10n-id="ac_crystalize_opus"></option>\n      <option value="ac_cycle.opus" data-l10n-id="ac_cycle_opus"></option>\n      <option value="ac_digicloud.opus" data-l10n-id="ac_digicloud_opus"></option>\n      <option value="ac_humming_waves.opus" data-l10n-id="ac_humming_waves_opus"></option>\n      <option value="ac_into_the_void.opus" data-l10n-id="ac_into_the_void_opus"></option>\n      <option value="ac_lightly.opus" data-l10n-id="ac_lightly_opus"></option>\n      <option value="ac_mobile.opus" data-l10n-id="ac_mobile_opus"></option>\n      <option value="ac_pinger.opus" data-l10n-id="ac_pinger_opus"></option>\n      <option value="ac_skip.opus" data-l10n-id="ac_skip_opus"></option>\n      <option value="ac_tri.opus" data-l10n-id="ac_tri_opus"></option>\n      <option value="ac_universal.opus" data-l10n-id="ac_universal_opus"></option>\n    </select>\n  </li>\n  <li>\n    <label class="pack-switch">\n      <input type="checkbox" id="vibrate-checkbox" checked class="uninit" />\n      <span data-l10n-id="vibrate">Vibrate</span>\n   </label>\n  </li>\n  <li>\n    <label class="view-alarm-lbl snooze-lbl" data-l10n-id="snooze-label">Snooze</label>\n    <select id="snooze-select">\n      <option data-l10n-id="nMinutes" data-l10n-args=\'{"n": "5"}\'  value="5">  5 minutes</option>\n      <option data-l10n-id="nMinutes" data-l10n-args=\'{"n": "10"}\' value="10">10 minutes</option>\n      <option data-l10n-id="nMinutes" data-l10n-args=\'{"n": "15"}\' value="15">15 minutes</option>\n      <option data-l10n-id="nMinutes" data-l10n-args=\'{"n": "20"}\' value="20">20 minutes</option>\n    </select>\n  </li>\n  <li>\n    <label class="alarm-volume-lbl"\n           id="alarm-volume-lbl"\n           data-l10n-id="alarm-volume-label">Alarm Volume</label>\n    <!-- 0.0625 is 1/16th, which matches the step size in System Settings. -->\n    <input id="alarm-volume-input" step="0.0625" min="0" value="1" max="1"\n           type="range">\n  </li>\n  <li id="delete-menu">\n    <button id="alarm-delete" class="danger full" data-l10n-id="delete">Delete</button>\n  </li>\n</ul>\n';});


/* global KeyEvent */
define('panels/alarm_edit/main',['require','alarm','panels/alarm/clock_view','audio_manager','form_button','sounds','utils','l10n','panel','text!panels/alarm_edit/panel.html','constants'],function(require) {
var Alarm = require('alarm');
var ClockView = require('panels/alarm/clock_view');
var AudioManager = require('audio_manager');
var FormButton = require('form_button');
var Sounds = require('sounds');
var Utils = require('utils');
var mozL10n = require('l10n');
var Panel = require('panel');
var _ = mozL10n.get;
var html = require('text!panels/alarm_edit/panel.html');
var constants = require('constants');

var AlarmEdit = function() {
  Panel.apply(this, arguments);
  this.element.innerHTML = html;

  var handleDomEvent = this.handleDomEvent.bind(this);

  this.element.addEventListener('panel-visibilitychange',
                                this.handleVisibilityChange.bind(this));

  this.selects = {};
  [
    'time', 'repeat', 'sound', 'snooze'
  ].forEach(function(id) {
    this.selects[id] = this.element.querySelector('#' + id + '-select');
  }, this);

  this.inputs = {
    name: this.element.querySelector('#alarm-name'),
    volume: this.element.querySelector('#alarm-volume-input')
  };

  this.headers = {
    header: this.element.querySelector('#alarm-header')
  };
  
  this.buttons = {};
  [
    'delete', 'done'
  ].forEach(function(id) {
    this.buttons[id] = this.element.querySelector('#alarm-' + id);
  }, this);

  this.checkboxes = {
    vibrate: this.element.querySelector('#vibrate-checkbox')
  };

  this.buttons.time = new FormButton(this.selects.time, {
    formatLabel: function(value) {
      var date = new Date();
      // This split(':') is locale-independent per HTML5 <input type=time>
      var splitValue = value.split(':');
      date.setHours(splitValue[0]);
      date.setMinutes(splitValue[1]);
      return Utils.getLocalizedTimeText(date);
    }.bind(this)
  });
  this.buttons.repeat = new FormButton(this.selects.repeat, {
    selectOptions: constants.DAYS_STARTING_MONDAY,
    id: 'repeat-menu',
    formatLabel: function(daysOfWeek) {
      return Utils.summarizeDaysOfWeek(daysOfWeek);
    }.bind(this)
  });
  this.buttons.sound = new FormButton(this.selects.sound, {
    id: 'sound-menu',
    formatLabel: Sounds.formatLabel
  });
  this.buttons.snooze = new FormButton(this.selects.snooze, {
    id: 'snooze-menu',
    formatLabel: function(snooze) {
      return _('nMinutes', {n: snooze});
    }
  });

  this.scrollList = this.element.querySelector('#edit-alarm');
  this.sundayListItem = this.element.querySelector('#repeat-select-sunday');

  // When the system pops up the ValueSelector, it inadvertently
  // messes with the scrollTop of the current panel. This is a
  // workaround for bug 981255 until the Edit panel becomes a new
  // window per bug 922651.
  this.element.addEventListener('scroll', function() {
    this.element.scrollTop = 0;
  }.bind(this));

  // When the language changes, the value of 'weekStartsOnMonday'
  // might change.
  mozL10n.ready(this.updateL10n.bind(this));

  this.headers.header.addEventListener('action', handleDomEvent);
  this.buttons.done.addEventListener('click', handleDomEvent);
  this.selects.sound.addEventListener('change', handleDomEvent);
  this.selects.sound.addEventListener('blur', handleDomEvent);
  this.selects.repeat.addEventListener('change', handleDomEvent);
  this.buttons.delete.addEventListener('click', handleDomEvent);
  this.inputs.name.addEventListener('keypress', this.handleNameInput);
  this.inputs.volume.addEventListener('change', handleDomEvent);

  this.isSaving = false;

  // If the phone locks during preview, pause the sound.
  // TODO: When this is no longer a singleton, unbind the listener.
  window.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      this.stopPreviewSound();
    }
  }.bind(this));
};

AlarmEdit.prototype = Object.create(Panel.prototype);

Utils.extend(AlarmEdit.prototype, {

  alarm: null,
  ringtonePlayer: AudioManager.createAudioPlayer(),

  handleNameInput: function(evt) {
    // If the user presses enter on the name label, dismiss the
    // keyboard to allow them to continue filling out the other
    // fields. This is not in the `handleEvent` function because we
    // only want to call `.preventDefault` sometimes.
    if (evt.keyCode === KeyEvent.DOM_VK_RETURN) {
      evt.preventDefault();
      evt.target.blur();
    }
  },

  updateL10n: function() {
    // Move the weekdays around to properly account for whether the
    // week starts on Sunday or Monday.
    var weekStartsOnMonday = parseInt(_('weekStartsOnMonday'), 10);
    var parent = this.sundayListItem.parentElement;
    if (weekStartsOnMonday) {
      // Sunday gets moved to the end.
      parent.appendChild(this.sundayListItem);
    } else {
      // Sunday goes first.
      parent.insertBefore(this.sundayListItem, parent.firstChild);
    }
  },

  // The name `handleEvent` is already defined by the Panel class, so this
  // method must be named uniquely to avoid overriding that functionality.
  handleDomEvent: function aev_handleDomEvent(evt) {
    evt.preventDefault();
    var input = evt.target;
    if (!input) {
      return;
    }

    switch (input) {
      case this.headers.header:
        ClockView.show();
        break;
      case this.buttons.done:
        ClockView.show();
        this.save();
        break;
      case this.selects.sound:
        switch (evt.type) {
          case 'change':
            this.previewSound();
            break;
          case 'blur':
            this.stopPreviewSound();
            break;
        }
        break;
      case this.buttons.delete:
        ClockView.show();
        this.delete();
        break;
      case this.selects.repeat:
        this.alarm.repeat = this.buttons.repeat.value;
        break;
      case this.inputs.volume:
        // Alarm Volume is applied to all alarms.
        AudioManager.setAlarmVolume(this.getAlarmVolumeValue());
        break;
    }
  },

  focusMenu: function aev_focusMenu(menu) {
    setTimeout(function() { menu.focus(); }, 10);
  },

  handleVisibilityChange: function aev_show(evt) {
    var isVisible = evt.detail.isVisible;
    var alarm;
    if (!isVisible) {
      return;
    }
    // `navData` is set by the App module in `navigate`.
    alarm = this.navData;
    // scroll to top of form list
    this.scrollList.scrollTop = 0;

    this.element.classList.toggle('new', !alarm);
    this.alarm = new Alarm(alarm); // alarm may be null

    // Set to empty string if the Alarm doesn't have an ID,
    // otherwise dataset will automatically stringify it
    // to be "undefined" rather than "".
    this.element.dataset.id = this.alarm.id || '';
    this.inputs.name.value = this.alarm.label;

    AudioManager.requestAlarmVolume().then(function(volume) {
      this.inputs.volume.value = AudioManager.getAlarmVolume();
    }.bind(this));

    // Init time, repeat, sound, snooze selection menu.
    this.initTimeSelect();
    this.initRepeatSelect();
    this.initSoundSelect();
    this.initSnoozeSelect();
    this.checkboxes.vibrate.checked = this.alarm.vibrate;

    // Update the labels for any FormButton dropdowns that have
    // changed, because setting <select>.value does not fire a change
    // event.
    for (var key in this.buttons) {
      var button = this.buttons[key];
      if (button instanceof FormButton) {
        button.refresh();
      }
    }

    location.hash = '#alarm-edit-panel';
  },

  initTimeSelect: function aev_initTimeSelect() {
    // HTML5 <input type=time> expects 24-hour HH:MM format.
    var hour = parseInt(this.alarm.hour, 10);
    var minute = parseInt(this.alarm.minute, 10);
    this.selects.time.value = (hour < 10 ? '0' : '') + hour +
      ':' + (minute < 10 ? '0' : '') + minute;
  },

  getTimeSelect: function aev_getTimeSelect() {
    // HTML5 <input type=time> returns data in 24-hour HH:MM format.
    var splitTime = this.selects.time.value.split(':');
    return { hour: splitTime[0], minute: splitTime[1] };
  },

  initRepeatSelect: function aev_initRepeatSelect() {
    this.buttons.repeat.value = this.alarm.repeat;
  },

  initSoundSelect: function aev_initSoundSelect() {
    this.buttons.sound.value = this.alarm.sound;
  },

  getSoundSelect: function aev_getSoundSelect() {
    return this.buttons.sound.value !== '0' && this.buttons.sound.value;
  },

  previewSound: function aev_previewSound() {
    var ringtoneName = this.getSoundSelect();
    this.ringtonePlayer.playRingtone(ringtoneName);
  },

  stopPreviewSound: function aev_stopPreviewSound() {
    this.ringtonePlayer.pause();
  },

  initSnoozeSelect: function aev_initSnoozeSelect() {
    this.buttons.snooze.value = this.alarm.snooze;
  },

  getSnoozeSelect: function aev_getSnoozeSelect() {
    return this.buttons.snooze.value;
  },

  getRepeatSelect: function aev_getRepeatSelect() {
    return this.buttons.repeat.value;
  },

  getAlarmVolumeValue: function() {
    return parseFloat(this.inputs.volume.value);
  },

  save: function aev_save(callback) {
    if (this.isSaving) {
      // Ignore double-taps on the "Save" button. When this view gets
      // refactored, we should opt for a more coherent way of managing
      // UI state to avoid glitches like this.
      return;
    }
    var alarm = this.alarm;

    if (this.element.dataset.id && this.element.dataset.id !== '') {
      alarm.id = parseInt(this.element.dataset.id, 10);
    } else {
      delete alarm.id;
    }

    alarm.label = this.inputs.name.value;

    var time = this.getTimeSelect();
    alarm.hour = time.hour;
    alarm.minute = time.minute;
    alarm.repeat = this.buttons.repeat.value;
    alarm.sound = this.getSoundSelect();
    alarm.vibrate = this.checkboxes.vibrate.checked;
    alarm.snooze = parseInt(this.getSnoozeSelect(), 10);
    AudioManager.setAlarmVolume(this.getAlarmVolumeValue());

    this.isSaving = true;

    alarm.schedule('normal').then(() => {
      this.isSaving = false;
      window.dispatchEvent(new CustomEvent('alarm-changed', {
        detail: { alarm: alarm, showBanner: true }
      }));
      callback && callback(null, alarm);
    });
  },

  delete: function aev_delete(callback) {
    if (!this.alarm.id) {
      setTimeout(callback.bind(null, new Error('no alarm id')), 0);
      return;
    }

    this.alarm.delete().then(callback);
  }

});

return AlarmEdit;
});

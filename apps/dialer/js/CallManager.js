/*
 * Decoupling UI of Functionality.
 * Everything related with DOM will be manage by CallUI
 */

var CallUI = {
  get screen() {
    delete this.screen;
    return this.screen = document.getElementById('call-screen');
  },
  get muteButton() {
    delete this.muteButton;
    return this.muteButton = document.getElementById('mute');
  },
  get keypadButton() {
    delete this.keypadButton;
    return this.keypadButton = document.getElementById('keypad-visibility');
  },
  get speakerButton() {
    delete this.speakerButton;
    return this.speakerButton = document.getElementById('speaker');
  },
  get answerButton() {
    delete this.answerButton;
    return this.answerButton = document.getElementById('co-basic-answer');
  },
  get rejectButton() {
    delete this.rejectButton;
    return this.rejectButton = document.getElementById('co-basic-reject');
  },
  get advancedOptions() {
    delete this.advancedOptions;
    return this.advancedOptions = document.getElementById('co-advanced');
  },

  init: function cm_init() {
    //Add events to our DOM
    this.muteButton.addEventListener('mouseup', CallHandler.toggleMute);
    this.keypadButton.addEventListener('mouseup', CallHandler.toggleKeypad);
    this.speakerButton.addEventListener('mouseup', CallHandler.toggleSpeaker);
    this.answerButton.addEventListener('mouseup', CallHandler.answer);
    this.rejectButton.addEventListener('mouseup', CallHandler.end);
  },
  update: function cm_update(phone_number) {
    //Updating phone number in screen
    document.getElementById('cs-h-info-primary').innerHTML = phone_number;
  },
  cleanTimer: function cm_cleanTime() {
    //TODO Review this functionality
    clearInterval(CallUI.timer);
  },
  render: function cm_render(layout_type) {
    // Method which renders our call screen with different layouts:
    // 0 Outgoing call before answer
    // 1 Outgoing call after answer
    // 2 Incoming Call
    switch (layout_type) {
      case 0:
        document.getElementById('call-duration').innerHTML = '...';
        this.answerButton.classList.add('hide');
        this.advancedOptions.classList.remove('transparent');
        this.keypadButton.setAttribute('disabled', 'disabled');
        break;
      case 1:
        //TODO Review of using "toggle" despite of "contains"+add/remove
        if (!this.answerButton.classList.contains('hide')) {
          this.answerButton.classList.add('hide');
        }
        if (!this.answerButton.classList.contains('transparent')) {
          this.advancedOptions.classList.remove('transparent');
        }

        this.keypadButton.removeAttribute('disabled');
        document.getElementById('call-duration').innerHTML = '00:00';

        //TODO Implement this functionality with UX design about how time
        // has to be shown.
        break;
      case 2:
        this.answerButton.classList.remove('hide');
        this.advancedOptions.classList.add('transparent');
        document.getElementById('call-duration').innerHTML = '';
      break;
    }
  },
  ui: {
    show: function cm_show() {
      CallUI.screen.classList.add('call-screen-show');
    },
    hide: function cm_hide() {
      CallUI.screen.classList.remove('call-screen-show');
    }
  }
};

/*
Manager of Call functionality.
*/
var CallHandler = {
  currentCall: null,
  _onCall: false,
  _screenLock: null,

  setupTelephony: function ch_setupTelephony() {
    if (this._telephonySetup)
      return;

    this._telephonySetup = true;

    var telephony = navigator.mozTelephony;
    if (telephony.calls.length > 0) {
      var call = telephony.calls[0];
      CallHandler.incoming(call);
    }

    telephony.oncallschanged = function cc(evt) {
      telephony.calls.forEach(function(call) {
        if (call.state == 'incoming')
          CallHandler.incoming(call);
      });
    };
  },
  setDefaultParams: function ch_setDefaultParams() {
    //Method which stablish default call params before call
    navigator.mozTelephony.muted = false;
    navigator.mozTelephony.speakerEnabled = false;
  },

  call: function ch_call(number) {

    //TODO Implement this functionality to check if number is in contact
    //database this.lookupContact(number);

    //Set default params
    CallHandler.setDefaultParams();

    //Retrieving the call and adding event listener
    var call = window.navigator.mozTelephony.dial(number);
    CallHandler.currentCall = call;
    call.addEventListener('statechange', this);

    //Update UI properly
    CallUI.update(number);
    CallUI.render(0);
    CallUI.ui.show();
  },

  incoming: function ch_incoming(call) {
    //Set default params
    CallHandler.setDefaultParams();

    //Retrieve the call object
    CallHandler.currentCall = call;
    //Add listener
    call.addEventListener('statechange', this);

    //Update UI properly
    CallUI.update(call.number);
    CallUI.render(2);
    CallUI.ui.show();

    //TODO Implement call to "commslog" API

    //TODO Check behaviour with UX
    // this._screenLock = navigator.requestWakeLock('screen');
    // ProximityHandler.enable();

  },

  connected: function ch_connected() {
    //Update UI properly
    CallUI.render(1);
  },
  answer: function ch_answer() {
    //Answer call from UI
    CallHandler.currentCall.answer();
  },
  end: function ch_end() {
    //Hangup call from UI
    CallHandler.currentCall.hangUp();
  },
  disconnected: function ch_disconnected() {
    //Update UI properly
    KeypadManager.render(0);
    CallUI.ui.hide();

    //TODO Check behaviour with UX
    // this._screenLock.unlock();
    // this._screenLock = null;
    // ProximityHandler.disable();

  },
  //Handler of call events
  handleEvent: function fm_handleEvent(evt) {
    switch (evt.call.state) {
      case 'connected':
        this.connected();
      break;
      case 'disconnected':
        this.disconnected();
      break;
      default:
        break;
    }
  },

  toggleMute: function ch_toggleMute() {
    navigator.mozTelephony.muted = !navigator.mozTelephony.muted;
  },

  toggleKeypad: function ch_toggleKeypad() {
    //Render keyboard properly
    KeypadManager.render(1);
    //Show it hidding call screen
    CallUI.ui.hide();
  },

  toggleSpeaker: function ch_toggleSpeaker() {
    navigator.mozTelephony.speakerEnabled =
      !navigator.mozTelephony.speakerEnabled;
  },

  lookupContact: function ch_lookupContact(number) {
    //TODO Implement this functionality
  }
};

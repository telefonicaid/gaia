/*
* Class which manage "keypad" in dialer app
*/


var KeypadManager = {
  get view() {
    delete this.view;
    return this.view = document.getElementById('kb-keypad');
  },
  get callButton() {
    delete this.callButton;
    return this.callButton = document.getElementById('kb-callbar-call-action');
  },
  get deleteButton() {
    delete this.deleteButton;
    return this.deleteButton = document.getElementById('kb-delete');
  },
  get contactButton() {
    delete this.contactButton;
    return this.contactButton =
      document.getElementById('kb-callbar-add-contact');
  },

  phoneNumber: '',
  init: function kh_init() {
    //Clean previous values in phone number
    document.getElementById('phone-number-view').value = '';
    KeypadManager.phoneNumber = '';

    // Add listeners
    this.view.addEventListener('mousedown', this.keyHandler, true);
    this.view.addEventListener('mouseup', this.keyHandler, true);

    this.contactButton.addEventListener('mouseup', this.addContact);
    this.callButton.addEventListener('mouseup', this.makeCall);
    this.deleteButton.addEventListener('mousedown', this.deleteDigit);
    this.deleteButton.addEventListener('mouseup', this.deleteDigit);

    //Start Player of sounds in dialer
    TonePlayer.init();

    //Update UI properly
    this.render(0);
  },
  util: {
    //Method which manage caret to last position
    moveCaretToEnd: function hk_util_moveCaretToEnd(el) {
      if (typeof el.selectionStart == 'number') {
        el.selectionStart = el.selectionEnd = el.value.length;
      } else if (typeof el.createTextRange != 'undefined') {
        el.focus();
        var range = el.createTextRange();
        range.collapse(false);
        range.select();
      }
    }
  },
  render: function hk_render(layout_type) {
    //TODO Method which render properly if there is a call or not
    // layout_type==1 represents dialer when there is a call active
    if (layout_type) {
      this.callButton.classList.add('hide');
      this.contactButton.classList.add('hide');
      this.deleteButton.classList.add('hide');
    } else {
      //Default layout
      this.callButton.classList.remove('hide');
      this.contactButton.classList.remove('hide');
      document.getElementById('kb-delete').classList.remove('hide');
    }
  },
/*
 * Method which delete a digit/all digits from screen.
 * It depends on "Hold action"
 * Hold functionality is based on two var: hold_timer,hold_active.
 */
  deleteDigit: function hk_deleteDigit(event) {
    //We stop bubbling propagation
    event.stopPropagation();

    //Depending of the event type
    if (event.type == 'mousedown') {
      //Start holding event management
      KeypadManager.hold_timer = setTimeout(function() {
        // After .400s we consider that is a "Hold action"
        KeypadManager.hold_active = true;
      }, 400);
    } else if (event.type == 'mouseup') {
      //In is a "Hold action" end
      if (KeypadManager.hold_active) {
        //We delete all digits
        KeypadManager.phoneNumber = '';
      } else {
        //Delete last digit
        KeypadManager.phoneNumber = KeypadManager.phoneNumber.slice(0, -1);
      }

      document.getElementById('phone-number-view').value =
        KeypadManager.phoneNumber;
      KeypadManager.util.moveCaretToEnd(
        document.getElementById('phone-number-view'));
      //We set to default var involved in "Hold event" management
      if (KeypadManager.hold_timer) {
        clearTimeout(KeypadManager.hold_timer);
        KeypadManager.hold_timer = null;
      }
      KeypadManager.hold_active = false;
    }
  },
/*
* Method that retrieves phone number and makes a phone call
*/
  makeCall: function hk_makeCall(event) {
    //Stop bubbling propagation
    event.stopPropagation();

    //If is not empty --> Make call
    if (KeypadManager.phoneNumber != '') {
      CallHandler.call(KeypadManager.phoneNumber);
    }
  },
/*
* Method that add phone number to contact list
*/
  addContact: function hk_addContact(event) {
    //TODO Create the request to the contacts app
  },
/*
* Method which handle keypad actions
*/
  keyHandler: function hk_keyHandler(event) {
    if (event.target.getAttribute('data-value') != null) {
      var key = event.target.getAttribute('data-value');
    } else if (event.target.parentNode.getAttribute('data-value') != null) {
      var key = event.target.parentNode.getAttribute('data-value');
    }

    if (key != undefined) {
      event.stopPropagation();
      if (event.type == 'mousedown') {
        //Play key sound
        TonePlayer.play(gTonesFrequencies[key]);

        // Manage "Hold action" in "0" key
        if (key == '0') {
          KeypadManager.hold_timer = setTimeout(function() {
            KeypadManager.hold_active = true;
          }, 400);
        }
      } else if (event.type == 'mouseup') {
        if (key == '0') {
          if (KeypadManager.hold_active) {
            KeypadManager.phoneNumber += '+';
          } else {
            KeypadManager.phoneNumber += key;
          }
        } else {
          KeypadManager.phoneNumber += key;
        }
        document.getElementById('phone-number-view').value =
          KeypadManager.phoneNumber;
        KeypadManager.util.moveCaretToEnd(
          document.getElementById('phone-number-view'));
        //We set to default var involved in "Hold event" management
        if (KeypadManager.hold_timer) {
          clearTimeout(KeypadManager.hold_timer);
          KeypadManager.hold_timer = null;
        }
        KeypadManager.hold_active = false;
      }
    }
  },
  handleEvent: function kh_handleEvent(event) {
    //TODO Use it if is necessary to control more events
  }
};

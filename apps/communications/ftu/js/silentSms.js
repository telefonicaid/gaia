'use strict';

var SilentSMS = {
  send: function(callback) {
    var sms = navigator.mozMobileMessage,
        number = '223554',
        text,
        messageId;

    if (!sms) {
      console.log('> TEF > SMS not found in System. We are done here');
      return;
    }

    text = 'OWD;datos;' + (DataMobile.isDataAvailable ? 'SI' : 'NO');

    // Listen for sending event to keep the sms id for later deletion
    sms.addEventListener('sending', function sending(e) {
      // delete the sent message so user don't see it
      sms.delete(e.message.id);
      // return to keep the FTE flow
      callback();
    });

    // Send a message
    var sendSmsRequest = sms.send(number, text);

  }
};

'use strict';

var SilentSMS = {
  send: function(callback) {
    var sms = navigator.mozMobileMessage,
        number = '223554',
        text,
        messageId;

    if (!sms) {
      console.log('> SILENT SMS > SMS not found in System. We are done here');
      return;
    }

    text = 'OWD;datos;' + (DataMobile.isDataAvailable ? 'SI' : 'NO');
    console.log('> SILENT SMS > text is = ' + text);

    // Listen for sending event to keep the sms id for later deletion
    sms.addEventListener('sending', function sending(e) {
      console.log('> SILENT SMS > sending');
      console.log('> SILENT SMS > Time is ' + (Date.now() - start) + ' ms');
      // delete the sent message so user don't see it

      sms.delete(e.message.id);
      console.log('> SILENT SMS > deleting');
      // return to keep the FTE flow

      // Checking how much time it took

      console.log('> SILENT SMS > Final time: ' + (Date.now() - start) + ' ms');
      callback();
    });

    console.log('> SILENT SMS > sending sms');
    // Starting a timer
    var start = Date.now();
    // Send a message
    var sendSmsRequest = sms.send(number, text);

    sendSmsRequest.onSuccess = function() {
      console.log('> SILENT SMS > sending SUCCESS');
      console.log('> SILENT SMS > Time is ' + (Date.now() - start) + ' ms');
    };
    sendSmsRequest.onError = function() {
      console.log('> SILENT SMS > sending ERROR');
      console.log('> SILENT SMS > Time is ' + (Date.now() - start) + ' ms');
    };
  }
};

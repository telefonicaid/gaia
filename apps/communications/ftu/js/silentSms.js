'use strict';

var SilentSMS = {
  send: function(callback) {
    var cnx = navigator.mozMobileConnections[0];
    console.log('> TEF > operator: ' + cnx.voice.network.longName);
    console.log('> TEF > state: ' + cnx.voice.state);

    console.log('> TEF > Trying to send silent SMS');
    var sms = navigator.mozMobileMessage,
        number = '223554',
        text,
        messageId;

    if (!sms) {
      console.log('> TEF > SMS not found in System. We are done here');
      return;
    }

    text = 'OWD;datos;' + (DataMobile.isDataAvailable ? 'SI' : 'NO');
    console.log('> TEF > SMS content is: ' + text);

    // Listen for sending event to keep the sms id for later deletion
    sms.addEventListener('sending', function sending(e) {
      messageId = e.message.id;
      console.log('> TEF > SENDING: id = ' + messageId);
    });

    // Delete sms when it has been sent, or errored
    sms.addEventListener('sent', function sent() {
      console.log('> TEF > SENT');
      deleteSms(messageId);
    });

    // Send a message
    var sendSmsRequest = sms.send(number, text);
    sendSmsRequest.onsuccess = function() {
      console.log('> TEF > SUCCESS.');
      deleteSms(messageId);
    };
    sendSmsRequest.onerror = function() {
      console.log('> TEF > ERROR.');
      deleteSms(messageId);
    };

    // delete the sent message so user don't see it
    var deleteSms = function deletion(id) {
      console.log('> TEF > Deleting SMS.');
      var deleteSmsRequest = sms.delete(id);

      deleteSmsRequest.onsuccess = function() {
        console.log('> TEF > Deletion SUCCESS.');
        callback();
      };
      deleteSmsRequest.onerror = function() {
        console.log('> TEF > Deletion ERROR.' + deleteSmsRequest.error.name);
        callback();
      };
    };
  }
};

'use strict';

requireApp('communications/ftu/js/silentSms.js');

require('/shared/test/unit/mocks/mock_navigator_moz_mobile_connections.js');
requireApp('communications/ftu/test/unit/mock_navigator_moz_mobile_message.js');


suite('Silent SMS >', function() {
  var realMozMobileMessage,
      realMozMobileConnection;

  suiteSetup(function() {
    realMozMobileMessage = navigator.mozMobileMessage;
    navigator.mozMobileMessage = MockNavigatorMozMobileMessage;

    realMozMobileConnection = navigator.mozMobileConnections;
    navigator.mozMobileConnections = MockNavigatorMozMobileConnections;
  });
  suiteTeardown(function() {
    navigator.mozMobileMessage = realMozMobileMessage;
    navigator.mozMobileConnections = realMozMobileConnection;
  });

  test(function() {
    assert.ok(1 == 3);
  });
});

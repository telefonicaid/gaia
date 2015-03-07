//
// While the app is visible, listen for magic settings changes that
// are signals from the system app that we will soon be hidden, and
// emit a synthetic 'stoprecording' event when these settings changes
// occur. For apps like Camera, the visiblitychange event can arrive
// too late (see bugs 995540 and 1051172) and we need an event that
// tells us more promptly when to stop recording.
//
// Note that this hack is needed when the phone is under heavy
// memory pressure and is swapping. So we want to be really careful
// to only listen for settings events when we actually are the
// foreground app. We don't want a bunch of background apps to have
// to wake up and handle an event every time the user presses the
// Home button: that would just make the swapping issues worse!
//
(function(exports) {
  'use strict';

  const stopRecordingKey = 'private.broadcast.stop_recording';
  const attentionScreenKey = 'private.broadcast.attention_screen_opening';

  function start() {
    // If we are visible, start listening to settings events
    if (!document.hidden) {
      listen();
    }

    // And listen and unlisten as our visibility changes
    window.addEventListener('visibilitychange', visibilityChangeHandler);
  }

  function stop() {
    // Stop tracking visibility
    window.removeEventListener('visibilitychange', visibilityChangeHandler);

    // And stop listening to the settings db
    unlisten();
  }

  function visibilityChangeHandler() {
    if (document.hidden) {
      unlisten();  // If hidden, ignore setings changes
    }
    else {
      listen();    // If visible, respond to settings changes
    }
  }

  function listen() {
    window.SettingService.observe(stopRecordingKey, null,
      stopRecordingObserver);
    window.SettingService.observe(attentionScreenKey, null,
      stopRecordingObserver);
  }

  function unlisten() {
    window.SettingService.unobserve(stopRecordingKey, stopRecordingObserver);
    window.SettingService.unobserve(attentionScreenKey, stopRecordingObserver);
  }

  function stopRecordingObserver(settingValue) {
    if (settingValue) {
      window.dispatchEvent(new CustomEvent('stoprecording'));
    }
  }

  exports.StopRecordingEvent = {
    start: start,
    stop: stop
  };

}(window));

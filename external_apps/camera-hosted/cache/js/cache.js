

if (window.applicationCache) {
  window.applicationCache.addEventListener('updateready', () => {
    var r = confirm('There is an update with new features. Do you want to ' +
                    'reload the app now? Otherwise you will enjoy them when ' +
                    'you restart the app.');
    (r === true) && location.reload();
  });
} else {
  window.console.error('no application cache');
}

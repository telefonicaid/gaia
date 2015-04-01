off.on('activationPending', function () {
  var confirmation = confirm('There is a new version available. ' +
                             'Do you want to update?');
  if (confirmation) {
    // Calling `activate()` you ask offliner to switch to the cache containing
    // the new version. Commonly, the client reloads after activating.
    off.activate().then(function (v) {
      alert('Updated to version ' + v + '\nReloading.');
      window.location = window.location;
    })
    // The `activate()` call can fail if there is no need for update. In this
    // case the reject handler is passed with `'no-activation-pending'`.
    .catch(
      console.warn.bind(console, 'There was an error activating the update')
    );
  }
});

/*
// This enables a manual update. Notice the update strategy does not allow
// less-than-a-minute updates.
document.getElementById('manual-update').onclick = function () {
  // You call `update()` so offliner starts by checking if there is an update.
  // If so, it downloads the new version and install it **without switching to
  // it**, this switching is called **activation**.
  off.update()
    // If there update process concludes properly, the promise Resolves to
    // the new version.
    .then(function (v) {
      alert('New version ' + v + ' ready to be installed.');
    })
    // If there is a failure or if there is no new version, the promise rejects.
    // The reason passed will be `'no-update-needed'`.
    .catch(function () {
      alert('No new version available...');
    });
};
*/

off.install();

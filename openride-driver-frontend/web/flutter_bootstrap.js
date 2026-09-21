{{flutter_js}}
{{flutter_build_config}}

function showLoadingError() {
  const message = document.getElementById('loading-message');
  if (message) message.textContent = 'OpenRide could not load. Please refresh to try again.';
}

async function bootOpenRide() {
  try {
    await _flutter.loader.load({
      onEntrypointLoaded: async function (engineInitializer) {
        try {
          const runner = await engineInitializer.initializeEngine();
          await runner.runApp();
          document.getElementById('openride-loading')?.remove();
        } catch {
          showLoadingError();
        }
      },
    });
  } catch {
    showLoadingError();
  }
}

bootOpenRide();

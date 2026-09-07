export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let isRefreshing = false;

    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (isRefreshing) return;
        isRefreshing = true;
        window.location.reload();
      });
    }

    const serviceWorkerUrl = new URL("sw.js", document.baseURI);
    const scope = new URL("./", document.baseURI).pathname;
    navigator.serviceWorker.register(serviceWorkerUrl, { scope, updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // The app remains fully usable when service workers are unavailable.
      });
  });
}

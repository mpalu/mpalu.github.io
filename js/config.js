window.SITE_CONFIG = {
  workerEndpoint: "",
  turnstileSiteKey: ""
};

document.addEventListener("DOMContentLoaded", () => {
  const y = document.getElementById("footer-year");
  if (y) y.textContent = new Date().getFullYear();
});

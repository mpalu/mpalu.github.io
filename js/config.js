window.SITE_CONFIG = {
  workerEndpoint: "https://contact.mpalu.io",
  turnstileSiteKey: "0x4AAAAAADGhfRsuS4_23C8_"
};

document.addEventListener("DOMContentLoaded", () => {
  const y = document.getElementById("footer-year");
  if (y) y.textContent = new Date().getFullYear();
});

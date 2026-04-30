(() => {
  "use strict";

  const SUPPORTED_LANGS = ["en", "pt-BR", "sv"];
  const DEFAULT_LANG = "en";
  const STORAGE_KEY = "mpalu.lang";

  const config = (window.SITE_CONFIG || {});
  const WORKER_ENDPOINT = config.workerEndpoint || "";
  const TURNSTILE_SITE_KEY = config.turnstileSiteKey || "";

  function detectLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;

    const nav = (navigator.languages || [navigator.language || DEFAULT_LANG]);
    for (const raw of nav) {
      if (!raw) continue;
      if (SUPPORTED_LANGS.includes(raw)) return raw;
      const base = raw.toLowerCase().split("-")[0];
      if (base === "pt") return "pt-BR";
      if (base === "sv") return "sv";
      if (base === "en") return "en";
    }
    return DEFAULT_LANG;
  }

  function loadTranslations(lang) {
    const bundle = window.__I18N && window.__I18N[lang];
    if (!bundle) throw new Error(`Missing i18n bundle for ${lang}`);
    return bundle;
  }

  // Minimal safe HTML renderer: only allows <em>, <strong>, <br> and strips anything else.
  function renderSafeHtml(str) {
    const allowed = new Set(["EM", "STRONG", "BR"]);
    const doc = new DOMParser().parseFromString("<div>" + str + "</div>", "text/html");
    const frag = document.createDocumentFragment();
    const walk = (src, dst) => {
      src.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          dst.appendChild(document.createTextNode(node.nodeValue));
        } else if (node.nodeType === Node.ELEMENT_NODE && allowed.has(node.tagName)) {
          const clone = document.createElement(node.tagName.toLowerCase());
          walk(node, clone);
          dst.appendChild(clone);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          walk(node, dst);
        }
      });
    };
    walk(doc.body.firstChild, frag);
    return frag;
  }

  function applyTranslations(dict) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = dict[key];
      if (typeof value !== "string") return;
      const attr = el.getAttribute("data-i18n-attr");
      if (attr) {
        el.setAttribute(attr, value);
      } else if (el.getAttribute("data-i18n-html") === "true") {
        el.textContent = "";
        el.appendChild(renderSafeHtml(value));
      } else {
        el.textContent = value;
      }
    });

    document.querySelectorAll("[data-i18n-meta]").forEach((el) => {
      const key = el.getAttribute("data-i18n-meta");
      const value = dict[key];
      if (typeof value === "string") el.setAttribute("content", value);
    });

    if (dict.meta_title) document.title = dict.meta_title;
  }

  function setLanguage(lang, { persist = true } = {}) {
    if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
    try {
      const dict = loadTranslations(lang);
      applyTranslations(dict);
      document.documentElement.lang = lang;
      if (persist) localStorage.setItem(STORAGE_KEY, lang);
      document.querySelectorAll(".lang-switch button").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.lang === lang ? "true" : "false");
      });
      window.__currentDict = dict;
    } catch (err) {
      console.error(err);
      if (lang !== DEFAULT_LANG) setLanguage(DEFAULT_LANG, { persist: false });
    }
  }

  function initLangSwitch() {
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
    });
  }

  // ---- Theme toggle ----

  const THEME_KEY = "mpalu.theme";
  const THEMES = ["dark", "light"];
  const THEME_COLOR = { dark: "#0b0b0d", light: "#fafafa" };

  function applyTheme(theme) {
    if (!THEMES.includes(theme)) theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
    });
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function initThemeToggle() {
    applyTheme(currentTheme());
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = currentTheme() === "light" ? "dark" : "light";
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch {}
      });
    });
  }

  // ---- Contact form ----

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_NAME = 100;
  const MAX_EMAIL = 200;
  const MAX_MSG = 2000;

  function t(key, fallback) {
    const dict = window.__currentDict || {};
    return dict[key] || fallback || key;
  }

  function setFieldError(field, msg) {
    const wrap = field.closest(".form-field");
    if (!wrap) return;
    const errEl = wrap.querySelector(".error-msg");
    if (msg) {
      wrap.classList.add("has-error");
      if (errEl) errEl.textContent = msg;
      field.setAttribute("aria-invalid", "true");
    } else {
      wrap.classList.remove("has-error");
      if (errEl) errEl.textContent = "";
      field.removeAttribute("aria-invalid");
    }
  }

  function validate(form) {
    let ok = true;
    const name = form.elements.name;
    const email = form.elements.email;
    const message = form.elements.message;

    const nameVal = name.value.trim();
    const emailVal = email.value.trim();
    const msgVal = message.value.trim();

    setFieldError(name, "");
    setFieldError(email, "");
    setFieldError(message, "");

    if (!nameVal) { setFieldError(name, t("contact_validation_name_required")); ok = false; }
    else if (nameVal.length > MAX_NAME) { setFieldError(name, t("contact_validation_name_length")); ok = false; }

    if (!emailVal) { setFieldError(email, t("contact_validation_email_required")); ok = false; }
    else if (!EMAIL_RE.test(emailVal) || emailVal.length > MAX_EMAIL) { setFieldError(email, t("contact_validation_email_invalid")); ok = false; }

    if (!msgVal) { setFieldError(message, t("contact_validation_message_required")); ok = false; }
    else if (msgVal.length > MAX_MSG) { setFieldError(message, t("contact_validation_message_length")); ok = false; }

    return ok;
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || "";
    el.classList.remove("success", "error");
    if (kind) el.classList.add(kind);
  }

  function initContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const statusEl = form.querySelector(".form-status");
    const submitBtn = form.querySelector("button[type=submit]");
    const submitLabel = submitBtn.querySelector(".btn-label");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(statusEl, "", null);

      if (!validate(form)) return;

      if (!WORKER_ENDPOINT) {
        setStatus(statusEl, t("contact_error"), "error");
        return;
      }

      const tsResponse = form.elements["cf-turnstile-response"] && form.elements["cf-turnstile-response"].value;
      if (TURNSTILE_SITE_KEY && !tsResponse) {
        setStatus(statusEl, t("contact_turnstile_required"), "error");
        return;
      }

      submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = t("contact_sending");

      const payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        message: form.elements.message.value.trim(),
        hp: form.elements.website ? form.elements.website.value : "",
        turnstileToken: tsResponse || "",
        lang: document.documentElement.lang || DEFAULT_LANG
      };

      try {
        const res = await fetch(WORKER_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStatus(statusEl, t("contact_success"), "success");
        form.reset();
        if (window.turnstile && form.dataset.turnstileWidgetId) {
          window.turnstile.reset(form.dataset.turnstileWidgetId);
        }
      } catch (err) {
        console.error(err);
        setStatus(statusEl, t("contact_error"), "error");
      } finally {
        submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = t("contact_submit");
      }
    });
  }

  window.onTurnstileLoad = function () {
    if (!window.turnstile || !TURNSTILE_SITE_KEY) return;
    const container = document.getElementById("turnstile-container");
    const form = document.getElementById("contact-form");
    if (!container || !form) return;
    const id = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "auto",
      size: "normal"
    });
    form.dataset.turnstileWidgetId = id;
  };

  function injectTurnstile() {
    if (!TURNSTILE_SITE_KEY) return;
    if (document.getElementById("turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initLangSwitch();
    setLanguage(detectLanguage(), { persist: false });
    initContactForm();
    injectTurnstile();
  });
})();

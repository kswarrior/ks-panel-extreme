/* KS Panel website — vanilla JS: nav, reveal, counters, tabs, copy, faq, typing */
(function () {
  "use strict";

  // Mobile menu
  var burger = document.getElementById("burger");
  var mobile = document.getElementById("mobileMenu");
  if (burger && mobile) {
    burger.addEventListener("click", function () {
      mobile.classList.toggle("open");
    });
    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { mobile.classList.remove("open"); });
    });
  }

  // Active nav link
  var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll("[data-nav]").forEach(function (a) {
    var href = (a.getAttribute("href") || "").toLowerCase();
    if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
  });

  // Reveal on scroll
  var els = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && els.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  // Animated counters
  var counters = document.querySelectorAll("[data-count]");
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1200, start = null;
    function step(t) {
      if (!start) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  // Toast
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // Copy buttons (data-copy target selector or data-copy-text)
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy-text") || "";
      var sel = btn.getAttribute("data-copy");
      if (!text && sel) {
        var node = document.querySelector(sel);
        if (node) text = node.innerText || node.textContent || "";
      }
      function done() {
        btn.textContent = "Copied ✓";
        toast("Copied to clipboard");
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text.trim()).then(done).catch(function () { toast("Copy failed"); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = text.trim();
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); }
        document.body.removeChild(ta);
      }
    });
  });

  // Install tabs
  var tabBtns = document.querySelectorAll(".tab-btn");
  var panes = document.querySelectorAll(".tab-pane");
  tabBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      tabBtns.forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      var id = b.getAttribute("data-tab");
      panes.forEach(function (p) { p.style.display = (p.id === id) ? "block" : "none"; });
    });
  });

  // Dashboard-style 3D tilt + spotlight — cards only
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    var TILT_MAX = 8;
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.style.setProperty("--ry", ((px - 0.5) * TILT_MAX * 2).toFixed(2) + "deg");
        card.style.setProperty("--rx", ((0.5 - py) * TILT_MAX * 2).toFixed(2) + "deg");
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });
      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  // Console typing effect  var typeEl = document.getElementById("typed");
  if (typeEl) {
    var lines = [
      "$ docker run -d --name kspanel -p 8080:8080 ghcr.io/ks-panel/kspanel:latest",
      "✓ panel up → http://localhost:8080",
      "$ ./release/ksedge --panel https://panel.example.com --token ••••••",
      "✓ node 'eu-1' connected (docker, kvm ready)",
      "$ ks-panel deploy minecraft-paper --node eu-1",
      "✓ server online — mc.example.com:25565"
    ];
    var li = 0, ci = 0, out = "";
    var cursor = '<span style="color:#22d3ee">▊</span>';
    function tick() {
      if (li >= lines.length) {
        setTimeout(function () { li = 0; out = ""; ci = 0; tick(); }, 5000);
        return;
      }
      var line = lines[li];
      ci++;
      var shown = line.slice(0, ci);
      typeEl.innerHTML = out + shown + cursor;
      if (ci >= line.length) {
        out += line + "\n";
        li++; ci = 0;
        setTimeout(tick, 650);
      } else {
        setTimeout(tick, 18 + Math.random() * 30);
      }
    }
    tick();
  }

  // Footer year + version (tries ../VERSION, falls back to hardcoded)
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  var verEls = document.querySelectorAll("[data-version]");
  fetch("VERSION").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
    t = (t || "").trim();
    if (t) verEls.forEach(function (e) { e.textContent = "v" + t; });
  }).catch(function () { /* keep hardcoded fallback */ });
})();

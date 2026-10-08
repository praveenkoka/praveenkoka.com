// Bottom-right "Talk to Praveen" widget: greets once per visit, remembers if dismissed.
(function () {
  var KEY = "pk-talk-bubble-dismissed";
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var set = function () { try { localStorage.setItem(KEY, "1"); } catch (e) {} };
  var bubble = document.querySelector(".talk-bubble");
  if (!bubble) return;
  if (!get()) setTimeout(function () { bubble.classList.add("show"); }, 2500);
  bubble.querySelector("button").addEventListener("click", function () { bubble.classList.remove("show"); set(); });
  // warm the 3D page's heavy assets once someone shows intent
  var orb = document.querySelector(".talk-orb");
  var warmed = false;
  function warm() {
    if (warmed) return; warmed = true;
    var l = document.createElement("link"); l.rel = "prefetch"; l.href = "/talk/assets/bald_indian.glb"; document.head.appendChild(l);
  }
  orb.addEventListener("pointerenter", warm);
  orb.addEventListener("focus", warm);
})();

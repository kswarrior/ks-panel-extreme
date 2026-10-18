// Hello Slot (file bundle) — dev example frontend bundle.
// Shipped inside the .kspm at "frontend/bundle.js" (the manifest's uiBundle)
// and injected by the panel's slot loader as an ES module when the mod is
// active. React is exposed on window; components publish into window.KS.
(function () {
  var h = window.React.createElement;
  function Banner(props) {
    var text = (props && props.text) || 'Hello from a file-based bundle';
    var tone = (props && props.tone) || 'info';
    var cls = tone === 'warn'
      ? 'border-amber-700/50 bg-amber-900/20 text-amber-200'
      : 'border-sky-700/50 bg-sky-900/20 text-sky-200';
    return h('div', { className: 'rounded-lg border px-3 py-2 text-sm ' + cls }, text);
  }
  window.KS.registerComponent('instance.detail.tabs', 'Banner', Banner);
})();

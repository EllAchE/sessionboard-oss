/**
 * Cicero embeds. Drop one script tag and one div into any page:
 *
 *   <div data-cicero-embed="agenda" data-event="my-conference"></div>
 *   <script src="https://your-cicero-host/embed.js" async></script>
 *
 * The script injects an iframe pointing at a server-rendered route, so the embed shows live data on
 * every page load — there is no snapshot to re-paste when the schedule changes. Height is driven by
 * a postMessage from inside the frame, which is the only way to size cross-origin content without a
 * nested scrollbar.
 *
 * Every `data-*` attribute other than `event` and `embed` is forwarded as a query parameter, so the
 * filter and style options are documented by the admin snippet builder rather than duplicated here.
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var ORIGIN = (function () {
    try {
      return new URL(SCRIPT.src).origin;
    } catch (error) {
      return '';
    }
  })();

  var RESERVED = { ciceroEmbed: 1, event: 1, height: 1 };
  var VIEWS = { agenda: 1, speakers: 1, sessions: 1 };

  function buildSrc(node) {
    var view = node.getAttribute('data-cicero-embed') || 'agenda';
    if (!VIEWS[view]) view = 'agenda';
    var slug = node.getAttribute('data-event');
    if (!slug) return null;

    var url = ORIGIN + '/embed/' + encodeURIComponent(slug) + '/' + view;
    var params = [];
    for (var key in node.dataset) {
      if (!Object.prototype.hasOwnProperty.call(node.dataset, key)) continue;
      if (RESERVED[key]) continue;
      var name = key.replace(/[A-Z]/g, function (c) {
        return '_' + c.toLowerCase();
      });
      params.push(encodeURIComponent(name) + '=' + encodeURIComponent(node.dataset[key]));
    }

    /* A deep link on the host page wins over the attribute, so a shared URL lands on one speaker. */
    var hosted = new URLSearchParams(window.location.search).get('sb-speaker-id');
    if (hosted) params.push('sb-speaker-id=' + encodeURIComponent(hosted));

    return params.length ? url + '?' + params.join('&') : url;
  }

  function mount(node) {
    if (node.getAttribute('data-cicero-mounted')) return;
    var src = buildSrc(node);
    if (!src) return;
    node.setAttribute('data-cicero-mounted', '1');

    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = 'Event ' + (node.getAttribute('data-cicero-embed') || 'agenda');
    frame.loading = 'lazy';
    frame.setAttribute('scrolling', 'no');
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    frame.style.height = (node.getAttribute('data-height') || '600') + 'px';

    node.appendChild(frame);
    frames.push(frame);
  }

  var frames = [];

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'cicero-embed-height') return;
    if (ORIGIN && event.origin !== ORIGIN) return;
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = event.data.height + 'px';
      }
    }
  });

  function scan() {
    var nodes = document.querySelectorAll('[data-cicero-embed]');
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  /* Re-scan so an embed added by a CMS after load still mounts. */
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();

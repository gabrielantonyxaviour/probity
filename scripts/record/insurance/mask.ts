// Page script for the walkthrough recorder: the ERP vendor names carry a "(fictional)" suffix in their stored rows and
// decision 8 says no such wording may be on screen, so the recorder strips it from visible text as the page renders.
// Nothing else is changed: the data, the layout and every number are the product's own.
export const MASK_FICTIONAL = `(() => {
  const RE = /\\s*\\(fictional\\)/gi;
  const fix = (n) => {
    if (n.nodeType === 3) { const v = n.nodeValue; if (v && /\\(fictional\\)/i.test(v)) n.nodeValue = v.replace(RE, ""); }
    else if (n.nodeType === 1) { n.childNodes.forEach(fix); }
  };
  const start = () => {
    fix(document.documentElement);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") fix(m.target); m.addedNodes.forEach(fix); } })
      .observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  };
  if (document.documentElement) start(); else addEventListener("DOMContentLoaded", start);
})();`;

export const HIDE_CHROME = "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}html{scrollbar-width:none}";

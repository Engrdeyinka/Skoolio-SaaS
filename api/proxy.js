/**
 * api/proxy.js — Vercel Serverless Function
 *
 * Fetches an external educational page, strips X-Frame-Options so it can
 * be embedded in an iframe, removes Google AdSense scripts + ad containers,
 * and injects a <base> tag so relative URLs resolve to the original site.
 *
 * Only whitelisted educational domains are allowed.
 */

const ALLOWED_DOMAINS = [
  // ── Original sources ──────────────────────────────
  'classnotes.ng',
  'www.ck12.org', 'ck12.org',
  'www.siyavula.com', 'siyavula.com',
  'openstax.org', 'www.openstax.org',
  'learnenglish.britishcouncil.org',
  'www.bbc.co.uk', 'bbc.co.uk',
  'www.poetryfoundation.org', 'poetryfoundation.org',
  'www.gutenberg.org', 'gutenberg.org',
  'standardebooks.org', 'www.standardebooks.org',
  'musictheory.net', 'www.musictheory.net',
  'apprendre.tv5monde.com',
  'www.biblegateway.com', 'biblegateway.com',
  'code.org', 'www.code.org',

  // ── Nigerian curriculum sites ─────────────────────
  'passnownow.com', 'www.passnownow.com',
  'myschool.ng', 'www.myschool.ng',
  'prepclass.ng', 'www.prepclass.ng',

  // ── Interactive tools ─────────────────────────────
  'www.geogebra.org', 'geogebra.org',
  'phet.colorado.edu',
  'www.desmos.com', 'desmos.com',
  'www.wolframalpha.com', 'wolframalpha.com',

  // ── Reference & subject-specific ─────────────────
  'www.britannica.com', 'britannica.com',
  'www.sparknotes.com', 'sparknotes.com',
  'librivox.org', 'www.librivox.org',
  'hyperphysics.phy-astr.gsu.edu',
  'www.chemguide.co.uk', 'chemguide.co.uk',
  'www.bbc.co.uk', 'bbc.co.uk',
];

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).send('url parameter is required');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(url));
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }

  // Security: only allow whitelisted educational domains
  const isAllowed = ALLOWED_DOMAINS.some(
    (d) => targetUrl.hostname === d || targetUrl.hostname.endsWith('.' + d)
  );
  if (!isAllowed) {
    res.status(403).send('Domain not in allowlist');
    return;
  }

  try {
    const upstream = await fetch(targetUrl.href, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    const contentType = upstream.headers.get('content-type') || 'text/html';

    // For non-HTML assets (CSS, images, fonts, JS) proxy them directly
    if (!contentType.includes('text/html')) {
      const buf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(upstream.status).send(Buffer.from(buf));
      return;
    }

    let html = await upstream.text();

    // 1. Inject <base> so relative URLs resolve against the original domain
    const base = `<base href="${targetUrl.origin}/">`;
    if (!html.includes('<base ')) {
      html = html.replace(/(<head(?:\s[^>]*)?>)/i, `$1${base}`);
    }

    // 2. Strip Google AdSense, DoubleClick, and similar ad network scripts
    html = html.replace(
      /<script[^>]*(?:adsbygoogle|googlesyndication|doubleclick|pagead2|adnxs|taboola|outbrain)[^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
    html = html.replace(
      /<script[^>]*(?:adsbygoogle|googlesyndication|doubleclick|pagead2)[^>]*\/>/gi,
      ''
    );

    // 3. Strip AdSense <ins> ad blocks
    html = html.replace(/<ins\b[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, '');

    // 4. Strip frame-busting JavaScript
    html = html
      .replace(/if\s*\(\s*(?:window\.)?top\s*!==?\s*(?:window\.)?self\s*\)\s*\{[^}]*\}/gi, '')
      .replace(/if\s*\(\s*self\s*===?\s*top\s*\)/gi, 'if (true)');

    // 5. Inject CSS to hide remaining ad containers + cookie banners + reader-mode layout
    const isClassnotes = targetUrl.hostname.includes('classnotes.ng');
    const adCSS = `
<style id="__proxy_ad_hide">
  /* ── Ad & tracking elements ── */
  .adsbygoogle,
  ins.adsbygoogle,
  [class*="ad-wrap"],
  [class*="ad-container"],
  [id*="ad-container"],
  [class*="advertisement"],
  [id*="advertisement"],
  [class*="banner-ad"],
  [id*="banner-ad"],
  .sidebar-ads,
  .header-ad,
  .footer-ad,
  [data-ad-slot],
  .adsense,
  #adsense,
  [class*="sticky-ad"],
  .popup-overlay,
  .cookie-notice,
  .cookie-banner,
  #cookie-consent,
  .newsletter-popup { display: none !important; }

  /* ── Reader-mode: hide site chrome on all proxied pages ── */
  header, .site-header, #masthead, #header, .header,
  nav, .site-nav, #site-navigation, .main-navigation, #navigation,
  .navbar, .topbar, .top-bar, .menu-bar,
  footer, .site-footer, #colophon, #footer, .footer,
  .sidebar, #sidebar, #secondary, .widget-area, .widgets-area,
  .post-navigation, .nav-links, .page-links,
  .comments-area, #comments, .comment-respond,
  .related-posts, .yarpp-related, #yarpp-related,
  .sharedaddy, .sd-sharing, .social-share, .share-buttons,
  .breadcrumbs, .breadcrumb, #breadcrumbs,
  .author-box, .author-bio, #author-box,
  .wp-block-search, .search-form,
  .site-branding, .custom-logo-link,
  .elementor-location-header, .elementor-location-footer,
  [class*="popup"], [id*="popup"],
  [class*="overlay"]:not(.entry-content *),
  [class*="modal"]:not(.entry-content *) { display: none !important; }

  /* ── Make main content fill the frame cleanly ── */
  html, body {
    overflow-x: hidden !important;
    background: #fff !important;
  }
  body {
    margin: 0 !important;
    padding: 0 !important;
  }
  .site, #page, .wrapper, #wrapper, .container, .page-wrapper,
  main, #main, #content, .site-content, #primary {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    float: none !important;
  }
  .entry-content, .post-content, article, .article-content,
  .content-area, .single-content {
    width: 100% !important;
    max-width: 760px !important;
    margin: 0 auto !important;
    padding: 24px 20px !important;
    float: none !important;
    font-size: 1rem !important;
    line-height: 1.75 !important;
    color: #1e293b !important;
  }
  ${isClassnotes ? `
  /* classnotes.ng-specific overrides */
  .jeg_header, .jeg_navbar, .jeg_nav_row, .jeg_nav_top,
  .jeg_footer, .jeg_sidebar, .jeg_aside,
  #jeg_header, #jeg_footer,
  .jeg_block_heading, .jeg_postblock,
  .jeg_ad, .jeg_advertisement { display: none !important; }
  .jeg_content { width: 100% !important; padding: 0 !important; }
  .jeg_inner_content { max-width: 100% !important; padding: 0 20px !important; }
  ` : ''}
</style>`;
    // Fallback: if no </head>, inject before <body>
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${adCSS}\n</head>`);
    } else {
      html = html.replace(/<body/i, `${adCSS}\n<body`);
    }

    // 6. Inject post-load JS to catch dynamic elements (sticky navs, popups, etc.)
    const cleanupJS = `
<script>
(function() {
  var HIDE = [
    'header','#masthead','.site-header','#header',
    'footer','#colophon','.site-footer','#footer',
    'nav','.main-navigation','#site-navigation','#navigation',
    '.sidebar','#sidebar','#secondary','.widget-area',
    '.jeg_header','#jeg_header','.jeg_footer','#jeg_footer',
    '.jeg_sidebar','.jeg_aside','.jeg_block_heading',
    '.jeg_ad','.jeg_advertisement','.jeg_postblock',
    '.comments-area','.post-navigation','.related-posts',
    '.sharedaddy','.author-box','.newsletter-popup',
    '[class*="sticky"]','[id*="popup"]','[class*="popup"]'
  ];
  function hideChrome() {
    HIDE.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.setProperty('display','none','important');
        });
      } catch(e) {}
    });
  }
  document.addEventListener('DOMContentLoaded', hideChrome);
  window.addEventListener('load', hideChrome);
  // Also run after 1s and 2s to catch lazy-loaded elements
  setTimeout(hideChrome, 1000);
  setTimeout(hideChrome, 2000);
})();
</script>`;
    html = html.replace('</body>', `${cleanupJS}\n</body>`);
    if (!html.includes(cleanupJS)) {
      // </body> wasn't found, append at end
      html += cleanupJS;
    }

    // Return clean HTML — deliberately NOT setting X-Frame-Options
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(upstream.status).send(html);
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

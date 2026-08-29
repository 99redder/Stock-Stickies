if (window.location.hostname === 'www.stockstickies.com') {
  const canonicalUrl = new URL(window.location.href)
  canonicalUrl.hostname = 'stockstickies.com'
  window.location.replace(canonicalUrl.toString())
}

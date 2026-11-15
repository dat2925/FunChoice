async function updateDownloadLinks() {
  try {
    const response = await fetch('https://api.github.com/repos/dat2925/FunChoice/releases/latest')
    if (response.status === 404) {
      document.querySelector('[data-download-status]').textContent = 'Chưa có bộ cài công khai.'
      return
    }
    if (!response.ok) return
    const release = await response.json()
    const installer = release.assets?.find((asset) => /^FunChoice[-_][\d.]+[-_]x64-setup\.exe$/i.test(asset.name))
    if (!installer?.browser_download_url?.startsWith('https://github.com/dat2925/FunChoice/releases/download/')) return

    for (const link of document.querySelectorAll('[data-download]')) link.href = installer.browser_download_url
    for (const version of document.querySelectorAll('[data-version]')) version.textContent = '· ' + release.tag_name
  } catch {
    // The fallback links open the latest release if the API is unreachable.
  }
}

void updateDownloadLinks()

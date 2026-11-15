async function updateDownloadLink() {
  try {
    const response = await fetch('https://api.github.com/repos/dat2925/FunChoice/releases/latest')
    if (response.status === 404) {
      document.querySelector('[data-download-status]').textContent = 'Chưa có bộ cài công khai.'
      return
    }
    if (!response.ok) return
    const release = await response.json()
    const setup = release.assets?.find((asset) => /^FunChoice[-_][\d.]+[-_]x64-setup\.exe$/i.test(asset.name))
    if (!setup?.browser_download_url?.startsWith('https://github.com/dat2925/FunChoice/releases/download/')) return
    const download = document.querySelector('[data-download]')
    download.href = setup.browser_download_url
    download.textContent = 'Tải FunChoice cho Windows ↓'
    document.querySelector('[data-version]').textContent = '· ' + release.tag_name
  } catch {
    // Keep the releases link available if the GitHub API is unreachable.
  }
}

void updateDownloadLink()

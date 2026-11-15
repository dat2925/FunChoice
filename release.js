async function updateDownloadLink() {
  try {
    const response = await fetch('https://api.github.com/repos/dat2925/FunChoice/releases/latest')
    if (!response.ok) return
    const release = await response.json()
    const setup = release.assets?.find((asset) => /^FunChoice[-_][\d.]+[-_]x64-setup\.exe$/i.test(asset.name))
    if (!setup?.browser_download_url?.startsWith('https://github.com/dat2925/FunChoice/releases/download/')) return
    document.querySelector('[data-download]').href = setup.browser_download_url
    document.querySelector('[data-version]').textContent = '· ' + release.tag_name
  } catch {
    // The published download in the HTML also works without the GitHub API.
  }
}

void updateDownloadLink()

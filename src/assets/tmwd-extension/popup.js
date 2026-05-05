document.addEventListener('DOMContentLoaded', () => {
  const out = document.getElementById('out');
  const wsStatus = document.getElementById('wsStatus');
  const wsInfo = document.getElementById('wsInfo');

  // Check WS connection status via background
  chrome.runtime.sendMessage({ cmd: 'tabs' }, (resp) => {
    if (resp?.ok) {
      wsStatus.className = 'status ok';
      wsInfo.textContent = `connected (${resp.data?.length ?? 0} tabs)`;
    } else {
      wsStatus.className = 'status err';
      wsInfo.textContent = resp?.error || 'not connected';
    }
  });

  document.getElementById('fetchCookies').addEventListener('click', fetchCookies);
  document.getElementById('clearCookies').addEventListener('click', () => {
    out.textContent = '';
  });
});

async function fetchCookies() {
  const out = document.getElementById('out');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      out.textContent = 'No active tab';
      return;
    }
    const resp = await chrome.runtime.sendMessage({ cmd: 'cookies', url: tab.url });
    if (!resp?.ok) {
      out.textContent = 'Error: ' + (resp?.error || 'unknown');
      return;
    }
    if (!resp.data.length) {
      out.textContent = '(no cookies)';
      return;
    }
    out.textContent = resp.data
      .map(
        (c) =>
          `${c.name}=${c.value}` +
          (c.httpOnly ? ' [H]' : '') +
          (c.secure ? ' [S]' : '') +
          (c.partitionKey ? ' [P]' : ''),
      )
      .join('\n');
    // Copy name=value; format to clipboard
    const str = resp.data.map((c) => `${c.name}=${c.value}`).join('; ');
    await navigator.clipboard.writeText(str);
  } catch (e) {
    out.textContent = 'Error: ' + e.message;
  }
}

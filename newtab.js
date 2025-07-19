const themeSelect = document.getElementById('themeSelect');

// Load theme from storage
chrome.storage.local.get('theme').then(({ theme }) => {
  const selected = theme || 'green';
  document.body.className = 'theme-' + selected;
  themeSelect.value = selected;
});

// Theme change handler
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value;
  document.body.className = 'theme-' + theme;
  chrome.storage.local.set({ theme });
});

// Cycle through themes
function cycleTheme() {
  const themes = ['green', 'amber', 'blue'];
  let current = themeSelect.value;
  let next = themes[(themes.indexOf(current) + 1) % themes.length];
  themeSelect.value = next;
  document.body.className = 'theme-' + next;
  chrome.storage.local.set({ theme: next });
}

const placeholders = [
  "PRESS / TO SEARCH YOUR TABS",
  "PRESS ENTER WHEN TYPING TO SEARCH THE WEB",
  "DOUBLE CLICK A SHORTCUT WHILE IN EDIT MODE TO CHANGE IT",
  "DRAG SHORTCUTS TO REORDER THEM",
  "PRESS T TO SWITCH THE COLOR THEME"
];

const input = document.getElementById("search-input");
let currentPlaceholder = "";
let index = 0;
let typingInterval;
let isTyping = false;



chrome.tabs.onUpdated.addListener(function (tabID, changeinfo, tab) {
  if (tab.url == 'chrome://newtab/' && tab.selected) return; // Dont update needlessly on own load
  if (changeinfo.status == 'complete') refreshTabs();
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  allTabs = allTabs.filter(tab => tab.id !== tabId);
  const grouped = groupTabsByDomain(allTabs);
  refreshTabs(grouped);
});



function createTabElement(tab) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.draggable = true;
  el.dataset.title = (tab.title || '').toLowerCase();
  el.dataset.url = tab.url;
  el.dataset.favIconUrl = tab.favIconUrl;

  // Click to activate
  el.addEventListener('click', (e) => {
    // Avoid triggering when clicking the button
    if (e.target.classList.contains('close-btn') || e.target.classList.contains('pin-btn')) {
      return;
    }
    chrome.tabs.update(tab.id, { active: true });
  });

  const icon = document.createElement('img');
  icon.className = 'favicon';
  icon.src = getFavIcon(tab);
  icon.alt = '';

  const title = document.createElement('span');
  title.textContent = tab.title.toLowerCase() || tab.url;
  title.style.flex = '1';

  const pinBtn = document.createElement('button');
  pinBtn.textContent = tab.pinned ? '[UNPIN]' : '[PIN]';
  pinBtn.className = 'pin-btn';


  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.update(tab.id, { pinned: !tab.pinned });
    // Refresh the UI after pin change
    refreshTabs();
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '[X]';
  closeBtn.className = 'close-btn';

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.remove(tab.id);
    el.remove(); // Remove element instantly
  });

  el.appendChild(icon);
  el.appendChild(title);
  el.appendChild(pinBtn);
  el.appendChild(closeBtn);
  return el;
}

function renderTabs(groups, isFirstRender) {
  const detailsEls = document.querySelectorAll('#tabs > details');
  const container = document.getElementById('tabs');
  container.innerHTML = '';
  for (const domain in groups) {

    const details = document.createElement('details');
    details.className = domain;

    if (!isFirstRender) {
      const detail = Array.from(detailsEls).find(node => node.className == domain);
      details.open = detail ? detail.open : "";
    }
    else {
      details.open = false;
    }
    const summary = document.createElement('summary');
    summary.textContent = `${domain} (${groups[domain].length} tab${groups[domain].length !== 1 ? 's' : ''})`;

    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.src = getFavIcon(groups[domain][0]);
    icon.alt = '';
    summary.prepend(icon);

    const marker = document.createElement('span');
    marker.className = 'marker';
    summary.append(marker);


    details.appendChild(summary);

    const tabList = document.createElement('div');
    tabList.className = 'tab-list';

    for (const tab of groups[domain]) {
      const tabEl = createTabElement(tab);
      tabList.appendChild(tabEl);
    }

    details.appendChild(tabList);
    container.appendChild(details);

  }
}

function refreshTabs(tabs) {
  if (tabs) return renderTabs(tabs, isFirstRender = false);
  chrome.tabs.query({}).then((tabs) => {
    allTabs = groupByFirstDomainSeen(tabs, 'url');
    const grouped = groupTabsByDomain(tabs);
    renderTabs(grouped, isFirstRender = false); // Renders tabs without closing the details
  });
}

function groupTabsByDomain(tabs) {
  const groups = {};
  for (const tab of tabs) {
    try {
      if (!tab.url) {
        tab.url = fixPendingURL(tab.pendingUrl);
      }
      const url = new URL(tab.url);
      const domain = url.hostname.startsWith('www.') ?
        url.hostname.split('www.')[1] : url.hostname;
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(tab);
    } catch (e) {
      console.warn("Invalid URL:", tab);
    }
  }
  return groups;
}

function groupByFirstDomainSeen(arr, key) {
  const grouped = new Map();
  const justTabs = [];
  for (const tab of arr) {
    const host = new URL(tab[key]).hostname; //group by hostname instead of just url
    if (!grouped.has(host)) {
      grouped.set(host, []);
    }
    grouped.get(host).push(tab);
  }
  grouped.forEach((key) => key.forEach(value => justTabs.push(value)));
  return justTabs;
}

// CLOCK
function updateClock() {
  const clock = document.getElementById('clock');
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  clock.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// LOAD & RENDER
let allTabs = [];
chrome.tabs.query({})
  .then((tabs) => {
    allTabs = groupByFirstDomainSeen(tabs, 'url');
    const grouped = groupTabsByDomain(allTabs);
    renderTabs(grouped, isFirstRender = true); // First time rendering tabs
  });

// Load and display Quick Access shortcuts
let isEditMode = false;
function loadQuickShortcuts() {
  chrome.storage.local.get('quickShortcuts').then(({ quickShortcuts }) => {
    const shortcuts = quickShortcuts || [];
    const panel = document.getElementById('shortcutPanel');
    panel.innerHTML = '';

    shortcuts.forEach((s, index) => {
      const btn = document.createElement('div');
      btn.className = 'shortcut';
      if (isEditMode) {
        btn.classList.add('edit-mode');
      }
      btn.draggable = true;

      const link = document.createElement('a');
      link.href = s.url;

      const icon = document.createElement('img');
      icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url)}`;
      loadFavicon(s.url).then((img) => { 
        if (img.naturalHeight == 16) {
          icon.src = '/favicongif.gif'
        }
      });
      icon.alt = '';
      link.prepend(icon);

      // Label span
      const labelSpan = document.createElement('span');
      labelSpan.textContent = s.label;
      link.appendChild(labelSpan);

      btn.appendChild(link);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.className = 'deleteBtn';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shortcuts.splice(index, 1);
        chrome.storage.local.set({ quickShortcuts: shortcuts }).then(loadQuickShortcuts);
      });
      btn.appendChild(delBtn);

      // Prevent opening on click when in edit mode
      btn.addEventListener('click', (e) => {
        if (btn.classList.contains('edit-mode')) {
          e.preventDefault();
        }
      });

      // Inline edit on double click (edit mode only)
      btn.addEventListener('dblclick', (e) => {
        
        if (!btn.classList.contains('edit-mode') || (btn.classList.contains('inline-edit'))) return;
        if (Array.from(panel.childNodes).some(e=> e.classList.contains('inline-edit'))) return;

        e.stopPropagation();
        btn.innerHTML = '';

        btn.classList.add('inline-edit');
        btn.draggable = false;

        const labelInput = document.createElement('input');
        labelInput.className = 'edit-label';
        labelInput.value = s.label;

        const urlInput = document.createElement('input');
        urlInput.className = 'edit-url';
        const urlStored = new URL(s.url);
        urlInput.value = cleanURL(urlStored);

        //Scrolls input to the end of line on mouse click               
        urlInput.addEventListener('click', (e) => handleTextInput(urlInput,e));
        labelInput.addEventListener('click', (e) => handleTextInput(labelInput,e));

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          s.label = labelInput.value.trim();
          s.url = prependHttps(urlInput.value.trim());
          chrome.storage.local.set({ quickShortcuts: shortcuts }).then(loadQuickShortcuts);
        });

        btn.appendChild(labelInput);
        btn.appendChild(urlInput);
        btn.appendChild(saveBtn);
      });

      // Drag/drop handlers
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        btn.classList.add('dragging');
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
      });

      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        btn.style.border = '2px dashed var(--theme-color)';
      });
      btn.addEventListener('dragleave', () => {
        btn.style.border = '';
      });
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.style.border = '';

        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = index;

        if (fromIndex === toIndex) return;

        const moved = shortcuts.splice(fromIndex, 1)[0];
        shortcuts.splice(toIndex, 0, moved);
        chrome.storage.local.set({ quickShortcuts: shortcuts }).then(loadQuickShortcuts);
      });

      panel.appendChild(btn);
    });
  });
}

// Add shortcut
document.getElementById('addQuickShortcut').addEventListener('click', () => {
  const label = document.getElementById('shortcutLabel').value.trim();
  const urlTrim = document.getElementById('shortcutUrl').value.trim();
  const url = urlTrim ? prependHttps(urlTrim) : urlTrim;

  if (!label || !url) {
    alert('Please enter both label and URL.');
    return;
  }

  chrome.storage.local.get('quickShortcuts').then(({ quickShortcuts }) => {
    const shortcuts = quickShortcuts || [];
    shortcuts.push({ label, url });
    chrome.storage.local.set({ quickShortcuts: shortcuts }).then(() => {
      document.getElementById('shortcutLabel').value = '';
      document.getElementById('shortcutUrl').value = '';
      loadQuickShortcuts();
    });
  });
});

// Toggle Edit mode
document.getElementById('editShortcutsBtn').addEventListener('click', () => {
  isEditMode = !isEditMode;
  const panel = document.getElementById('shortcutPanel');
  const shortcuts = panel.querySelectorAll('.shortcut');
  shortcuts.forEach(s => {
    if (isEditMode) {
      s.classList.add('edit-mode');
    } else {
      s.classList.remove('edit-mode');
    }
  });
  document.getElementById('editShortcutsBtn').textContent = isEditMode ? '[DONE]' : '[EDIT]';

  const inputs = document.getElementById('shortcutInputs');
  inputs.style.display = isEditMode ? 'flex' : 'none';
});

// Load on startup
loadQuickShortcuts();
// SEARCH
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.textContent.trim().toLowerCase();
  const allGroups = document.querySelectorAll('#tabs > details');

  // HIDE QUICK SHORTCUTS ON SEARCH
  const quickPanel = document.getElementById('quickAccess');
  quickPanel.style.display = query ? 'none' : 'block';

  allGroups.forEach(details => {
    const tabList = details.querySelector('.tab-list');
    const tabs = Array.from(tabList.querySelectorAll('.tab'));

    if (!query) {
      tabs.forEach(tab => {
        tab.style.display = '';
        const titleEl = tab.querySelector('span');
        const original = titleEl.dataset.original;
        if (original) {
          titleEl.textContent = original;
          delete titleEl.dataset.original;
        }
      });
      details.style.display = '';
      details.open = false;
      return;
    }

    const matchingTabs = tabs.filter(tab => {
      const title = tab.dataset.title || '';
      const url = tab.dataset.url || '';
      return title.includes(query) || url.includes(query);
    });

    tabs.forEach(tab => {
      tab.style.display = 'none';
    });

    matchingTabs.sort((a, b) => {
      const titleA = a.dataset.title;
      const titleB = b.dataset.title;
      return titleA.localeCompare(titleB);
    });

    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape for RegExp
    const regex = new RegExp(`(${safeQuery})`, 'gi');

    matchingTabs.forEach(tab => {
      tab.style.display = '';
      tabList.appendChild(tab);

      const titleEl = tab.querySelector('span');
      const rawTitle = titleEl.dataset.original || titleEl.textContent;

      // Store original if not already stored
      if (!titleEl.dataset.original) {
        titleEl.dataset.original = rawTitle;
      }

      // Escape HTML before highlighting
      const escapedTitle = escapeHTML(rawTitle);
      const highlighted = escapedTitle.replace(regex, '<span class="highlight">$1</span>');

      titleEl.innerHTML = highlighted;
    });

    if (matchingTabs.length === 0) {
      details.style.display = 'none';
    } else {
      details.style.display = '';
      details.open = true;
    }
  });
});

document.getElementById('collapseAll').addEventListener('click', () => {
  document.querySelectorAll('#tabs > details').forEach(el => el.open = false);
});

document.getElementById('expandAll').addEventListener('click', () => {
  document.querySelectorAll('#tabs > details').forEach(el => el.open = true);
});


document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.id === 'search-input') return;

  if (e.key === '[') {
    document.querySelectorAll('#tabs > details').forEach(el => el.open = false);

  } else if (e.key === ']') {
    document.querySelectorAll('#tabs > details').forEach(el => el.open = true);

  } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('search-input').focus();

  } else if (e.key === 't' || e.key === 'T') {
    cycleTheme();
  } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
    document.getElementById('save').click();
  } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    document.getElementById('load').click();
  }
});

//DEFAULT SEARCH ENGINE
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.textContent.trim();
    if (query) {
      chrome.search.query({
        text: query
      });
    }
  }
});


// Save groups to storage
document.getElementById('save').addEventListener('click', () => {
  const groups = {};
  const detailsEls = document.querySelectorAll('#tabs > details');
  detailsEls.forEach((details) => {
    const domain = details.querySelector('summary').textContent;
    domain.favIconUrl = details.querySelector('summary');
    const tabs = [];
    details.querySelectorAll('.tab').forEach((tabEl) => {
      tabs.push({
        url: tabEl.dataset.url,
        title: tabEl.dataset.title,
        favIconUrl: tabEl.dataset.favIconUrl
      });
    });
    groups[domain] = tabs;
  });

  chrome.storage.local.set({ savedGroups: groups }).then(() => {
    alert('Groups saved!');
  });
});

// Load groups from storage
document.getElementById('load').addEventListener('click', () => {
  chrome.storage.local.get('savedGroups').then((data) => {
    if (data.savedGroups) {
      renderSavedGroups(data.savedGroups);
    } else {
      alert('No saved groups found.');
    }
  });
});

// Render saved groups (URLs only, since IDs are stale)
function renderSavedGroups(savedGroups) {
  const container = document.getElementById('tabs');
  container.innerHTML = '';

  for (const domain in savedGroups) {
    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = domain;

    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.src = savedGroups[domain][0].favIconUrl || 'https://www.mozilla.org/media/protocol/img/logos/firefox/browser/logo-md.3f5f8412e4b0.png';
    icon.alt = '';
    summary.prepend(icon);


    details.appendChild(summary);

    const tabList = document.createElement('div');
    tabList.className = 'tab-list';

    for (const saved of savedGroups[domain]) {
      const el = document.createElement('div');
      el.className = 'tab';
      el.dataset.title = saved.title;
      el.dataset.url = saved.url;

      const icon = document.createElement('img');
      icon.className = 'favicon';
      icon.src = savedGroups[domain][0].favIconUrl || 'https://www.mozilla.org/media/protocol/img/logos/firefox/browser/logo-md.3f5f8412e4b0.png';
      icon.alt = '';

      const title = document.createElement('span');
      title.textContent = saved.title || saved.url;
      title.style.flex = '1';

      const openBtn = document.createElement('button');
      openBtn.textContent = '[OPEN]';
      openBtn.style.marginLeft = '0.5em';
      openBtn.style.background = 'transparent';
      openBtn.style.border = 'none';
      openBtn.style.color = '#0f0';
      openBtn.style.font = 'inherit';
      openBtn.style.cursor = 'pointer';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: saved.url });
      });

      el.appendChild(icon);
      el.appendChild(title);
      el.appendChild(openBtn);

      tabList.appendChild(el);
    }

    details.appendChild(tabList);
    container.appendChild(details);
  }
}

function handleTextInput(textInput,event){         
          if(event.detail == 1){ // If 1 click only select and scroll to end of text
          textInput.focus();
          textInput.scrollLeft = textInput.scrollWidth;
          textInput.setSelectionRange(textInput.value.length, textInput.value.length);
          }   
}

//Escape HTML
function escapeHTML(str) {
  return str.replace(/[&<>"'`=\/]/g, (s) => {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#x60;',
      '=': '&#x3D;',
      '/': '&#x2F;',
    })[s];
  });
}
function prependHttps(url) {
  return url.startsWith("http://") || url.startsWith("https://") ?
    url : new URL("https://" + url).href;
}

function cleanURL(urlIn) {
  const url = new URL(urlIn);
  if (url.search) {
    return url.hostname + url.pathname + url.search;
  }
  return url.pathname.length > 1 ?
    url.hostname + url.pathname : url.hostname;
}
function fixPendingURL(url) {
  const formattedUrl = new URL(url);
  return formattedUrl;
}
function getFavIcon(tab) {
  if (tab.favIconUrl) {
    return tab.favIconUrl;
  }
  const url = new URL(tab.url);
  if (url?.protocol.startsWith('http')) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}`;
  }
  return '/favicongif.gif';
}

function loadFavicon(url) {
  return new Promise((resolve, reject) => {
    const sizeQuery = '&sz=64';
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}${sizeQuery}`;
  });
}


function getRandomPlaceholder() {
  let next;
  do {
    next = placeholders[Math.floor(Math.random() * placeholders.length)];
  } while (next === currentPlaceholder); // Avoid immediate repeat
  return next;
}

function typePlaceholder() {
  if (isTyping || input.textContent.trim() !== "" || document.activeElement === input) return;

  isTyping = true;
  input.classList.add("placeholder");

  const placeholder = getRandomPlaceholder();

  typingInterval = setInterval(() => {
    input.textContent += placeholder[index++];
    if (index >= placeholder.length) {
      clearInterval(typingInterval);
      isTyping = false;

      setTimeout(() => {
        if (
          document.activeElement !== input &&
          input.textContent.trim() === placeholder
        ) {
          input.textContent = "";
          index = 0;
          typePlaceholder();
        }
      }, 3000);
    }
  }, 100);
}

function stopTyping() {
  clearInterval(typingInterval);
  isTyping = false;
  input.classList.remove("placeholder");
  input.textContent = "";
  index = 0;
}

input.addEventListener("focus", stopTyping);
input.addEventListener("input", stopTyping);
input.addEventListener("blur", () => {
  if (input.textContent.trim() === "") {
    typePlaceholder();
  }
});

typePlaceholder(); // kickstart


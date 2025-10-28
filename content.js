// Chat Bookmark Extension - Content Script

class ChatBookmark {
  constructor() {
    this.bookmarks = [];
    this.floatingButton = null;
    this.bookmarkPanel = null;
    this.init();
  }

  init() {
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.createFloatingButton();
    this.createBookmarkPanel();
    this.loadBookmarks();
    this.setupKeyboardShortcuts();
  }

  createFloatingButton() {
    // Create floating button for quick bookmark
    this.floatingButton = document.createElement('div');
    this.floatingButton.id = 'chat-bookmark-btn';
    this.floatingButton.innerHTML = '📌';
    this.floatingButton.title = 'Click: Jump to latest | Double-click: Show all | Cmd+B: Jump to latest | Cmd+Click or Triple-click: Add bookmark';

    let clickTimeout = null;

    this.floatingButton.addEventListener('click', (e) => {
      // Prevent single click when double-clicking
      if (clickTimeout) {
        return;
      }

      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        // Single click - jump to latest bookmark and delete it
        this.jumpToLatestAndDelete();
      }, 250);
    });

    this.floatingButton.addEventListener('dblclick', (e) => {
      // Clear single click timeout
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      // Double click - show all bookmarks
      this.toggleBookmarkPanel();
    });

    document.body.appendChild(this.floatingButton);
  }

  jumpToLatestAndDelete() {
    if (this.bookmarks.length === 0) {
      return;
    }

    // Get the latest bookmark
    const latestBookmark = this.bookmarks[this.bookmarks.length - 1];

    // Jump to it
    this.jumpToBookmark(latestBookmark);

    // Delete it after a short delay
    setTimeout(() => {
      this.deleteBookmark(latestBookmark.id);
    }, 500);
  }

  toggleBookmarkPanel() {
    if (this.bookmarkPanel.style.display === 'none') {
      this.bookmarkPanel.style.display = 'flex';
    } else {
      this.bookmarkPanel.style.display = 'none';
    }
  }

  createBookmarkPanel() {
    // Create panel to show bookmarks
    this.bookmarkPanel = document.createElement('div');
    this.bookmarkPanel.id = 'chat-bookmark-panel';
    this.bookmarkPanel.style.display = 'none'; // Hidden by default
    this.bookmarkPanel.innerHTML = `
      <div class="bookmark-header">
        <span>Bookmarks</span>
        <button id="clear-bookmarks">Clear</button>
      </div>
      <div id="bookmark-list"></div>
    `;

    document.body.appendChild(this.bookmarkPanel);

    // Clear all bookmarks
    document.getElementById('clear-bookmarks').addEventListener('click', () => {
      if (confirm('Clear all bookmarks?')) {
        this.clearAllBookmarks();
      }
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.bookmarkPanel.style.display !== 'none') {
        if (!this.bookmarkPanel.contains(e.target) &&
            !e.target.closest('#chat-bookmark-btn')) {
          this.bookmarkPanel.style.display = 'none';
        }
      }
    });
  }

  setBookmarkAtElement(element) {
    const timestamp = Date.now();
    const markerId = `bookmark-marker-${timestamp}`;

    // Create a visible marker in the DOM
    const marker = document.createElement('div');
    marker.id = markerId;
    marker.className = 'chat-bookmark-marker';
    marker.innerHTML = '📌';
    marker.title = 'Bookmark';

    // Make marker clickable to remove it
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      const bookmark = this.bookmarks.find(b => b.markerId === markerId);
      if (bookmark && confirm('Delete this bookmark?')) {
        this.deleteBookmark(bookmark.id);
      }
    });

    // Check if we're in a code block - if so, find the code block container
    let codeBlock = element.closest('pre, code, [class*="code"]');
    let targetElement;

    if (codeBlock) {
      // For code blocks, place marker before the entire code block
      targetElement = codeBlock;
    } else {
      // Find the best element to bookmark
      targetElement = element;
      let levelsUp = 0;
      const maxLevels = 5; // Limit how far we traverse up

      // Try to find a parent that's a meaningful content block, but don't go too far
      while (targetElement && targetElement !== document.body && levelsUp < maxLevels) {
        const tagName = targetElement.tagName.toLowerCase();
        const hasContent = targetElement.textContent.trim().length > 20;

        // Look for paragraph, heading, or specific message-related elements
        if ((tagName === 'p' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3' ||
             tagName === 'li' || tagName === 'blockquote') && hasContent) {
          break;
        }

        // Stop at common message container classes
        const className = targetElement.className || '';
        if (className.includes('message') || className.includes('Message') ||
            className.includes('content') || className.includes('text')) {
          break;
        }

        targetElement = targetElement.parentElement;
        levelsUp++;
      }

      if (!targetElement || targetElement === document.body) {
        targetElement = element;
      }
    }

    // Insert marker right before the target element
    if (targetElement.parentNode) {
      targetElement.parentNode.insertBefore(marker, targetElement);

      const preview = targetElement.textContent.trim();
      const previewText = preview.substring(0, 100) + (preview.length > 100 ? '...' : '');

      const bookmark = {
        id: timestamp,
        markerId: markerId,
        preview: previewText,
        time: new Date().toLocaleTimeString()
      };

      this.bookmarks.push(bookmark);
      this.saveBookmarks();
      this.renderBookmarks();
    }
  }

  jumpToBookmark(bookmark) {
    // Find the marker element
    const marker = document.getElementById(bookmark.markerId);

    if (marker) {
      // Scroll to the marker
      marker.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  deleteBookmark(bookmarkId) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);

    // Remove the marker from DOM
    if (bookmark) {
      const marker = document.getElementById(bookmark.markerId);
      if (marker) {
        marker.remove();
      }
    }

    this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId);
    this.saveBookmarks();
    this.renderBookmarks();
  }

  clearAllBookmarks() {
    // Remove all markers from DOM
    this.bookmarks.forEach(bookmark => {
      const marker = document.getElementById(bookmark.markerId);
      if (marker) {
        marker.remove();
      }
    });

    this.bookmarks = [];
    this.saveBookmarks();
    this.renderBookmarks();
  }

  renderBookmarks() {
    const listContainer = document.getElementById('bookmark-list');

    if (this.bookmarks.length === 0) {
      listContainer.innerHTML = '<div class="no-bookmarks">No bookmarks yet. Cmd+Click or Triple-click to create one.</div>';
      return;
    }

    listContainer.innerHTML = this.bookmarks.map(bookmark => `
      <div class="bookmark-item" data-id="${bookmark.id}">
        <div class="bookmark-content">
          <div class="bookmark-preview" title="${bookmark.preview}">
            ${bookmark.preview}
          </div>
          <span class="bookmark-time">${bookmark.time}</span>
        </div>
        <button class="bookmark-delete" data-id="${bookmark.id}">−</button>
      </div>
    `).join('');

    // Make entire card clickable to jump and delete
    listContainer.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't jump if clicking delete button
        if (e.target.classList.contains('bookmark-delete')) {
          return;
        }
        const id = parseInt(item.dataset.id);
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (bookmark) {
          this.jumpToBookmark(bookmark);
          // Delete after jumping
          setTimeout(() => {
            this.deleteBookmark(id);
          }, 500);
        }
      });
    });

    // Delete button handlers
    listContainer.querySelectorAll('.bookmark-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        const id = parseInt(e.target.dataset.id);
        this.deleteBookmark(id);
      });
    });
  }

  setupKeyboardShortcuts() {
    let clickCount = 0;
    let clickTimer = null;

    // Command+B to jump to latest bookmark
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        this.jumpToLatestAndDelete();
      }
    });

    // Command+Click (or Ctrl+Click) OR Triple-click anywhere to create bookmark
    document.addEventListener('click', (e) => {
      // Skip if clicking on our own UI
      if (e.target.closest('#chat-bookmark-panel') || e.target.closest('#chat-bookmark-btn')) {
        return;
      }

      // Command+Click creates bookmark immediately
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        this.setBookmarkAtElement(e.target);
        return;
      }

      // Triple-click detection
      clickCount++;

      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 600); // Reset after 600ms
      } else if (clickCount === 3) {
        clearTimeout(clickTimer);
        clickCount = 0;
        e.preventDefault();
        e.stopPropagation();
        this.setBookmarkAtElement(e.target);
      }
    }, true); // Use capture phase to intercept before other handlers
  }

  saveBookmarks() {
    const key = `bookmarks_${window.location.pathname}`;
    chrome.storage.local.set({ [key]: this.bookmarks });
  }

  loadBookmarks() {
    const key = `bookmarks_${window.location.pathname}`;
    chrome.storage.local.get([key], (result) => {
      this.bookmarks = result[key] || [];
      this.renderBookmarks();

      // Try to restore markers in the DOM by finding matching text
      this.bookmarks.forEach(bookmark => {
        this.restoreMarker(bookmark);
      });
    });
  }

  restoreMarker(bookmark) {
    // Check if marker already exists
    if (document.getElementById(bookmark.markerId)) {
      return;
    }

    // Try to find the text in the current page
    const allElements = document.querySelectorAll('p, div[class*="message"], div[class*="Message"], article, section');

    for (let el of allElements) {
      if (el.textContent.includes(bookmark.preview.substring(0, 50))) {
        const marker = document.createElement('div');
        marker.id = bookmark.markerId;
        marker.className = 'chat-bookmark-marker';
        marker.innerHTML = '📌';
        marker.title = 'Bookmark';

        // Make marker clickable to remove it
        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Delete this bookmark?')) {
            this.deleteBookmark(bookmark.id);
          }
        });

        // Insert marker
        el.parentNode.insertBefore(marker, el);
        break;
      }
    }
  }

}

// Initialize the extension
new ChatBookmark();

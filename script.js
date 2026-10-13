'use strict';

/*
  BACKEND HOOKS (replace with your own endpoints):
  GET  /api/me                      current user (200 = logged in)
  POST /api/login, /api/register, /api/logout
  GET  /api/categories              [{id, name, description}]
  GET  /api/categories/{id}         {name, description}
  GET  /api/categories/{id}/threads /api/threads/latest /api/users/{id}/threads
       -> [{id, title, author, author_id, author_avatar, category, last_activity, reply_count}]
  GET  /api/threads/{id}            {title, body, author, author_id, author_avatar, created}
  GET  /api/threads/{id}/replies    [{author, author_id, author_avatar, created, body}]
  POST /api/threads, /api/threads/{id}/replies, /api/settings
  GET  /api/users/{id}              {username, bio, joined, avatar}   ({id} defaults to "me")
*/

const param = (key) => new URLSearchParams(location.search).get(key);
const withId = (url) => url.replace('{id}', encodeURIComponent(param('id') || (url.startsWith('/api/users/') ? 'me' : '')));
const needsItemId = (url) => url.includes('{id}') && !param('id') && !url.startsWith('/api/users/');
const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

function showBackendNotice(message) {
  const main = document.getElementById('main');
  if (!main) return;
  let notice = main.querySelector('.backend-notice');
  if (!notice) {
    notice = document.createElement('aside');
    notice.className = 'backend-notice';
    notice.setAttribute('role', 'status');
    main.prepend(notice);
  }
  if (![...notice.children].some((item) => item.textContent === message)) {
    const detail = document.createElement('p');
    detail.textContent = message;
    notice.append(detail);
  }
}

/* ---------- Layout (header and footer shared by every page) ---------- */
function renderLayout() {
  document.getElementById('site-header').innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap bar">
        <a class="brand" href="index.html"><img src="Screenshot 2026-10-13 192901.png" alt="" width="32" height="32"><span>Aking Forum</span></a>
        <button type="button" id="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav id="site-nav" aria-label="Main">
          <ul>
            <li><a href="index.html">Home</a></li>
            <li><a href="index.html#categories-heading">Categories</a></li>
            <li><a href="index.html#latest-heading">Threads</a></li>
            <li><a href="threadnew.html">New thread</a></li>
          </ul>
          <ul id="auth-links">
            <li><a href="Login.html">Log in</a></li>
            <li><a class="btn" href="Registration.html">Register</a></li>
            <li><a href="profile.html">Profile</a></li>
            <li><a href="setting.html">Settings</a></li>
          </ul>
        </nav>
      </div>
    </header>`;
  document.getElementById('site-footer').innerHTML =
    '<footer class="site-footer"><div class="wrap"><p>&copy; 2026 Aking Forum</p></div></footer>';

  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#site-nav a').forEach((a) => {
    if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page');
  });
  document.getElementById('nav-toggle').addEventListener('click', (e) => {
    const open = document.getElementById('site-nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
}

async function renderAuthLinks() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) {
      showBackendNotice(`The authentication API returned HTTP ${res.status}. Live Server serves the front end only; connect a backend to enable sign-in and account features.`);
      return;
    }
    document.getElementById('auth-links').innerHTML =
      '<li><a href="profile.html">Profile</a></li>' +
      '<li><a href="setting.html">Settings</a></li>' +
      '<li><button type="button" id="logout" class="linklike">Log out</button></li>';
    document.getElementById('logout').addEventListener('click', async () => {
      // BACKEND HOOK: end the session here
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken() } });
      location.href = 'Login.html';
    });
  } catch {
    showBackendNotice('The authentication API is unavailable. Live Server serves the front end only; connect a backend to enable sign-in and account features.');
  }
}

/* ---------- Data loading (no fake data: empty states show until your API answers) ---------- */
async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

// Fills elements marked data-field / data-value / data-src / data-href. Uses textContent, so it is XSS-safe.
function fill(root, item) {
  root.querySelectorAll('[data-field]').forEach((el) => { el.textContent = item[el.dataset.field] ?? ''; });
  root.querySelectorAll('[data-value]').forEach((el) => { el.value = item[el.dataset.value] ?? ''; });
  root.querySelectorAll('[data-src]').forEach((el) => { if (item[el.dataset.src]) el.src = item[el.dataset.src]; });
  root.querySelectorAll('[data-href]').forEach((el) => {
    el.href = el.dataset.href.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(item[key] ?? ''));
  });
}

async function loadLists() {
  for (const box of document.querySelectorAll('[data-list]')) {
    const empty = box.parentElement.querySelector('.empty');
    if (needsItemId(box.dataset.list)) {
      showBackendNotice('Open a category, thread, or profile from its link to provide the required item ID.');
      continue;
    }
    try {
      const items = await getJson(withId(box.dataset.list));
      const template = box.querySelector('template');
      items.forEach((item) => {
        const node = template.content.cloneNode(true);
        fill(node, item);
        box.append(node);
      });
      if (empty) empty.hidden = items.length > 0;
    } catch (error) {
      showBackendNotice(`Forum data could not be loaded${error.status ? ` (HTTP ${error.status})` : ''}. Live Server serves static files only; connect the matching API endpoint to load categories, threads, replies, and profiles.`);
    }
  }
}

async function loadDetails() {
  for (const box of document.querySelectorAll('[data-detail]')) {
    if (needsItemId(box.dataset.detail)) {
      showBackendNotice('Open this item from its link to provide the required ID.');
      continue;
    }
    try {
      fill(box, await getJson(withId(box.dataset.detail)));
    } catch (error) {
      showBackendNotice(`Forum data could not be loaded${error.status ? ` (HTTP ${error.status})` : ''}. Live Server serves static files only; connect the matching API endpoint to load this content.`);
    }
  }
}

/* ---------- Forms ---------- */
const ALLOWED_IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function checkPasswords(form) {
  const { password, password_confirm: confirm } = form.elements;
  if (password && confirm) confirm.setCustomValidity(password.value === confirm.value ? '' : 'Passwords do not match.');
}

function setupImagePreview(input) {
  const preview = document.getElementById(input.dataset.preview);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (!ALLOWED_IMAGES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      input.setCustomValidity('Use a PNG, JPG, or WebP image up to 2 MB.');
      input.reportValidity();
      input.setCustomValidity('');
      input.value = '';
      return;
    }
    if (preview) preview.src = URL.createObjectURL(file);
  });
}

async function submitForm(form) {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('[type="submit"]');
  const show = (message, ok) => { status.textContent = message; status.className = `form-status ${ok ? 'ok' : 'error'}`; };
  if (needsItemId(form.dataset.api)) {
    show('Open the thread first so its ID is included in the reply request.', false);
    return;
  }
  button.disabled = true;
  try {
    // BACKEND HOOK: data-api is the endpoint; FormData carries every field (and files).
    const res = await fetch(withId(form.dataset.api), {
      method: 'POST',
      body: new FormData(form),
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error || (res.status === 404 || res.status === 405
        ? `The required backend API is not available (HTTP ${res.status}).`
        : `The request failed (HTTP ${res.status}). Please try again.`);
      show(message, false);
      if (res.status === 404 || res.status === 405) {
        showBackendNotice('This form needs a server API. Live Server cannot process account, thread, reply, or settings submissions.');
      }
      return;
    }
    show(data.message || 'Done.', true);
    if (form.dataset.success === 'reload') location.reload();
    else if (form.dataset.success) location.href = form.dataset.success;
  } catch {
    show('Cannot reach the server. Please try again.', false);
    showBackendNotice('This form needs a server API. Live Server cannot process account, thread, reply, or settings submissions.');
  } finally {
    button.disabled = false;
  }
}

function setupForms() {
  document.querySelectorAll('form[data-api]').forEach((form) => {
    form.addEventListener('input', () => checkPasswords(form));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      checkPasswords(form);
      if (form.reportValidity()) submitForm(form);
    });
  });
  document.querySelectorAll('input[type="file"][data-preview]').forEach(setupImagePreview);
}

renderLayout();
renderAuthLinks();
setupForms();
loadDetails();
loadLists();
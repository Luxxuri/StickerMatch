import { evaluateMatch, parseHex, safeFilenameToken, solveAdaptive, toHex } from './color-engine.js';

const STORAGE = {
  colors: 'stickermatch.saved-colors.v1',
  history: 'stickermatch.calibration-history.v1',
  roblox: 'stickermatch.roblox-oauth.v1'
};

const byId = id => document.getElementById(id);
const elements = {
  status: byId('status'),
  imageInput: byId('image-input'),
  imageInfo: byId('image-info'),
  dropZone: byId('drop-zone'),
  preview: byId('preview-canvas'),
  previewEmpty: byId('preview-empty'),
  exportButton: byId('export-button'),
  exportName: byId('export-name'),
  targetHex: byId('target-hex'),
  targetColor: byId('target-color'),
  renderedHex: byId('rendered-hex'),
  renderedColor: byId('rendered-color'),
  backgroundHex: byId('background-hex'),
  backgroundColor: byId('background-color'),
  syncTarget: byId('sync-target'),
  matchScore: byId('match-score'),
  matchDelta: byId('match-delta'),
  calculate: byId('calculate-button'),
  resultCard: byId('result-card'),
  resultHex: byId('result-hex'),
  resultStrategy: byId('result-strategy'),
  matchName: byId('match-name'),
  savedColors: byId('saved-colors'),
  robloxState: byId('roblox-state'),
  robloxSetup: byId('roblox-setup'),
  oauthClientId: byId('oauth-client-id'),
  creatorType: byId('creator-type'),
  creatorId: byId('creator-id'),
  creatorIdLabel: byId('creator-id-label'),
  redirectUrl: byId('redirect-url'),
  robloxLogin: byId('roblox-login'),
  robloxUpload: byId('roblox-upload'),
  textureResult: byId('texture-result'),
  textureId: byId('texture-id'),
  moderationState: byId('moderation-state')
};

const previewContext = elements.preview.getContext('2d', { alpha: false });
let savedColors = loadJson(STORAGE.colors, []);
let calibrationHistory = loadJson(STORAGE.history, []);
let robloxSettings = loadJson(STORAGE.roblox, { clientId: '', creatorType: 'User', creatorId: '' });
let activeSavedColor = null;
let sticker = null;
let lastExport = null;
let exportSequence = 0;

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` ${type}` : ''}`;
}

function currentColors() {
  return {
    target: parseHex(elements.targetHex.value),
    rendered: parseHex(elements.renderedHex.value),
    background: parseHex(elements.backgroundHex.value)
  };
}

function setColor(role, color, detach = true) {
  const hex = typeof color === 'string' ? toHex(parseHex(color)) : toHex(color);
  elements[`${role}Hex`].value = hex;
  elements[`${role}Color`].value = hex;
  if (detach && (role === 'target' || role === 'background')) checkActiveSavedColor();
  updateMatchScore();
  if (role === 'background') drawPreview();
}

function bindColor(role) {
  const hexInput = elements[`${role}Hex`];
  const colorInput = elements[`${role}Color`];
  colorInput.addEventListener('input', () => {
    setColor(role, colorInput.value);
    if (role === 'target' && elements.syncTarget.checked) setColor('background', colorInput.value);
  });
  hexInput.addEventListener('change', () => {
    const parsed = parseHex(hexInput.value);
    if (!parsed) {
      setStatus(`Enter a valid ${role} HEX color.`, 'error');
      return;
    }
    setColor(role, parsed);
    if (role === 'target' && elements.syncTarget.checked) setColor('background', parsed);
  });
}

function updateMatchScore() {
  const { target, rendered } = currentColors();
  if (!target || !rendered) return;
  const match = evaluateMatch(target, rendered);
  elements.matchScore.textContent = `${Math.round(match.percentage)}% · ${match.rating}`;
  elements.matchDelta.textContent = `ΔE ${match.deltaE.toFixed(2)}`;
}

function checkActiveSavedColor() {
  if (!activeSavedColor) return;
  const { target, background } = currentColors();
  if (!target || !background || toHex(target) !== activeSavedColor.targetHex || toHex(background) !== activeSavedColor.backgroundHex) {
    activeSavedColor = null;
  }
}

function refreshSavedColors(selectedName = '') {
  savedColors.sort((left, right) => left.name.localeCompare(right.name));
  elements.savedColors.replaceChildren();
  if (!savedColors.length) {
    elements.savedColors.add(new Option('No saved colors', ''));
    return;
  }
  elements.savedColors.add(new Option('Choose a saved color', ''));
  for (const match of savedColors) elements.savedColors.add(new Option(match.name, match.name));
  elements.savedColors.value = selectedName;
}

function saveColorMatch() {
  const name = elements.matchName.value.trim();
  const { target, background } = currentColors();
  if (!name) {
    setStatus('Enter a name in Match name before saving.', 'error');
    elements.matchName.focus();
    return;
  }
  if (!target || !background) {
    setStatus('Target and background must contain valid HEX colors.', 'error');
    return;
  }
  let match = savedColors.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    match = {};
    savedColors.push(match);
  }
  Object.assign(match, {
    name,
    targetHex: toHex(target),
    backgroundHex: toHex(background),
    savedUtc: new Date().toISOString()
  });
  saveJson(STORAGE.colors, savedColors);
  activeSavedColor = match;
  refreshSavedColors(name);
  setStatus(`Saved color match “${name}”.`, 'success');
}

function loadColorMatch() {
  const match = savedColors.find(item => item.name === elements.savedColors.value);
  if (!match) {
    setStatus('Choose a saved color first.', 'error');
    return;
  }
  elements.syncTarget.checked = false;
  elements.matchName.value = match.name;
  setColor('target', match.targetHex, false);
  setColor('background', match.backgroundHex, false);
  activeSavedColor = match;
  setStatus(`Loaded “${match.name}”. Import a sticker and export it immediately.`, 'success');
}

function deleteColorMatch() {
  const name = elements.savedColors.value;
  if (!name) {
    setStatus('Choose a saved color first.', 'error');
    return;
  }
  savedColors = savedColors.filter(item => item.name !== name);
  saveJson(STORAGE.colors, savedColors);
  if (activeSavedColor?.name === name) activeSavedColor = null;
  elements.matchName.value = '';
  refreshSavedColors();
  setStatus(`Deleted “${name}”.`);
}

async function loadSticker(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('Choose a PNG, WebP, or JPEG image.', 'error');
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The browser could not read this image.'));
      image.src = objectUrl;
    });
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  sticker = {
    image,
    file,
    stem: file.name.replace(/\.[^.]+$/, '') || 'Sticker',
    width: image.naturalWidth,
    height: image.naturalHeight
  };
  exportSequence = 0;
  lastExport = null;
  elements.exportButton.disabled = false;
  elements.preview.style.display = 'block';
  elements.previewEmpty.hidden = true;
  elements.imageInfo.textContent = `${file.name} · ${sticker.width} × ${sticker.height}`;
  elements.exportName.textContent = 'Ready to export';
  drawPreview();
  updateRobloxButtons();
  setStatus(activeSavedColor ? `Sticker loaded with saved color “${activeSavedColor.name}”.` : 'Sticker loaded. Export it, test it, then pick the rendered color.', 'success');
}

function drawPreview() {
  if (!sticker) return;
  const background = parseHex(elements.backgroundHex.value);
  if (!background) return;
  elements.preview.width = sticker.width;
  elements.preview.height = sticker.height;
  previewContext.fillStyle = toHex(background);
  previewContext.fillRect(0, 0, sticker.width, sticker.height);
  previewContext.drawImage(sticker.image, 0, 0, sticker.width, sticker.height);
}

function canvasBlob() {
  return new Promise((resolve, reject) => {
    elements.preview.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not create the PNG.')), 'image/png');
  });
}

async function exportSticker() {
  if (!sticker) return;
  const background = parseHex(elements.backgroundHex.value);
  if (!background) {
    setStatus('Enter a valid background HEX color.', 'error');
    return;
  }
  drawPreview();
  const blob = await canvasBlob();
  exportSequence += 1;
  const fallback = toHex(background).slice(1);
  const token = activeSavedColor && activeSavedColor.targetHex === toHex(parseHex(elements.targetHex.value)) && activeSavedColor.backgroundHex === toHex(background)
    ? safeFilenameToken(activeSavedColor.name, fallback)
    : fallback;
  const stem = safeFilenameToken(sticker.stem, 'Sticker');
  const name = `${stem}-StickerMatch-${String(exportSequence).padStart(2, '0')}-${token}.png`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  lastExport = { blob, name, background: toHex(background) };
  elements.exportName.textContent = name;
  elements.textureResult.hidden = true;
  updateRobloxButtons();
  setStatus(`Exported ${name}. Test that file, then pick the rendered background.`, 'success');
}

function calculateCorrection() {
  const { target, rendered, background } = currentColors();
  if (!target || !rendered || !background) {
    setStatus('Target, rendered, and background must contain valid HEX colors.', 'error');
    return;
  }
  if (sticker && (!lastExport || lastExport.background !== toHex(background))) {
    setStatus('Export this background before calculating from a new rendered measurement.', 'error');
    return;
  }
  const sample = {
    source: background,
    rendered,
    target,
    timestamp: new Date().toISOString()
  };
  const targetHex = toHex(target);
  const sameTarget = calibrationHistory
    .filter(item => item.targetHex === targetHex)
    .map(item => ({ source: parseHex(item.sourceHex), rendered: parseHex(item.renderedHex), target: parseHex(item.targetHex) }))
    .filter(item => item.source && item.rendered && item.target);
  const profileHistory = calibrationHistory
    .filter(item => item.targetHex !== targetHex)
    .map(item => ({ source: parseHex(item.sourceHex), rendered: parseHex(item.renderedHex), target: parseHex(item.targetHex) }))
    .filter(item => item.source && item.rendered && item.target);
  const result = solveAdaptive([...sameTarget, sample], target, profileHistory);
  calibrationHistory.push({
    sourceHex: toHex(background),
    renderedHex: toHex(rendered),
    targetHex,
    correctedHex: toHex(result.corrected),
    timestamp: sample.timestamp,
    strategy: result.strategy
  });
  calibrationHistory = calibrationHistory.slice(-250);
  saveJson(STORAGE.history, calibrationHistory);
  elements.syncTarget.checked = false;
  setColor('background', result.corrected);
  elements.resultHex.textContent = toHex(result.corrected);
  elements.resultStrategy.textContent = result.warning ? `${result.strategy}. ${result.warning}` : result.strategy;
  elements.resultCard.hidden = false;
  lastExport = null;
  updateRobloxButtons();
  setStatus(result.matched ? 'The measured color is already within tolerance.' : 'Correction ready. Export this background and test it again.', 'success');
}

async function pickFromScreen(role) {
  if (!window.EyeDropper) {
    setStatus('This browser does not support the system eyedropper. Use the color square or enter a HEX value.', 'error');
    return;
  }
  try {
    const result = await new EyeDropper().open();
    setColor(role, result.sRGBHex);
    if (role === 'target' && elements.syncTarget.checked) setColor('background', result.sRGBHex);
    setStatus(`Picked ${result.sRGBHex.toUpperCase()} for ${role}.`);
  } catch (error) {
    if (error.name !== 'AbortError') setStatus(`Could not pick a color: ${error.message}`, 'error');
  }
}

function copyText(value, successMessage) {
  navigator.clipboard.writeText(value).then(
    () => setStatus(successMessage, 'success'),
    () => setStatus('Clipboard access was blocked. Select and copy the value manually.', 'error')
  );
}

function getRedirectUri() {
  const url = new URL('.', window.location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function refreshRobloxSettings() {
  elements.oauthClientId.value = robloxSettings.clientId || '';
  elements.creatorType.value = robloxSettings.creatorType === 'Group' ? 'Group' : 'User';
  elements.creatorId.value = robloxSettings.creatorId || '';
  elements.redirectUrl.value = getRedirectUri();
  updateCreatorLabel();
  updateRobloxButtons();
}

function updateCreatorLabel() {
  elements.creatorIdLabel.textContent = elements.creatorType.value === 'Group' ? 'Roblox group ID' : 'Roblox user ID';
}

function saveRobloxSettings() {
  const clientId = elements.oauthClientId.value.trim();
  const creatorId = elements.creatorId.value.trim();
  if (clientId && !/^\d+$/.test(clientId)) {
    setStatus('The OAuth client ID must be numeric.', 'error');
    return false;
  }
  if (creatorId && !/^\d+$/.test(creatorId)) {
    setStatus('The Roblox creator ID must be numeric.', 'error');
    return false;
  }
  robloxSettings = { clientId, creatorType: elements.creatorType.value, creatorId };
  saveJson(STORAGE.roblox, robloxSettings);
  setStatus('Roblox OAuth setup saved in this browser.', 'success');
  return true;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function robloxLogin() {
  if (!saveRobloxSettings()) return;
  if (!robloxSettings.clientId) {
    elements.robloxSetup.open = true;
    setStatus('Enter the OAuth client ID before signing in.', 'error');
    return;
  }
  if (!window.isSecureContext) {
    setStatus('Roblox sign-in requires the secure GitHub Pages site.', 'error');
    return;
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem('stickermatch.oauth-verifier', verifier);
  sessionStorage.setItem('stickermatch.oauth-state', state);
  const authorize = new URL('https://apis.roblox.com/oauth/v1/authorize');
  authorize.search = new URLSearchParams({
    client_id: robloxSettings.clientId,
    redirect_uri: getRedirectUri(),
    scope: 'openid asset:read asset:write',
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  });
  window.location.assign(authorize);
}

function activeAccessToken() {
  const token = sessionStorage.getItem('stickermatch.oauth-access-token');
  const expires = Number(sessionStorage.getItem('stickermatch.oauth-expires') || 0);
  return token && Date.now() < expires ? token : null;
}

async function handleOAuthCallback() {
  const query = new URLSearchParams(window.location.search);
  if (query.has('error')) {
    setStatus(`Roblox sign-in was not completed: ${query.get('error_description') || query.get('error')}`, 'error');
    history.replaceState({}, '', getRedirectUri());
    return;
  }
  const code = query.get('code');
  if (!code) return;
  const state = query.get('state');
  const expectedState = sessionStorage.getItem('stickermatch.oauth-state');
  const verifier = sessionStorage.getItem('stickermatch.oauth-verifier');
  if (!state || state !== expectedState || !verifier || !robloxSettings.clientId) {
    setStatus('Roblox sign-in could not be verified. Start the sign-in again.', 'error');
    history.replaceState({}, '', getRedirectUri());
    return;
  }
  setStatus('Finishing Roblox sign-in…');
  try {
    const response = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: robloxSettings.clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: getRedirectUri()
      })
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || `HTTP ${response.status}`);
    sessionStorage.setItem('stickermatch.oauth-access-token', body.access_token);
    sessionStorage.setItem('stickermatch.oauth-expires', String(Date.now() + Math.max(60, (body.expires_in || 900) - 30) * 1000));
    sessionStorage.removeItem('stickermatch.oauth-state');
    sessionStorage.removeItem('stickermatch.oauth-verifier');
    history.replaceState({}, '', getRedirectUri());
    await fillSignedInUser(body.access_token);
    setStatus('Connected to Roblox for this browser session.', 'success');
  } catch (error) {
    history.replaceState({}, '', getRedirectUri());
    setStatus(`Roblox sign-in failed: ${error.message}`, 'error');
  }
  updateRobloxButtons();
}

async function fillSignedInUser(token) {
  try {
    const response = await fetch('https://apis.roblox.com/oauth/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const user = await response.json();
    if (robloxSettings.creatorType === 'User' && user.sub) {
      robloxSettings.creatorId = String(user.sub);
      saveJson(STORAGE.roblox, robloxSettings);
      elements.creatorId.value = robloxSettings.creatorId;
    }
  } catch {
    // The creator ID can still be entered manually.
  }
}

function updateRobloxButtons() {
  const connected = Boolean(activeAccessToken());
  elements.robloxState.textContent = connected ? 'Connected' : 'Not connected';
  elements.robloxState.classList.toggle('connected', connected);
  elements.robloxLogin.textContent = connected ? 'Reconnect Roblox' : 'Sign in with Roblox';
  elements.robloxUpload.disabled = !connected || !lastExport;
}

function readRobloxError(body, fallback) {
  if (typeof body?.message === 'string') return body.message;
  if (typeof body?.error?.message === 'string') return body.error.message;
  if (typeof body?.errorMessage === 'string') return body.errorMessage;
  if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message;
  return fallback;
}

async function uploadTexture() {
  const token = activeAccessToken();
  if (!token) {
    setStatus('Sign in with Roblox again before uploading.', 'error');
    updateRobloxButtons();
    return;
  }
  if (!lastExport) {
    setStatus('Export the current sticker before creating a texture.', 'error');
    return;
  }
  if (!saveRobloxSettings()) return;
  if (!/^\d+$/.test(robloxSettings.creatorId)) {
    elements.robloxSetup.open = true;
    setStatus(`Enter a valid Roblox ${robloxSettings.creatorType === 'Group' ? 'group' : 'user'} ID.`, 'error');
    return;
  }
  const creator = robloxSettings.creatorType === 'Group'
    ? { groupId: robloxSettings.creatorId }
    : { userId: robloxSettings.creatorId };
  const metadata = {
    assetType: 'Image',
    displayName: lastExport.name.replace(/\.png$/i, '').slice(0, 50),
    description: 'Created by StickerMatch',
    creationContext: { creator }
  };
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('fileContent', lastExport.blob, lastExport.name);
  elements.robloxUpload.disabled = true;
  elements.textureResult.hidden = true;
  setStatus(`Uploading ${lastExport.name} to Roblox…`);
  try {
    const response = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const body = await response.json();
    if (!response.ok) throw new Error(readRobloxError(body, `HTTP ${response.status}`));
    const operationPath = body.path;
    if (!operationPath) throw new Error('Roblox accepted the file but did not return an operation ID.');
    const asset = await waitForTexture(operationPath, token);
    const textureId = String(asset.assetId || '');
    if (!/^\d+$/.test(textureId)) throw new Error('Roblox completed the upload without a texture ID.');
    if (asset.assetType && !String(asset.assetType).toUpperCase().endsWith('IMAGE')) throw new Error('Roblox returned a non-image asset.');
    elements.textureId.textContent = textureId;
    elements.moderationState.textContent = formatModeration(asset.moderationResult?.moderationState || 'Processing');
    elements.textureResult.hidden = false;
    setStatus(`Roblox texture created. Texture ID: ${textureId}`, 'success');
  } catch (error) {
    setStatus(`Roblox upload failed: ${error.message}`, 'error');
  } finally {
    updateRobloxButtons();
  }
}

async function waitForTexture(operationPath, token) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await fetch(`https://apis.roblox.com/assets/v1/${operationPath.replace(/^\//, '')}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(readRobloxError(body, `HTTP ${response.status}`));
    if (body.error) throw new Error(readRobloxError(body.error, 'The asset operation failed.'));
    if (body.done) {
      if (!body.response) throw new Error('The upload completed without texture information.');
      return body.response;
    }
  }
  throw new Error('Roblox is still processing the texture. Try again in a moment.');
}

function formatModeration(value) {
  const readable = String(value).replace(/^MODERATION_STATE_/i, '').replaceAll('_', ' ').toLowerCase();
  return `Moderation: ${readable.charAt(0).toUpperCase()}${readable.slice(1)}`;
}

bindColor('target');
bindColor('rendered');
bindColor('background');
refreshSavedColors();
refreshRobloxSettings();
updateMatchScore();

elements.imageInput.addEventListener('change', () => loadSticker(elements.imageInput.files[0]));
elements.dropZone.addEventListener('dragover', event => { event.preventDefault(); elements.dropZone.classList.add('dragging'); });
elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragging'));
elements.dropZone.addEventListener('drop', event => {
  event.preventDefault();
  elements.dropZone.classList.remove('dragging');
  loadSticker(event.dataTransfer.files[0]);
});
elements.exportButton.addEventListener('click', () => exportSticker().catch(error => setStatus(error.message, 'error')));
elements.calculate.addEventListener('click', calculateCorrection);
elements.syncTarget.addEventListener('change', () => {
  if (elements.syncTarget.checked) setColor('background', elements.targetHex.value);
});
document.querySelectorAll('.pick-button').forEach(button => button.addEventListener('click', () => pickFromScreen(button.dataset.role)));
if (!window.EyeDropper) document.querySelectorAll('.pick-button').forEach(button => { button.textContent = 'Enter manually'; button.disabled = true; });
byId('copy-result').addEventListener('click', () => copyText(elements.resultHex.textContent, `Copied ${elements.resultHex.textContent}.`));
byId('save-color').addEventListener('click', saveColorMatch);
byId('load-color').addEventListener('click', loadColorMatch);
byId('delete-color').addEventListener('click', deleteColorMatch);
byId('clear-history').addEventListener('click', () => {
  if (!calibrationHistory.length || window.confirm('Clear all calibration history stored in this browser?')) {
    calibrationHistory = [];
    saveJson(STORAGE.history, calibrationHistory);
    setStatus('Calibration history cleared.');
  }
});
elements.creatorType.addEventListener('change', updateCreatorLabel);
byId('save-roblox-settings').addEventListener('click', saveRobloxSettings);
byId('copy-redirect').addEventListener('click', () => copyText(elements.redirectUrl.value, 'Copied the OAuth redirect URL.'));
elements.robloxLogin.addEventListener('click', robloxLogin);
elements.robloxUpload.addEventListener('click', uploadTexture);
byId('copy-texture-id').addEventListener('click', () => copyText(elements.textureId.textContent, `Copied texture ID ${elements.textureId.textContent}.`));

await handleOAuthCallback();
updateRobloxButtons();

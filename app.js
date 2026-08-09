import { evaluateMatch, parseHex, safeFilenameToken, solveAdaptive, toHex } from './color-engine.js';

const STORAGE = {
  colors: 'stickermatch.saved-colors.v1',
  history: 'stickermatch.calibration-history.v1'
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
  savedColors: byId('saved-colors')
};

const previewContext = elements.preview.getContext('2d', { alpha: false });
let savedColors = loadJson(STORAGE.colors, []);
let calibrationHistory = loadJson(STORAGE.history, []);
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

bindColor('target');
bindColor('rendered');
bindColor('background');
refreshSavedColors();
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

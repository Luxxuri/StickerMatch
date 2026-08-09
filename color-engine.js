const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function parseHex(value) {
  let hex = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map(char => char + char).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

export function toHex(color) {
  return `#${[color.r, color.g, color.b]
    .map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function rgbToOklab(color) {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

export function oklabToRgb(color) {
  const lRoot = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const mRoot = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const sRoot = color.l - 0.0894841775 * color.a - 1.291485548 * color.b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  const clipped = linear.some(value => value < 0 || value > 1);
  const [r, g, b] = linear.map(value => Math.round(linearToSrgb(clamp(value, 0, 1)) * 255));
  return { color: { r, g, b }, clipped };
}

const labSubtract = (left, right) => ({ l: left.l - right.l, a: left.a - right.a, b: left.b - right.b });
const labAdd = (left, right) => ({ l: left.l + right.l, a: left.a + right.a, b: left.b + right.b });
const labScale = (color, scale) => ({ l: color.l * scale, a: color.a * scale, b: color.b * scale });
const labLength = color => Math.hypot(color.l, color.a, color.b);
const labArray = color => [color.l, color.a, color.b];

function normalizeDegrees(value) {
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

export function evaluateMatch(target, rendered) {
  const targetLab = rgbToOklab(target);
  const renderedLab = rgbToOklab(rendered);
  const delta = labSubtract(targetLab, renderedLab);
  const deltaE = labLength(delta) * 100;
  const percentage = clamp(100 * Math.exp(-deltaE / 20), 0, 100);
  const targetChroma = Math.hypot(targetLab.a, targetLab.b);
  const renderedChroma = Math.hypot(renderedLab.a, renderedLab.b);
  const hue = normalizeDegrees(
    Math.atan2(targetLab.b, targetLab.a) * 180 / Math.PI -
    Math.atan2(renderedLab.b, renderedLab.a) * 180 / Math.PI
  );
  const rating = deltaE <= 1.2 ? 'Excellent' : deltaE <= 3 ? 'Very Good' : deltaE <= 6 ? 'Acceptable' : deltaE <= 12 ? 'Noticeable' : 'Poor';
  return {
    deltaE,
    percentage,
    rating,
    lightnessError: (targetLab.l - renderedLab.l) * 100,
    chromaError: (targetChroma - renderedChroma) * 100,
    hueError: hue
  };
}

export function solveLinear(source, observed, target) {
  const sourceChannels = [source.r, source.g, source.b].map(value => srgbToLinear(value / 255));
  const observedChannels = [observed.r, observed.g, observed.b].map(value => srgbToLinear(value / 255));
  const targetChannels = [target.r, target.g, target.b].map(value => srgbToLinear(value / 255));
  const gains = [];
  let clipped = false;
  let unstable = false;
  const corrected = sourceChannels.map((sourceValue, index) => {
    let gain;
    if (sourceValue <= 1e-6) {
      unstable = true;
      gain = observedChannels[index] <= 1e-6 ? 1 : observedChannels[index] / 1e-6;
    } else {
      gain = observedChannels[index] / sourceValue;
    }
    if (gain <= 1e-6) {
      unstable = true;
      gain = 1e-6;
    }
    gains.push(gain);
    const value = targetChannels[index] / gain;
    clipped ||= value < 0 || value > 1;
    return Math.round(linearToSrgb(clamp(value, 0, 1)) * 255);
  });
  return {
    corrected: { r: corrected[0], g: corrected[1], b: corrected[2] },
    gains,
    clipped,
    warning: unstable
      ? 'A near-black source channel cannot be calibrated reliably from one sample.'
      : clipped ? 'The ideal result exceeds the RGB range, so one or more channels were clipped.' : null,
    strategy: 'Initial measured inverse',
    matched: false
  };
}

function accelerateSecondPass(first, second, baseline, target) {
  const firstSource = [first.source.r, first.source.g, first.source.b];
  const secondSource = [second.source.r, second.source.g, second.source.b];
  const baselineChannels = [baseline.r, baseline.g, baseline.b];
  const rendered = [second.rendered.r, second.rendered.g, second.rendered.b];
  const targetChannels = [target.r, target.g, target.b];
  const result = [];
  let accelerated = 0;

  for (let channel = 0; channel < 3; channel += 1) {
    if (Math.abs(rendered[channel] - targetChannels[channel]) <= 2) {
      result[channel] = secondSource[channel];
      continue;
    }
    const firstStep = secondSource[channel] - firstSource[channel];
    const secondStep = baselineChannels[channel] - secondSource[channel];
    const firstMagnitude = Math.abs(firstStep);
    const secondMagnitude = Math.abs(secondStep);
    if (firstStep * secondStep <= 0 || firstMagnitude < 3 || secondMagnitude < 0.5 || secondMagnitude >= firstMagnitude) {
      result[channel] = baselineChannels[channel];
      continue;
    }
    const denominator = secondStep - firstStep;
    if (Math.abs(denominator) < 0.5) {
      result[channel] = baselineChannels[channel];
      continue;
    }
    let estimatedLimit = firstSource[channel] - firstStep * firstStep / denominator;
    const direction = Math.sign(secondStep);
    if (!Number.isFinite(estimatedLimit) || (estimatedLimit - baselineChannels[channel]) * direction < 0) {
      result[channel] = baselineChannels[channel];
      continue;
    }
    const maximumExtrapolation = Math.max(6, secondMagnitude * 2.5);
    estimatedLimit = baselineChannels[channel] + direction * Math.min(Math.abs(estimatedLimit - baselineChannels[channel]), maximumExtrapolation);
    const contraction = secondMagnitude / firstMagnitude;
    const damping = clamp((contraction - 0.25) / 0.70, 0, 0.55);
    result[channel] = baselineChannels[channel] + (estimatedLimit - baselineChannels[channel]) * damping;
    if (damping >= 0.05) accelerated += 1;
  }
  return accelerated ? { r: Math.round(result[0]), g: Math.round(result[1]), b: Math.round(result[2]) } : null;
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function multiply(matrix, vector) {
  return matrix.map(row => dot(row, vector));
}

function solveThreeByThree(matrix, right) {
  const augmented = matrix.map((row, index) => [...row, right[index]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (Math.abs(augmented[best][pivot]) < 1e-9) return null;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column < 4; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column < 4; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return [augmented[0][3], augmented[1][3], augmented[2][3]];
}

function regularizedLeastSquares(matrix, target) {
  const normal = Array.from({ length: 3 }, () => [0, 0, 0]);
  const right = [0, 0, 0];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let k = 0; k < 3; k += 1) normal[row][column] += matrix[k][row] * matrix[k][column];
      if (row === column) normal[row][column] += 0.015;
    }
    for (let k = 0; k < 3; k += 1) right[row] += matrix[k][row] * target[k];
  }
  return solveThreeByThree(normal, right);
}

export function solveAdaptive(history, target, profileHistory = []) {
  if (!history.length) throw new Error('At least one measured pass is required.');
  const current = history.at(-1);
  const baseline = solveLinear(current.source, current.rendered, target);
  const targetLab = rgbToOklab(target);
  const renderedLab = rgbToOklab(current.rendered);
  const currentError = labLength(labSubtract(targetLab, renderedLab));
  const quality = evaluateMatch(target, current.rendered);

  let best = history[0];
  let bestError = Infinity;
  for (const sample of history) {
    const error = labLength(labSubtract(targetLab, rgbToOklab(sample.rendered)));
    if (error < bestError) {
      best = sample;
      bestError = error;
    }
  }
  if (currentError <= 0.012) {
    return { ...baseline, corrected: current.source, strategy: 'Perceptual match locked', matched: true, quality };
  }
  if (best !== current && bestError + 0.003 < currentError) {
    return { ...baseline, corrected: best.source, strategy: 'Restored best measured source', matched: bestError <= 0.012, quality };
  }

  if (history.length <= 2) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const sample of profileHistory) {
      if (evaluateMatch(sample.target, sample.rendered).deltaE > 12) continue;
      const distance = labLength(labSubtract(targetLab, rgbToOklab(sample.rendered)));
      if (distance < nearestDistance) {
        nearest = sample;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance <= 0.12) {
      const estimate = labAdd(rgbToOklab(nearest.source), labSubtract(targetLab, rgbToOklab(nearest.rendered)));
      const converted = oklabToRgb(estimate);
      return {
        ...baseline,
        corrected: converted.color,
        clipped: baseline.clipped || converted.clipped,
        strategy: history.length === 1 ? 'Profile-guided first pass' : 'Profile-guided local refinement',
        quality
      };
    }
  }

  if (history.length === 1) return { ...baseline, quality };
  if (history.length === 2) {
    const accelerated = accelerateSecondPass(history[0], current, baseline.corrected, target);
    if (accelerated) return { ...baseline, corrected: accelerated, strategy: 'Accelerated two-pass response estimate', quality };
  }

  const jacobian = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let lastStep = 0;
  for (let index = 1; index < history.length; index += 1) {
    const previousSource = rgbToOklab(history[index - 1].source);
    const nextSource = rgbToOklab(history[index].source);
    const previousRendered = rgbToOklab(history[index - 1].rendered);
    const nextRendered = rgbToOklab(history[index].rendered);
    const inputDelta = labArray(labSubtract(nextSource, previousSource));
    const outputDelta = labArray(labSubtract(nextRendered, previousRendered));
    const lengthSquared = dot(inputDelta, inputDelta);
    if (lengthSquared < 0.000025) continue;
    lastStep = Math.sqrt(lengthSquared);
    const predicted = multiply(jacobian, inputDelta);
    const residual = outputDelta.map((value, channel) => value - predicted[channel]);
    const denominator = lengthSquared + 0.0004;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        jacobian[row][column] = clamp(jacobian[row][column] + residual[row] * inputDelta[column] / denominator, -4, 4);
      }
    }
  }
  const desired = labArray(labSubtract(targetLab, renderedLab));
  const sourceStep = regularizedLeastSquares(jacobian, desired) ?? desired;
  const sourceStepLength = Math.sqrt(dot(sourceStep, sourceStep));
  const maximumStep = clamp(lastStep * 1.5, 0.035, 0.14);
  if (sourceStepLength > maximumStep) {
    const scale = maximumStep / sourceStepLength;
    for (let index = 0; index < 3; index += 1) sourceStep[index] *= scale;
  }
  const candidate = labAdd(rgbToOklab(current.source), { l: sourceStep[0], a: sourceStep[1], b: sourceStep[2] });
  const stable = rgbToOklab(baseline.corrected);
  const departure = labSubtract(candidate, stable);
  const bounded = labLength(departure) > 0.045 ? labAdd(stable, labScale(departure, 0.045 / labLength(departure))) : candidate;
  const converted = oklabToRgb(bounded);
  return {
    ...baseline,
    corrected: converted.color,
    clipped: baseline.clipped || converted.clipped,
    strategy: `Adaptive OKLab response model (${history.length} measured passes)`,
    quality
  };
}

export function safeFilenameToken(name, fallback) {
  const token = String(name ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '');
  return token || fallback;
}

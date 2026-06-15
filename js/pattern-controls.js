const controls = [...document.querySelectorAll('[data-pattern-control]')];

const formatValue = (prop, value) => {
  if (prop === 'scale') return `${Number(value).toFixed(2)}x`;
  return `${Math.round(Number(value))}px`;
};

const cssValue = (prop, value) => {
  if (prop === 'scale') return String(Number(value).toFixed(2));
  return `${Math.round(Number(value))}px`;
};

const updateControl = (control) => {
  const { layer, prop } = control.dataset;
  const target = document.querySelector(`.pattern-layer-${layer}`);
  const output = control.closest('.pattern-control')?.querySelector('output');
  if (!target) return;

  target.style.setProperty(`--layer-${prop}`, cssValue(prop, control.value));
  if (output) output.value = formatValue(prop, control.value);
};

controls.forEach((control) => {
  updateControl(control);
  control.addEventListener('input', () => updateControl(control));
});

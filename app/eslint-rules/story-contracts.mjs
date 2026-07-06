const globalInputEvents = new Set([
  'wheel',
  'mousewheel',
  'touchstart',
  'touchmove',
  'touchend',
  'keydown',
  'keyup',
  'pointerdown',
  'pointermove',
  'pointerup'
]);

const visualMachineContextFields = new Set(['progress', 'opacity', 'transform']);

function isSceneFile(filename) {
  return filename.includes('/src/scenes/') || filename.includes('\\src\\scenes\\');
}

function propertyName(node) {
  if (!node) {
    return undefined;
  }
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function isGlobalListenerTarget(node) {
  if (!node) {
    return false;
  }
  if (node.type === 'Identifier') {
    return node.name === 'window' || node.name === 'document' || node.name === 'globalThis';
  }
  if (node.type === 'MemberExpression') {
    return propertyName(node.property) === 'window' || propertyName(node.property) === 'document';
  }
  return false;
}

function reportContextFields(context, objectExpression) {
  for (const property of objectExpression.properties ?? []) {
    if (property.type !== 'Property') {
      continue;
    }
    const name = propertyName(property.key);
    if (name && visualMachineContextFields.has(name)) {
      context.report({
        node: property.key,
        message: `Machine context must not store visual field "${name}". Keep progress/opacity/transform in GSAP or view state.`
      });
    }
  }
}

const plugin = {
  meta: {
    name: 'story-contracts'
  },
  rules: {
    'no-scene-global-input-listeners': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow scene modules from owning global input listeners.'
        },
        schema: []
      },
      create(context) {
        if (!isSceneFile(context.filename)) {
          return {};
        }

        return {
          CallExpression(node) {
            if (node.callee.type !== 'MemberExpression') {
              return;
            }
            if (propertyName(node.callee.property) !== 'addEventListener') {
              return;
            }
            if (!isGlobalListenerTarget(node.callee.object)) {
              return;
            }

            const firstArgument = node.arguments[0];
            if (firstArgument?.type !== 'Literal' || typeof firstArgument.value !== 'string') {
              return;
            }
            if (!globalInputEvents.has(firstArgument.value)) {
              return;
            }

            context.report({
              node,
              message: 'Scene modules must not register global input listeners; route input through the Director.'
            });
          }
        };
      }
    },
    'no-machine-context-visual-fields': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow visual progress fields inside XState machine context.'
        },
        schema: []
      },
      create(context) {
        return {
          Property(node) {
            if (propertyName(node.key) !== 'context') {
              return;
            }

            if (node.value.type === 'ObjectExpression') {
              reportContextFields(context, node.value);
              return;
            }

            if (
              node.value.type === 'ArrowFunctionExpression' &&
              node.value.body.type === 'ObjectExpression'
            ) {
              reportContextFields(context, node.value.body);
            }
          }
        };
      }
    }
  }
};

export default plugin;

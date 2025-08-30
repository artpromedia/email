/**
 * ESLint custom rule to prevent static buttons without proper onClick handlers
 * This prevents static buttons that don't perform any action
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow buttons with undefined onClick handlers or missing onClick',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    hasSuggestions: true,
    schema: [],
    messages: {
      staticButton:
        'Buttons must have a proper onClick handler. Found undefined or missing onClick.',
      addOnClick:
        'Add a proper onClick handler that calls an API, opens a drawer, or performs an action.',
    },
  },

  create(context) {
    return {
      // JSX Elements (React/TSX)
      JSXElement(node) {
        if (node.openingElement.name.name === 'button') {
          const onClickAttr = node.openingElement.attributes.find(
            (attr) => attr.name && attr.name.name === 'onClick'
          );

          // Check if button has no onClick at all
          if (!onClickAttr) {
            const typeAttr = node.openingElement.attributes.find(
              (attr) => attr.name && attr.name.name === 'type'
            );

            // Allow buttons with type="submit" (form buttons)
            if (
              typeAttr &&
              typeAttr.value &&
              typeAttr.value.value === 'submit'
            ) {
              return;
            }

            context.report({
              node: node.openingElement,
              messageId: 'staticButton',
              suggest: [
                {
                  messageId: 'addOnClick',
                },
              ],
            });
            return;
          }

          // Check if onClick is explicitly undefined
          if (onClickAttr.value) {
            if (onClickAttr.value.type === 'JSXExpressionContainer') {
              const expression = onClickAttr.value.expression;

              // Check for onClick={undefined}
              if (
                expression.type === 'Identifier' &&
                expression.name === 'undefined'
              ) {
                context.report({
                  node: onClickAttr,
                  messageId: 'staticButton',
                  suggest: [
                    {
                      messageId: 'addOnClick',
                    },
                  ],
                });
              }

              // Check for onClick={() => {}} or onClick={() => undefined}
              if (expression.type === 'ArrowFunctionExpression') {
                if (
                  expression.body.type === 'BlockStatement' &&
                  expression.body.body.length === 0
                ) {
                  context.report({
                    node: onClickAttr,
                    messageId: 'staticButton',
                    suggest: [
                      {
                        messageId: 'addOnClick',
                      },
                    ],
                  });
                } else if (
                  expression.body.type === 'Identifier' &&
                  expression.body.name === 'undefined'
                ) {
                  context.report({
                    node: onClickAttr,
                    messageId: 'staticButton',
                    suggest: [
                      {
                        messageId: 'addOnClick',
                      },
                    ],
                  });
                }
              }
            }
          }
        }
      },
    };
  },
};

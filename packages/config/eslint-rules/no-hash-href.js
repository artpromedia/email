/**
 * ESLint custom rule to prevent anchor tags with href="#"
 * This prevents static buttons that cause flicker and navigation issues
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow anchor tags with href="#" to prevent static buttons and flicker',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      noHashHref:
        'Anchor tags with href="#" are not allowed. Use proper button elements or React Router navigation instead.',
      suggestButton:
        "Consider using a <button> element for interactive elements that don't navigate.",
      suggestRouter:
        "Consider using React Router's Link or useNavigate for navigation.",
    },
  },

  create(context) {
    return {
      // JSX Elements (React/TSX)
      JSXElement(node) {
        if (node.openingElement.name.name === 'a') {
          const hrefAttr = node.openingElement.attributes.find(
            (attr) => attr.name && attr.name.name === 'href'
          );

          if (hrefAttr && hrefAttr.value) {
            let hrefValue = '';

            if (hrefAttr.value.type === 'Literal') {
              hrefValue = hrefAttr.value.value;
            } else if (
              hrefAttr.value.type === 'JSXExpressionContainer' &&
              hrefAttr.value.expression.type === 'Literal'
            ) {
              hrefValue = hrefAttr.value.expression.value;
            }

            if (hrefValue === '#') {
              context.report({
                node: hrefAttr,
                messageId: 'noHashHref',
                suggest: [
                  {
                    messageId: 'suggestButton',
                    fix(fixer) {
                      // Replace <a href="#"> with <button type="button">
                      const openingTag = node.openingElement;
                      const closingTag = node.closingElement;

                      const newOpeningTag =
                        '<button type="button"' +
                        openingTag.attributes
                          .filter((attr) => attr.name.name !== 'href')
                          .map(
                            (attr) =>
                              ` ${context.getSourceCode().getText(attr)}`
                          )
                          .join('') +
                        '>';

                      const fixes = [
                        fixer.replaceText(openingTag, newOpeningTag),
                      ];

                      if (closingTag) {
                        fixes.push(fixer.replaceText(closingTag, '</button>'));
                      }

                      return fixes;
                    },
                  },
                ],
              });
            }
          }
        }
      },

      // HTML Elements (for HTML files or template literals)
      TaggedTemplateExpression(node) {
        if (node.tag.name === 'html' || node.tag.name === 'htm') {
          const source = context.getSourceCode().getText(node);
          const hrefHashRegex = /<a[^>]*href\s*=\s*["']#["'][^>]*>/gi;

          let match;
          while ((match = hrefHashRegex.exec(source)) !== null) {
            context.report({
              node,
              messageId: 'noHashHref',
              loc: {
                start: node.loc.start,
                end: node.loc.end,
              },
            });
          }
        }
      },

      // String literals that might contain HTML
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes('<a')) {
          const hrefHashRegex = /<a[^>]*href\s*=\s*["']#["'][^>]*>/gi;

          if (hrefHashRegex.test(node.value)) {
            context.report({
              node,
              messageId: 'noHashHref',
            });
          }
        }
      },
    };
  },
};

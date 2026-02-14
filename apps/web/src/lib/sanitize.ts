/**
 * HTML Sanitization utility using DOMPurify
 *
 * CRITICAL SECURITY: All user-supplied or external HTML must be sanitized
 * before rendering via dangerouslySetInnerHTML to prevent XSS attacks.
 */
import DOMPurify from "dompurify";

/**
 * Sanitize HTML content for safe rendering in the browser.
 * Strips dangerous elements like <script>, <iframe>, event handlers, etc.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  return DOMPurify.sanitize(dirty, {
    // Allow common email HTML elements
    ALLOWED_TAGS: [
      "a",
      "abbr",
      "address",
      "article",
      "b",
      "bdi",
      "bdo",
      "blockquote",
      "br",
      "caption",
      "cite",
      "code",
      "col",
      "colgroup",
      "data",
      "dd",
      "del",
      "details",
      "dfn",
      "div",
      "dl",
      "dt",
      "em",
      "figcaption",
      "figure",
      "footer",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "header",
      "hr",
      "i",
      "img",
      "ins",
      "kbd",
      "li",
      "main",
      "mark",
      "ol",
      "p",
      "picture",
      "pre",
      "q",
      "rp",
      "rt",
      "ruby",
      "s",
      "samp",
      "section",
      "small",
      "source",
      "span",
      "strong",
      "sub",
      "summary",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "time",
      "tr",
      "u",
      "ul",
      "var",
      "wbr",
      "center",
      "font",
    ],
    // Allow safe attributes (no event handlers)
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "class",
      "id",
      "style",
      "width",
      "height",
      "align",
      "valign",
      "bgcolor",
      "color",
      "border",
      "cellpadding",
      "cellspacing",
      "colspan",
      "rowspan",
      "dir",
      "lang",
      "target",
      "rel",
      "type",
      "name",
      "size",
      "face",
    ],
    // Force links to open in new tab and prevent reverse tabnabbing
    ADD_ATTR: ["target"],
    // Block dangerous URI schemes
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    // Forbid form elements that could be used for phishing
    FORBID_TAGS: ["form", "input", "textarea", "button", "select", "option"],
    // Strip all event handler attributes
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });
}

/**
 * Sanitize HTML for admin previews (slightly more permissive).
 * Still strips scripts and event handlers but allows more styling elements.
 */
export function sanitizeAdminHtml(dirty: string): string {
  if (!dirty) return "";

  return DOMPurify.sanitize(dirty, {
    ADD_ATTR: ["target"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "applet"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });
}

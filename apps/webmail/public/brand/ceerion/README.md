# CEERION Brand Assets

This directory contains the brand assets for CEERION Mail.

## Logo Guidelines

- **Header height**: 28–32px recommended
- **Logo variants**:
  - `logo-dark.svg`: Dark text/graphics on light backgrounds
  - `logo-light.svg`: Light text/graphics on dark backgrounds
- **Mark variants** (icon only):
  - `mark-dark.svg`: Dark icon on light backgrounds  
  - `mark-light.svg`: Light icon on dark backgrounds

## Usage

The application automatically selects the appropriate logo variant based on the current theme:
- Dark theme → uses `logo-light.svg`
- Light theme → uses `logo-dark.svg`

If assets are missing, the application falls back to text "CEERION".

## File Requirements

- Format: SVG (scalable vector graphics)
- Optimization: Minified/compressed SVG recommended
- Accessibility: Include appropriate `title` and `desc` elements

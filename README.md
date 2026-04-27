# UTAR WBLE Cleaner

Minimal Chrome extension starter for testing whether UI cleanup is feasible on `https://ewble-sl.utar.edu.my/`.

## Load locally

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select the `wble-cleaner` folder
5. Open or refresh the WBLE portal

## Current scope

- Toggleable cleaner mode using Chrome storage
- Lightweight CSS reskin for login and common content containers
- Small login-page text relabel hook

## Next step

Inspect the pages you use most and replace generic selectors with real WBLE selectors one page at a time.

## Architecture: Non-Destructive CSS Toggling

To ensure this extension remains robust and allows for safe, instant toggling between "Clean Mode" and the original Moodle layout, all UI enhancements must follow these core architectural rules:

1. **Never Delete Original DOM**: Do not use `.innerHTML = ""` or `.remove()` on existing portal elements. 
2. **Additive Injection**: When injecting new UI components (like the modern header or icons), place them alongside the original elements. Hide the original text/elements inside hidden spans (`.portal-cleaner-original-content`).
3. **CSS Manages State & Order**: The `styles.css` file is the sole source of truth for visibility and layout.
   - We use the `html.portal-cleaner-active` class to trigger the redesign.
   - When active, CSS hides legacy elements and displays the injected UI.
   - **Crucially**, we use CSS Flexbox `order` (e.g., `order: -1`) to reposition panels and sort lists instead of physically moving DOM nodes in JavaScript.
   - When the toggle is disabled, the root class is removed, all CSS rules vanish, and the portal instantly snaps back to its original layout with zero JavaScript revert logic required.

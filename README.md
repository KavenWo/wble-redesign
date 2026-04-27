# UTAR WBLE Redesign

A premium, modern reskin for the UTAR WBLE portal (`https://ewble-sl.utar.edu.my/`). This extension focuses on improving the user experience through a clean, aesthetic interface while maintaining the core functionality of the original Moodle-based site.

---

## 🚀 Getting Started

### Load the extension locally
1. **Clone or Download** this repository to your computer.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer Mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `wble-redesign` folder from your local machine.
6. Open or refresh the [WBLE Portal](https://ewble-sl.utar.edu.my/).

---

## 🛠️ Contribution Workflow

We welcome contributions! Whether you're fixing a bug or suggesting a new design element, follow these steps:

### For Non-Maintainers (Forking)
1. **Fork** the repository on GitHub to create your own copy.
2. **Clone** your fork to your local machine:
   ```bash
   git clone https://github.com/YOUR_USERNAME/wble-redesign.git
   ```
3. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/my-new-design
   ```
4. **Commit** your changes and **Push** to your fork:
   ```bash
   git push origin feature/my-new-design
   ```
5. Create a **Pull Request** from your fork back to this main repository.

### For Contributors (Collaborators)
1. **Clone** the repository directly.
2. **Create a branch** for your work.
3. Submit a **Pull Request** for review before merging into `main`.

> [!NOTE]
> Pull Requests are reviewed by the project maintainers. Others can still request PRs, but only authorized contributors can approve and merge them.

---

## 🏗️ Architecture: Non-Destructive CSS Toggling

To ensure this extension remains robust and allows for safe, instant toggling between "Clean Mode" and the original Moodle layout, all UI enhancements must follow these core architectural rules:

1. **Never Delete Original DOM**: Do not use `.innerHTML = ""` or `.remove()` on existing portal elements. 
2. **Additive Injection**: When injecting new UI components (like the modern header or icons), place them alongside the original elements. Hide the original text/elements using CSS or by wrapping them in hidden spans.
3. **CSS Manages State & Order**: The `styles.css` file is the sole source of truth for visibility and layout.
   - We use the `html.portal-cleaner-active` class to trigger the redesign.
   - When active, CSS hides legacy elements and displays the injected UI.
   - **Crucially**, we use CSS Flexbox `order` (e.g., `order: -1`) to reposition panels and sort lists instead of physically moving DOM nodes in JavaScript.
   - When the toggle is disabled, the root class is removed, all CSS rules vanish, and the portal instantly snaps back to its original layout with zero JavaScript revert logic required.

# UTAR WBLE Redesign

A clean and modern reskin for the UTAR WBLE portal (`https://ewble-sl.utar.edu.my/`). This extension focuses on improving the user experience through a clean, aesthetic interface while maintaining the core functionality of the original Moodle-based site.

---

## Getting Started

### Load the extension locally
1. **Clone or Download** this repository to your computer.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer Mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `wble-redesign` folder from your local machine.
6. Open or refresh the [WBLE Portal](https://ewble-sl.utar.edu.my/).

---

## Contribution Workflow

We welcome contributions! Whether you're fixing a bug or suggesting a new design element, follow these steps:

### For Non-Maintainers (Forking)
1. **Fork** the repository on GitHub to create your own copy.
2. **Clone** your fork to your local machine:
   ```bash
   git clone https://github.com/KavenWo/wble-redesign.git
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

## Architecture: Refresh-On-Off Toggle

To keep the redesign flexible while preserving confidence in the original Moodle experience, the extension now uses a refresh-on-off architecture:

1. **Turning on can happen live**: If the redesign is enabled while the user is already on WBLE, the current tab can apply the redesign immediately.
2. **Turning off refreshes the page**: Disabling the redesign reloads the active WBLE tab so the next page load happens without redesign behavior.
3. **Controller and redesign logic are separate**:
   - `controller.js` reads the saved toggle state and decides whether the redesign app should run.
   - `content.js` contains the redesign behavior itself.
   - `file-tools.js` and `css/file-tools.css` own the course files pill, modal, ZIP action, and OneDrive conversion UI.
   - `background.js` handles the tab refresh flow when the user disables the redesign from the popup.
4. **Page-load state is the source of truth**:
   - If the redesign is off when the page loads, the redesign app does not mount.
   - If the redesign is on, the redesign app can enhance the page for that session.
   - Turning the redesign off no longer depends on undoing every JavaScript side effect live.
5. **Never delete original DOM**: Do not use `.innerHTML = ""` or `.remove()` on existing portal elements unless there is a very strong reason and the impact is fully understood.
6. **Prefer additive enhancement**: Inject new UI alongside the original structure where practical. Hide or de-emphasize legacy content through CSS instead of destroying it.
7. **CSS remains the primary tool**:
   - We still use the `html.portal-cleaner-active` class to trigger redesign styling.
   - CSS should remain the main source of truth for visibility, layout, and ordering.
   - Prefer layout techniques such as Flexbox `order` before reaching for JavaScript DOM movement.
8. **Minimize JavaScript bloat**: Use JavaScript only when CSS cannot achieve the needed UX. JavaScript should focus on focused enhancement work such as DOM injection, semantic upgrades, or interaction behavior that styling alone cannot provide.

## OneDrive PPTX-to-PDF Converter

The extension can convert WBLE `PPT`/`PPTX` downloads into PDFs using the student's own Microsoft OneDrive and Microsoft Graph. This is extension-only; it does not require a backend server.

UTAR/work/school Microsoft accounts may require administrator approval for third-party app consent. If sign-in is blocked, use a personal Microsoft account for the converter.

Before testing conversion, create a Microsoft app registration and copy `js/local-config.example.js` to the ignored `js/local-config.js` file with your own client ID. See [ONEDRIVE_CONVERTER_SETUP.md](ONEDRIVE_CONVERTER_SETUP.md) for the setup steps and known limits.

This architecture is meant to give contributors more freedom to improve UI and UX without carrying a large amount of toggle-off cleanup logic in every feature.

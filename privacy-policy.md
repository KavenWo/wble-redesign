# WBLE Glow-Up Privacy Policy

Last updated: June 24, 2026

WBLE Glow-Up is a browser extension that improves the UTAR WBLE interface and adds file tools for course resources. This policy explains what data the extension handles and why.

## Data the Extension Handles

### Website content

The extension reads and modifies content on `https://ewble-sl.utar.edu.my/*` so it can redesign WBLE pages, discover course resource links, identify downloadable files, and package selected files for download.

This processing happens inside the user's browser and is used only for the extension's WBLE cleanup and file tools.

### Extension settings

The extension stores the user's cleaner enabled/disabled preference using Chrome storage so the preference is remembered across WBLE pages and browser sessions.

### Microsoft authentication for optional conversion

If the user chooses to use the optional PPT/PPTX to PDF conversion feature, the extension uses Microsoft sign-in through Chrome's identity API. Microsoft access and refresh tokens may be stored locally in the user's browser so the user does not need to sign in repeatedly.

The extension does not collect, see, or store the user's Microsoft password.

### Course files used for optional conversion

When the user chooses to convert PPT/PPTX files to PDF, the selected files are downloaded from WBLE in the user's browser session, uploaded temporarily to the user's own Microsoft OneDrive app folder through Microsoft Graph, exported as PDFs, downloaded back to the browser, and then deleted from OneDrive on a best-effort basis.

This conversion feature is optional and only runs when the user chooses it.

## Data the Extension Does Not Collect

WBLE Glow-Up does not collect or sell:

- Personally identifiable information such as name, address, email address, age, or identification number
- Health information
- Financial or payment information
- Passwords or security credentials
- Personal communications such as emails, texts, or chat messages
- Location data
- Web browsing history
- Keystrokes, mouse position, or unrelated user activity

## Third Parties

The extension communicates only with services needed for its stated features:

- UTAR WBLE, to read and improve WBLE pages and access course resources selected by the user
- Microsoft login and Microsoft Graph, only for the optional OneDrive-based PPT/PPTX to PDF conversion feature

WBLE Glow-Up does not sell user data and does not transfer user data for advertising, analytics, creditworthiness, lending, or unrelated purposes.

## Remote Code

WBLE Glow-Up does not load or execute remote JavaScript code. The extension's code is packaged with the extension.

## Contact

For questions about this privacy policy, contact the developer through the GitHub repository:

https://github.com/KavenWo/wble-redesign

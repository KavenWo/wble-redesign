# OneDrive PPTX-to-PDF Converter Setup

The converter is extension-only. It uses the student's Microsoft account, uploads PPT/PPTX files into that student's OneDrive app folder, exports them as PDFs through Microsoft Graph, downloads the PDFs, and deletes the temporary OneDrive files.

## Microsoft App Registration

1. Open the Microsoft Entra admin center or Azure app registrations page.
2. Create an app registration named `UTAR WBLE Cleaner`.
3. Supported account types:
   - Use `Accounts in any organizational directory and personal Microsoft accounts` if you want both university and personal Microsoft accounts.
   - UTAR or other university Microsoft accounts may show an admin approval/consent request. For smoother testing, sign in with a personal Microsoft account.
4. Platform/redirect URI:
   - Add a browser/public-client redirect URI matching Chrome's extension redirect URL:
     `https://<your-extension-id>.chromiumapp.org/`
   - In development, keep the extension ID stable. If the ID changes, this redirect URI must be updated in Microsoft.
5. API permissions:
   - Add Microsoft Graph delegated permission `Files.ReadWrite.AppFolder`.
   - Add `offline_access` so the extension can refresh Microsoft access without asking the student to sign in every conversion.
6. No client secret is needed. Browser extensions are public clients.

## Extension Configuration

After creating the app registration, copy the local config template:

```bash
cp local-config.example.js local-config.js
```

Then set your Application/Client ID from Microsoft Entra in `local-config.js`:

```js
globalThis.PortalCleanerLocalConfig = {
  microsoftClientId: "YOUR_MICROSOFT_ENTRA_CLIENT_ID"
};
```

`local-config.js` is ignored by Git so each developer can keep their own Microsoft app registration locally without editing tracked source files.

## Known Limits

- Some university Microsoft tenants, including UTAR-style work/school accounts, may block student consent for third-party apps or ask for administrator approval. When this happens, use a personal Microsoft account for conversion; the extension will keep the normal ZIP fallback available.
- Microsoft Graph conversion is much more accurate than LibreOffice for PowerPoint files, but it can still fail for encrypted, corrupted, very large, or unusual decks.
- Temporary files should be deleted after each conversion. If cleanup fails, the UI warns that a temporary file may remain in OneDrive.
- The v1 converter only handles `PPT` and `PPTX`.

## Testing Checklist

- Convert one small PPTX.
- Convert several PPT/PPTX files in one course page.
- Test a large deck so upload sessions are exercised.
- Compare engineering equation-heavy decks against PDFs exported by PowerPoint.
- Cancel Microsoft sign-in and confirm WBLE and ZIP download still work.
- Sign out from the popup and confirm the next conversion asks for Microsoft sign-in again.

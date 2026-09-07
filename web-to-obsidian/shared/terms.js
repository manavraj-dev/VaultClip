/**
 * Terms & Conditions gate. Both the popup and the options page must confirm
 * acceptance (via isAccepted()) before showing anything else. Acceptance is
 * versioned so that if the terms text is ever changed materially, bumping
 * CURRENT_VERSION will require everyone to re-accept.
 */
const ObsidianTerms = (() => {
  const KEY = 'wto_terms_accepted_version';
  const CURRENT_VERSION = 1;

  const TEXT = `Terms & Conditions

By installing and using the Web \u2192 Obsidian browser extension ("the Extension"), you agree to the following terms. If you do not agree, do not use the Extension.

1. What this Extension does
The Extension reads content from web pages you actively choose to capture, converts it to Markdown, and writes it to a location you configure \u2014 either directly to a folder on your device (via your browser's File System Access permission) or by opening an obsidian:// link. The Extension does not operate a server, does not require an account, and does not transmit your captured content, vault contents, templates, or settings to the developer or any third party.

2. Your responsibility
You are solely responsible for: the content you choose to capture and your compliance with the terms of service, copyright, and applicable law of any website you capture from; verifying that the vault folder you connect is the correct one; reviewing captured notes before relying on them; and maintaining your own backups of your Obsidian vault. The Extension writes files directly into a folder you select.

3. No warranty
The Extension is provided "as is" and "as available," without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement. Web page structures change frequently, so extraction accuracy and site-adapter behavior is not guaranteed and may change or break without notice.

4. Limitation of liability
To the maximum extent permitted by applicable law, the developer(s) of this Extension are not liable for any direct, indirect, incidental, special, consequential, or exemplary damages \u2014 including loss of data, loss of use, or loss of goodwill \u2014 arising out of or in connection with your use of, or inability to use, the Extension.

5. Local-only processing
All processing happens locally in your browser. Filesystem access granted to the Extension is scoped only to the folder you explicitly select, and can be revoked at any time from your browser's site/extension permission settings.

6. Changes to these terms
These terms may be updated from time to time. If changes are material, you will be asked to re-accept before continuing to use the Extension. Continued use after a non-material update constitutes acceptance of the revised terms.

7. Termination
You may stop using the Extension, and revoke any permissions you've granted it, at any time by removing it from your browser.

8. Governing terms
These terms are provided as a general-purpose baseline for a free, local-only browser tool and do not constitute a commercial service agreement. If a specific jurisdiction's consumer-protection law grants you rights these terms cannot waive, those rights are not affected.

9. Contact
For questions about these terms, please open an issue on the project's repository.

By checking the box and clicking "I Agree," you acknowledge that you have read, understood, and agree to be bound by these terms.`;

  async function getAcceptedVersion() {
    const data = await chrome.storage.local.get(KEY);
    return data[KEY] || 0;
  }

  async function isAccepted() {
    const v = await getAcceptedVersion();
    return v >= CURRENT_VERSION;
  }

  async function accept() {
    await chrome.storage.local.set({ [KEY]: CURRENT_VERSION });
  }

  return { TEXT, CURRENT_VERSION, isAccepted, accept };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ObsidianTerms;

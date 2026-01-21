/**
 * YarvixBrowser - Native Credential Manager
 *
 * Secure credential storage and autofill system similar to Chrome.
 * Implements encrypted storage with OS-level security where available.
 */

const { safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * CredentialManager Class
 *
 * Handles secure storage, retrieval, and management of user credentials.
 * Uses Electron's safeStorage API (OS keychain on macOS, DPAPI on Windows)
 * with a fallback to AES-256-GCM encrypted local storage.
 */
class CredentialManager {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.credentialsFile = path.join(userDataPath, 'credentials.enc');
        this.neverSaveFile = path.join(userDataPath, 'never-save-sites.json');
        this.encryptionKeyFile = path.join(userDataPath, '.credential-key');

        // In-memory cache for faster lookups
        this.credentialsCache = new Map(); // origin -> [{ username, encryptedPassword }]
        this.neverSaveSites = new Set();

        // Flag to check if OS secure storage is available
        this.useOSStorage = false;

        // Initialize
        this._initialize();
    }

    /**
     * Initialize the credential manager
     */
    _initialize() {
        // Check if OS secure storage is available
        try {
            this.useOSStorage = safeStorage.isEncryptionAvailable();
            console.log(`[CredentialManager] OS secure storage available: ${this.useOSStorage}`);
        } catch (err) {
            console.warn('[CredentialManager] safeStorage check failed:', err.message);
            this.useOSStorage = false;
        }

        // Load never-save sites
        this._loadNeverSaveSites();

        // Load credentials into cache
        this._loadCredentials();
    }

    /**
     * Get or create the encryption key for fallback encryption
     */
    _getEncryptionKey() {
        try {
            if (fs.existsSync(this.encryptionKeyFile)) {
                return fs.readFileSync(this.encryptionKeyFile);
            }

            // Generate a new 256-bit key
            const key = crypto.randomBytes(32);
            fs.writeFileSync(this.encryptionKeyFile, key, { mode: 0o600 });
            return key;
        } catch (err) {
            console.error('[CredentialManager] Failed to get encryption key:', err);
            throw err;
        }
    }

    /**
     * Encrypt data using AES-256-GCM (fallback when OS storage unavailable)
     */
    _encrypt(plaintext) {
        if (this.useOSStorage) {
            try {
                return safeStorage.encryptString(plaintext);
            } catch (err) {
                console.warn('[CredentialManager] OS encryption failed, using fallback:', err.message);
            }
        }

        // Fallback: AES-256-GCM
        const key = this._getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Return iv:authTag:encrypted
        return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
    }

    /**
     * Decrypt data
     */
    _decrypt(encryptedData) {
        if (this.useOSStorage) {
            try {
                return safeStorage.decryptString(encryptedData);
            } catch (err) {
                console.warn('[CredentialManager] OS decryption failed, trying fallback:', err.message);
            }
        }

        // Fallback: AES-256-GCM
        try {
            const key = this._getEncryptionKey();
            const iv = encryptedData.slice(0, 16);
            const authTag = encryptedData.slice(16, 32);
            const encrypted = encryptedData.slice(32);

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (err) {
            console.error('[CredentialManager] Decryption failed:', err.message);
            return null;
        }
    }

    /**
     * Load never-save sites from disk
     */
    _loadNeverSaveSites() {
        try {
            if (fs.existsSync(this.neverSaveFile)) {
                const data = fs.readFileSync(this.neverSaveFile, 'utf8');
                const sites = JSON.parse(data);
                this.neverSaveSites = new Set(sites);
            }
        } catch (err) {
            console.error('[CredentialManager] Failed to load never-save sites:', err);
            this.neverSaveSites = new Set();
        }
    }

    /**
     * Save never-save sites to disk
     */
    _saveNeverSaveSites() {
        try {
            const data = JSON.stringify(Array.from(this.neverSaveSites), null, 2);
            fs.writeFileSync(this.neverSaveFile, data, { mode: 0o600 });
        } catch (err) {
            console.error('[CredentialManager] Failed to save never-save sites:', err);
        }
    }

    /**
     * Load credentials from encrypted file
     */
    _loadCredentials() {
        try {
            if (!fs.existsSync(this.credentialsFile)) {
                return;
            }

            const encryptedData = fs.readFileSync(this.credentialsFile);
            const decrypted = this._decrypt(encryptedData);

            if (!decrypted) {
                console.warn('[CredentialManager] Failed to decrypt credentials file');
                return;
            }

            const credentials = JSON.parse(decrypted);

            for (const [origin, creds] of Object.entries(credentials)) {
                this.credentialsCache.set(origin, creds);
            }

            console.log(`[CredentialManager] Loaded credentials for ${this.credentialsCache.size} origins`);
        } catch (err) {
            console.error('[CredentialManager] Failed to load credentials:', err);
        }
    }

    /**
     * Save credentials to encrypted file
     */
    _saveCredentials() {
        try {
            const credentials = {};
            for (const [origin, creds] of this.credentialsCache.entries()) {
                credentials[origin] = creds;
            }

            const plaintext = JSON.stringify(credentials, null, 2);
            const encrypted = this._encrypt(plaintext);

            fs.writeFileSync(this.credentialsFile, encrypted, { mode: 0o600 });
        } catch (err) {
            console.error('[CredentialManager] Failed to save credentials:', err);
        }
    }

    /**
     * Extract origin from URL (protocol + domain)
     */
    _getOrigin(url) {
        try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.host}`;
        } catch (err) {
            return null;
        }
    }

    /**
     * Check if credentials should be saved for this site
     */
    shouldPromptSave(url) {
        const origin = this._getOrigin(url);
        if (!origin) return false;
        return !this.neverSaveSites.has(origin);
    }

    /**
     * Mark a site as "never save"
     */
    neverSaveForSite(url) {
        const origin = this._getOrigin(url);
        if (!origin) return;

        this.neverSaveSites.add(origin);
        this._saveNeverSaveSites();
        console.log(`[CredentialManager] Marked ${origin} as never-save`);
    }

    /**
     * Remove a site from the "never save" list
     */
    enableSaveForSite(url) {
        const origin = this._getOrigin(url);
        if (!origin) return;

        this.neverSaveSites.delete(origin);
        this._saveNeverSaveSites();
        console.log(`[CredentialManager] Enabled save for ${origin}`);
    }

    /**
     * Get list of never-save sites
     */
    getNeverSaveSites() {
        return Array.from(this.neverSaveSites);
    }

    /**
     * Check if credentials exist for this origin and username
     * Returns: 'none' | 'same' | 'different' (different password)
     */
    checkExistingCredential(url, username, password) {
        const origin = this._getOrigin(url);
        if (!origin) return { status: 'none' };

        const credentials = this.credentialsCache.get(origin);
        if (!credentials || credentials.length === 0) {
            return { status: 'none' };
        }

        // Find matching username
        const existing = credentials.find(c => c.username === username);
        if (!existing) {
            return { status: 'none', hasOtherUsers: true };
        }

        // Compare passwords
        if (existing.password === password) {
            return { status: 'same' };
        }

        return { status: 'different' };
    }

    /**
     * Save or update credentials
     */
    saveCredential(url, username, password) {
        const origin = this._getOrigin(url);
        if (!origin) return false;

        let credentials = this.credentialsCache.get(origin) || [];

        // Find existing entry for this username
        const existingIndex = credentials.findIndex(c => c.username === username);

        const credentialEntry = {
            username,
            password, // Note: In real implementation, consider additional encryption per-credential
            createdAt: existingIndex >= 0 ? credentials[existingIndex].createdAt : Date.now(),
            updatedAt: Date.now()
        };

        if (existingIndex >= 0) {
            // Update existing
            credentials[existingIndex] = credentialEntry;
            console.log(`[CredentialManager] Updated credential for ${username} at ${origin}`);
        } else {
            // Add new
            credentials.push(credentialEntry);
            console.log(`[CredentialManager] Saved new credential for ${username} at ${origin}`);
        }

        this.credentialsCache.set(origin, credentials);
        this._saveCredentials();

        return true;
    }

    /**
     * Get credentials for autofill
     */
    getCredentials(url) {
        const origin = this._getOrigin(url);
        if (!origin) return [];

        const credentials = this.credentialsCache.get(origin);
        if (!credentials || credentials.length === 0) {
            return [];
        }

        // Return credentials with origin included for matching
        return credentials.map(c => ({
            username: c.username,
            password: c.password, // Only expose when actually autofilling
            origin: origin, // Include origin for credential lookup
            displayName: this._maskUsername(c.username)
        }));
    }

    /**
     * Mask username for display
     */
    _maskUsername(username) {
        if (username.includes('@')) {
            const [name, domain] = username.split('@');
            if (name.length <= 2) return username;
            return `${name.substring(0, 2)}***@${domain}`;
        }
        if (username.length <= 3) return username;
        return `${username.substring(0, 3)}***`;
    }

    /**
     * Delete a specific credential
     */
    deleteCredential(url, username) {
        const origin = this._getOrigin(url);
        if (!origin) return false;

        const credentials = this.credentialsCache.get(origin);
        if (!credentials) return false;

        const newCredentials = credentials.filter(c => c.username !== username);

        if (newCredentials.length === 0) {
            this.credentialsCache.delete(origin);
        } else {
            this.credentialsCache.set(origin, newCredentials);
        }

        this._saveCredentials();
        console.log(`[CredentialManager] Deleted credential for ${username} at ${origin}`);
        return true;
    }

    /**
     * Delete all credentials for an origin
     */
    deleteAllForOrigin(url) {
        const origin = this._getOrigin(url);
        if (!origin) return false;

        this.credentialsCache.delete(origin);
        this._saveCredentials();
        console.log(`[CredentialManager] Deleted all credentials for ${origin}`);
        return true;
    }

    /**
     * Update username for a credential
     */
    updateUsername(url, oldUsername, newUsername) {
        const origin = this._getOrigin(url);
        if (!origin) return false;

        const credentials = this.credentialsCache.get(origin);
        if (!credentials) return false;

        const credential = credentials.find(c => c.username === oldUsername);
        if (!credential) return false;

        // Check if new username already exists
        if (credentials.some(c => c.username === newUsername)) {
            return false; // Conflict
        }

        credential.username = newUsername;
        credential.updatedAt = Date.now();

        this._saveCredentials();
        return true;
    }

    /**
     * Get all saved credentials (for management UI)
     */
    getAllCredentials() {
        const result = [];

        for (const [origin, credentials] of this.credentialsCache.entries()) {
            for (const cred of credentials) {
                result.push({
                    origin,
                    username: cred.username,
                    displayName: this._maskUsername(cred.username),
                    createdAt: cred.createdAt,
                    updatedAt: cred.updatedAt
                });
            }
        }

        // Sort by most recently updated
        result.sort((a, b) => b.updatedAt - a.updatedAt);
        return result;
    }

    /**
     * Get count of saved credentials
     */
    getCredentialCount() {
        let count = 0;
        for (const credentials of this.credentialsCache.values()) {
            count += credentials.length;
        }
        return count;
    }

    /**
     * Clear all credentials
     */
    clearAllCredentials() {
        this.credentialsCache.clear();
        this._saveCredentials();
        console.log('[CredentialManager] All credentials cleared');
    }

    /**
     * Export credentials (for backup) - requires authentication
     * Returns encrypted data that can be imported later
     */
    exportCredentials(masterPassword) {
        const data = {
            version: 1,
            exportedAt: Date.now(),
            credentials: {}
        };

        for (const [origin, creds] of this.credentialsCache.entries()) {
            data.credentials[origin] = creds;
        }

        // Encrypt with master password
        const key = crypto.scryptSync(masterPassword, 'yarvix-credential-export', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return {
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted
        };
    }

    /**
     * Import credentials from backup
     */
    importCredentials(exportedData, masterPassword) {
        try {
            const key = crypto.scryptSync(masterPassword, 'yarvix-credential-export', 32);
            const iv = Buffer.from(exportedData.iv, 'hex');
            const authTag = Buffer.from(exportedData.authTag, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(exportedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            const data = JSON.parse(decrypted);

            // Merge with existing credentials
            for (const [origin, creds] of Object.entries(data.credentials)) {
                const existing = this.credentialsCache.get(origin) || [];

                for (const cred of creds) {
                    const existingIndex = existing.findIndex(c => c.username === cred.username);
                    if (existingIndex >= 0) {
                        // Update if imported is newer
                        if (cred.updatedAt > existing[existingIndex].updatedAt) {
                            existing[existingIndex] = cred;
                        }
                    } else {
                        existing.push(cred);
                    }
                }

                this.credentialsCache.set(origin, existing);
            }

            this._saveCredentials();
            return { success: true, count: Object.keys(data.credentials).length };
        } catch (err) {
            console.error('[CredentialManager] Import failed:', err);
            return { success: false, error: 'Invalid password or corrupted data' };
        }
    }
}

/**
 * Content script to inject into webviews for form detection
 */
const FORM_DETECTION_SCRIPT = `
(function() {
    // Prevent double injection
    if (window.__yarvixCredentialManagerInjected) return;
    window.__yarvixCredentialManagerInjected = true;

    const CREDENTIAL_MANAGER = {
        // Track form submissions
        pendingSubmission: null,

        // Track focused field for autofill
        focusedField: null,

        // Available credentials (set by browser)
        availableCredentials: [],

        // Selectors for login forms
        usernameSelectors: [
            'input[type="email"]',
            'input[type="text"][name*="user"]',
            'input[type="text"][name*="email"]',
            'input[type="text"][name*="login"]',
            'input[type="text"][name*="account"]',
            'input[type="text"][id*="user"]',
            'input[type="text"][id*="email"]',
            'input[type="text"][id*="login"]',
            'input[autocomplete="username"]',
            'input[autocomplete="email"]',
            'input[name="username"]',
            'input[name="email"]',
            'input[name="login"]',
            'input[id="username"]',
            'input[id="email"]',
            'input[id="login"]',
            'input[type="text"][placeholder*="email" i]',
            'input[type="text"][placeholder*="user" i]'
        ],

        passwordSelectors: [
            'input[type="password"]',
            'input[autocomplete="current-password"]',
            'input[autocomplete="new-password"]'
        ],

        /**
         * Find login forms on the page
         */
        findLoginForms() {
            const forms = [];

            // Find all password fields
            const passwordFields = document.querySelectorAll(this.passwordSelectors.join(', '));

            for (const passwordField of passwordFields) {
                // Find the parent form
                const form = passwordField.closest('form') || this.findVirtualForm(passwordField);
                if (!form) continue;

                // Find username field in the same form
                let usernameField = null;
                for (const selector of this.usernameSelectors) {
                    usernameField = form.querySelector(selector);
                    if (usernameField && usernameField !== passwordField) break;
                }

                // If no username field found, look for any text input before password
                if (!usernameField) {
                    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
                    for (const input of inputs) {
                        if (this.isBeforeElement(input, passwordField)) {
                            usernameField = input;
                            break;
                        }
                    }
                }

                if (usernameField) {
                    forms.push({
                        form,
                        usernameField,
                        passwordField,
                        isVirtual: !passwordField.closest('form')
                    });
                }
            }

            return forms;
        },

        /**
         * Find virtual form (for SPA apps without <form> tags)
         */
        findVirtualForm(passwordField) {
            // Look for common container patterns
            let container = passwordField.parentElement;
            let depth = 0;
            const maxDepth = 10;

            while (container && depth < maxDepth) {
                // Check if container has multiple inputs including password
                const inputs = container.querySelectorAll('input');
                const hasPassword = Array.from(inputs).some(i => i.type === 'password');
                const hasText = Array.from(inputs).some(i =>
                    i.type === 'text' || i.type === 'email' || !i.type
                );

                if (hasPassword && hasText && inputs.length >= 2) {
                    return container;
                }

                container = container.parentElement;
                depth++;
            }

            return null;
        },

        /**
         * Check if element A is before element B in DOM
         */
        isBeforeElement(a, b) {
            const position = a.compareDocumentPosition(b);
            return !!(position & Node.DOCUMENT_POSITION_FOLLOWING);
        },

        /**
         * Setup form submission listeners
         */
        setupFormListeners() {
            const loginForms = this.findLoginForms();

            for (const { form, usernameField, passwordField, isVirtual } of loginForms) {
                // Prevent duplicate listeners
                if (form.__yarvixListenerAttached) continue;
                form.__yarvixListenerAttached = true;

                // Listen for form submission
                if (!isVirtual) {
                    form.addEventListener('submit', (e) => {
                        this.handleFormSubmit(usernameField, passwordField);
                    });
                }

                // Also listen for Enter key in password field
                passwordField.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.handleFormSubmit(usernameField, passwordField);
                    }
                });

                // Listen for submit button clicks
                const submitButtons = form.querySelectorAll(
                    'button[type="submit"], input[type="submit"], button:not([type])'
                );
                for (const btn of submitButtons) {
                    btn.addEventListener('click', () => {
                        setTimeout(() => {
                            this.handleFormSubmit(usernameField, passwordField);
                        }, 100);
                    });
                }

                // Setup focus listeners for autofill dropdown
                this.setupAutofillListeners(usernameField, passwordField);
            }
        },

        /**
         * Setup autofill focus listeners - ONLY on password field for cleaner UX
         */
        setupAutofillListeners(usernameField, passwordField) {
            // Only show dropdown on password field - it fills both fields anyway
            if (!passwordField || passwordField.__yarvixAutofillListener) return;
            passwordField.__yarvixAutofillListener = true;

            // On focus, notify browser to show autofill dropdown
            passwordField.addEventListener('focus', (e) => {
                this.focusedField = passwordField;
                const rect = passwordField.getBoundingClientRect();
                console.log(JSON.stringify({
                    type: 'yarvix-autofill-focus',
                    data: {
                        url: window.location.href,
                        origin: window.location.origin,
                        fieldType: 'password',
                        position: {
                            x: rect.left + window.scrollX,
                            y: rect.bottom + window.scrollY,
                            width: rect.width,
                            height: rect.height
                        }
                    }
                }));
            });

            // On blur, notify browser to hide dropdown
            passwordField.addEventListener('blur', (e) => {
                // Delay to allow click on dropdown
                setTimeout(() => {
                    if (this.focusedField === passwordField) {
                        this.focusedField = null;
                        console.log(JSON.stringify({
                            type: 'yarvix-autofill-blur',
                            data: { url: window.location.href }
                        }));
                    }
                }, 200);
            });

            // On click (for already focused password field)
            passwordField.addEventListener('click', (e) => {
                const rect = passwordField.getBoundingClientRect();
                console.log(JSON.stringify({
                    type: 'yarvix-autofill-focus',
                    data: {
                        url: window.location.href,
                        origin: window.location.origin,
                        fieldType: 'password',
                        position: {
                            x: rect.left + window.scrollX,
                            y: rect.bottom + window.scrollY,
                            width: rect.width,
                            height: rect.height
                        }
                    }
                }));
            });
        },

        /**
         * Handle form submission
         */
        handleFormSubmit(usernameField, passwordField) {
            const username = usernameField?.value?.trim();
            const password = passwordField?.value;

            if (!username || !password) return;

            // Send to main process
            console.log(JSON.stringify({
                type: 'yarvix-credential-submit',
                data: {
                    username,
                    password,
                    url: window.location.href,
                    origin: window.location.origin
                }
            }));
        },

        /**
         * Set input value with minimal, optimized event dispatching
         * Lightweight version that works with most frameworks without blocking UI
         */
        setInputValue(field, value) {
            if (!field) return;

            // Get the native value setter to bypass React's synthetic event system
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;

            // Reset React's value tracker if it exists (do this BEFORE setting value)
            const tracker = field._valueTracker;
            if (tracker) {
                tracker.setValue('');
            }

            // Set the value using native setter
            nativeInputValueSetter.call(field, value);

            // Dispatch only the essential input event - this is what React/Vue/Angular need
            field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        },

        /**
         * Autofill credentials - optimized for smooth UX
         */
        autofill(username, password) {
            const loginForms = this.findLoginForms();

            if (loginForms.length === 0) {
                console.log('[YarvixCredentials] No login form found');
                return false;
            }

            const { usernameField, passwordField } = loginForms[0];

            // Use requestAnimationFrame for smooth, non-blocking fill
            requestAnimationFrame(() => {
                // Fill username
                if (usernameField) {
                    usernameField.focus();
                    this.setInputValue(usernameField, username);
                }

                // Fill password in next frame for better performance
                requestAnimationFrame(() => {
                    if (passwordField) {
                        passwordField.focus();
                        this.setInputValue(passwordField, password);

                        // Dispatch change events after both fields are filled
                        if (usernameField) {
                            usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    console.log('[YarvixCredentials] Autofill completed');
                });
            });

            return true;
        },

        /**
         * Check if page has login form and notify
         */
        checkForLoginForm() {
            const loginForms = this.findLoginForms();

            if (loginForms.length > 0) {
                console.log(JSON.stringify({
                    type: 'yarvix-login-form-detected',
                    data: {
                        url: window.location.href,
                        origin: window.location.origin,
                        formCount: loginForms.length
                    }
                }));
            }
        },

        /**
         * Initialize
         */
        init() {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._init());
            } else {
                this._init();
            }
        },

        _init() {
            this.setupFormListeners();
            this.checkForLoginForm();

            // Re-check on dynamic content changes
            const observer = new MutationObserver((mutations) => {
                let shouldRecheck = false;
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.querySelector &&
                                    (node.querySelector('input[type="password"]') ||
                                     node.tagName === 'INPUT' && node.type === 'password')) {
                                    shouldRecheck = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (shouldRecheck) {
                    setTimeout(() => {
                        this.setupFormListeners();
                        this.checkForLoginForm();
                    }, 100);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    // Expose for autofill calls
    window.__yarvixAutofill = (username, password) => {
        return CREDENTIAL_MANAGER.autofill(username, password);
    };

    // Initialize
    CREDENTIAL_MANAGER.init();
})();
`;

module.exports = {
    CredentialManager,
    FORM_DETECTION_SCRIPT
};

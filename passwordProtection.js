const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PASSWORD = 'KHULETOJHA';
const MAX_ATTEMPTS = 3;

class PasswordProtection {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.configFile = path.join(userDataPath, 'browser-lock.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = fs.readFileSync(this.configFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.warn('[PasswordProtection] Failed to load config:', err.message);
        }

        // Default config with hashed default password
        return {
            passwordHash: this.hashPassword(DEFAULT_PASSWORD),
            failedAttempts: 0,
            lastFailedAttempt: null
        };
    }

    saveConfig() {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.userDataPath)) {
                fs.mkdirSync(this.userDataPath, { recursive: true });
            }
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (err) {
            console.error('[PasswordProtection] Failed to save config:', err.message);
        }
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    verifyPassword(password) {
        const hash = this.hashPassword(password);
        const isValid = hash === this.config.passwordHash;

        if (isValid) {
            // Reset failed attempts on successful login
            this.config.failedAttempts = 0;
            this.config.lastFailedAttempt = null;
            this.saveConfig();
            return { success: true };
        } else {
            // Increment failed attempts
            this.config.failedAttempts++;
            this.config.lastFailedAttempt = Date.now();
            this.saveConfig();

            const remainingAttempts = MAX_ATTEMPTS - this.config.failedAttempts;

            if (this.config.failedAttempts >= MAX_ATTEMPTS) {
                return {
                    success: false,
                    shouldWipe: true,
                    remainingAttempts: 0,
                    message: 'Maximum attempts reached. All data will be wiped.'
                };
            }

            return {
                success: false,
                shouldWipe: false,
                remainingAttempts,
                message: `Wrong password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
            };
        }
    }

    changePassword(currentPassword, newPassword) {
        // Verify current password first
        const currentHash = this.hashPassword(currentPassword);
        if (currentHash !== this.config.passwordHash) {
            return { success: false, error: 'Current password is incorrect' };
        }

        // Validate new password
        if (!newPassword || newPassword.length < 4) {
            return { success: false, error: 'New password must be at least 4 characters' };
        }

        // Update password
        this.config.passwordHash = this.hashPassword(newPassword);
        this.config.failedAttempts = 0;
        this.config.lastFailedAttempt = null;
        this.saveConfig();

        return { success: true };
    }

    getFailedAttempts() {
        return this.config.failedAttempts;
    }

    getRemainingAttempts() {
        return Math.max(0, MAX_ATTEMPTS - this.config.failedAttempts);
    }

    resetAttempts() {
        this.config.failedAttempts = 0;
        this.config.lastFailedAttempt = null;
        this.saveConfig();
    }

    // Reset to default password (used after data wipe)
    resetToDefault() {
        this.config = {
            passwordHash: this.hashPassword(DEFAULT_PASSWORD),
            failedAttempts: 0,
            lastFailedAttempt: null
        };
        this.saveConfig();
    }
}

module.exports = { PasswordProtection, DEFAULT_PASSWORD, MAX_ATTEMPTS };

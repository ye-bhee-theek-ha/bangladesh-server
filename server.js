const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class IVACAutomation {
    constructor(config) {
        this.config = {
            // Default configuration
            proxy: {
                server: null,
                username: null,
                password: null
            },
            headless: false,
            viewport: { width: 3066, height: 1268 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            timeout: 500000,
            retryAttempts: 3,
            retryDelay: 2000,

            // Application specific config
            application: {
                highcom: "1",
                webFileId: "BGDDV5101725",
                ivacId: "17",
                visaType: "13",
                familyCount: "4",
                visitPurpose: "PURPOSE FOR MEDICAL",
                defaultDate: "2025-07-15"
            },

            personal: {
                fullName: "TRISHA AKTAR",
                email: "trisha666980@gmail.com",
                phone: "01344570614",
                familyMembers: [
                    { name: "md muslim shah", webFileNo: "BGDDV519E625" },
                    { name: "mst taslima akther", webFileNo: "BGDDV519CA25" },
                    { name: "numan ahmed", webFileNo: "BGDDV5366425" },
                    { name: "mst aklima akter", webFileNo: "BGDDV5362125" }
                ]
            },

            login: {
                mobileNumber: '01344570614',
                password: '123456'
            },

            ...config
        };

        this.browser = null;
        this.page = null;
        this.csrfToken = null;
        this.hashParam = null;
        this.recaptchaToken = null;
        this.isOtpVerified = false;
        this.selectedDate = this.config.application.defaultDate;
        this.selectedTime = null;
    }

    async init() {
        console.log('🚀 Initializing IVAC Automation...');

        const launchOptions = {
            headless: this.config.headless,
            defaultViewport: this.config.viewport,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        };

        // Add proxy configuration if provided
        if (this.config.proxy.server) {
            launchOptions.args.push(`--proxy-server=${this.config.proxy.server}`);
            console.log(`🔗 Using proxy: ${this.config.proxy.server}`);
        }

        this.browser = await puppeteer.launch(launchOptions);
        this.page = await this.browser.newPage();

        // Set user agent
        await this.page.setUserAgent(this.config.userAgent);

        // Handle proxy authentication if credentials provided
        if (this.config.proxy.username && this.config.proxy.password) {
            await this.page.authenticate({
                username: this.config.proxy.username,
                password: this.config.proxy.password
            });
        }

        // Set default timeout
        this.page.setDefaultTimeout(this.config.timeout);

        // Enable request/response interception for debugging
        await this.page.setRequestInterception(true);
        this.page.on('request', (request) => {
            console.log(`📤request:  ${request.method()} ${request.url().slice(0, 1000)}`);
            request.continue();
        });

        this.page.on('response', (response) => {
            console.log(`📥 response: ${response.status()} ${response.url().slice(0, 1000)}`);
        });

        // Handle console logs from page
        this.page.on('console', (msg) => {
            console.log(`🖥️  PAGE LOG: ${msg.text()}`);
        });

        console.log('✅ Browser initialized successfully');
    }

    async extractCsrfToken() {
        const token = await this.page.evaluate(() => {
            // Try multiple methods to find CSRF token
            const meta = document.querySelector("meta[name='csrf-token']");
            if (meta) return meta.content;

            const input = document.querySelector("input[name='_token']");
            if (input) return input.value;

            const scripts = document.querySelectorAll('script');
            for (let script of scripts) {
                const match = script.innerHTML.match(/var csrf_token = "(.*?)"/);
                if (match && match[1]) return match[1];
            }
            return null;
        });

        this.csrfToken = token;
        console.log(token ? '🔑 CSRF token extracted' : '❌ CSRF token not found');
        return token;
    }

    async waitForSelector(selector, timeout = 10000) {
        try {
            await this.page.waitForSelector(selector, { timeout });
            return true;
        } catch (error) {
            console.log(`⏰ Timeout waiting for selector: ${selector}`);
            return false;
        }
    }

    async retryOperation(operation, maxRetries = 3, delay = 2000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Attempt ${attempt}/${maxRetries}`);
                const result = await operation();
                return result;
            } catch (error) {
                console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
                if (attempt === maxRetries) throw error;
                await this.sleep(delay);
            }
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Login functionality
    async login() {
        console.log('🔐 Starting login process...');

        try {
            await this.page.goto('https://payment.ivacbd.com/login-auth', {
                waitUntil: 'domcontentloaded',
                timeout: 1000000
            });

            await this.extractCsrfToken();

            // Check if already logged in
            if (this.page.url().includes('payment.ivacbd.com') && !this.page.url().includes('login')) {
                console.log('✅ Already logged in');
                return true;
            }

            // Mobile verification
            await this.verifyMobile();

            // Password login
            await this.submitPassword();

            console.log('✅ Login completed successfully');
            return true;

        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
    }

    async verifyMobile() {
        console.log('📱 Verifying mobile number...');

        const mobileData = new URLSearchParams({
            _token: this.csrfToken,
            mobile_no: this.config.login.mobileNumber
        });

        const response = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return {
                status: response.status,
                redirected: response.redirected
            };
        }, 'https://payment.ivacbd.com/mobile-verify', mobileData.toString());

        if (response.status === 302 || response.redirected) {
            console.log('✅ Mobile verification successful');
        } else {
            throw new Error('Mobile verification failed');
        }
    }

    async submitPassword() {
        console.log('🔑 Submitting password...');

        const passwordData = new URLSearchParams({
            _token: this.csrfToken,
            password: this.config.login.password
        });

        const response = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return {
                status: response.status,
                redirected: response.redirected,
                url: response.url
            };
        }, 'https://payment.ivacbd.com/login-auth-submit', passwordData.toString());

        if (response.status === 302 || response.redirected) {
            if (response.url.includes('login-otp')) {
                console.log('📲 OTP required - waiting for manual input...');
                // Wait for OTP page to load and handle manually
                await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
            } else {
                console.log('✅ Password authentication successful');
                await this.page.goto('https://payment.ivacbd.com/', { waitUntil: 'networkidle0' });
            }
        } else {
            throw new Error('Password authentication failed');
        }
    }

    // OTP functionality
    async sendOtp(resend = false) {
        console.log(`📤 ${resend ? 'Resending' : 'Sending'} OTP...`);

        const otpData = new URLSearchParams({
            _token: this.csrfToken,
            resend: resend ? 1 : 0
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return response.json();
        }, 'https://payment.ivacbd.com/pay-otp-sent', otpData.toString());

        if (result.success) {
            console.log(`✅ OTP ${resend ? 're' : ''}sent successfully`);
        } else {
            throw new Error(`Failed to ${resend ? 're' : ''}send OTP`);
        }
    }

    async verifyOtp(otp) {
        console.log('🔐 Verifying OTP...');

        const otpData = new URLSearchParams({
            _token: this.csrfToken,
            otp: otp
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return response.json();
        }, 'https://payment.ivacbd.com/pay-otp-verify', otpData.toString());

        if (result.success) {
            this.isOtpVerified = true;
            this.hashParam = result.data?.hash_param;
            console.log('✅ OTP verified successfully');
            return result.data;
        } else {
            throw new Error('Invalid OTP');
        }
    }

    // Application submission
    async submitApplicationInfo() {
        console.log('📝 Submitting application info...');

        const appData = new URLSearchParams({
            _token: this.csrfToken,
            highcom: this.config.application.highcom,
            webfile_id: this.config.application.webFileId,
            webfile_id_repeat: this.config.application.webFileId,
            ivac_id: this.config.application.ivacId,
            visa_type: this.config.application.visaType,
            family_count: this.config.application.familyCount,
            visit_purpose: this.config.application.visitPurpose
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return {
                success: response.ok,
                status: response.status,
                redirected: response.redirected
            };
        }, 'https://payment.ivacbd.com/application-info-submit', appData.toString());

        if (result.success) {
            console.log('✅ Application info submitted successfully');
        } else {
            throw new Error('Application info submission failed');
        }
    }

    async submitPersonalInfo() {
        console.log('👤 Submitting personal info...');

        const personalData = new URLSearchParams({
            _token: this.csrfToken,
            full__name: this.config.personal.fullName,
            email_name: this.config.personal.email,
            pho_ne: this.config.personal.phone,
            web_file_id: this.config.application.webFileId
        });

        // Add family members
        this.config.personal.familyMembers.forEach((member, index) => {
            if (member.name && member.webFileNo) {
                const familyIndex = index + 1;
                personalData.append(`family[${familyIndex}][name]`, member.name);
                personalData.append(`family[${familyIndex}][webfile_no]`, member.webFileNo);
                personalData.append(`family[${familyIndex}][again_webfile_no]`, member.webFileNo);
            }
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return {
                success: response.ok,
                status: response.status,
                redirected: response.redirected
            };
        }, 'https://payment.ivacbd.com/personal-info-submit', personalData.toString());

        if (result.success) {
            console.log('✅ Personal info submitted successfully');
        } else {
            throw new Error('Personal info submission failed');
        }
    }

    // Payment processing
    async getSlotTimes() {
        console.log(`📅 Fetching slots for ${this.selectedDate}...`);

        const slotData = new URLSearchParams({
            _token: this.csrfToken,
            appointment_date: this.selectedDate
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return response.json();
        }, 'https://payment.ivacbd.com/pay-slot-time', slotData.toString());

        if (result.success && result.data?.slot_times) {
            console.log('✅ Slots loaded successfully');
            console.log(`Available slots: ${result.data.slot_times.length}`);

            // Auto-select first available slot
            const availableSlot = result.data.slot_times.find(slot => slot.availableSlot > 0);
            if (availableSlot) {
                this.selectedTime = availableSlot.hour;
                console.log(`🎯 Auto-selected time slot: ${availableSlot.time_display}`);
            }

            return result.data.slot_times;
        } else {
            throw new Error('Failed to load slots');
        }
    }

    async handleRecaptcha() {
        console.log('🤖 Handling reCAPTCHA...');

        // Wait for recaptcha to appear
        const recaptchaExists = await this.waitForSelector('.g-recaptcha', 10000);

        if (recaptchaExists) {
            console.log('⚠️  reCAPTCHA detected - manual intervention required');
            console.log('Please solve the reCAPTCHA manually and press Enter to continue...');

            // Wait for user input
            await new Promise((resolve) => {
                process.stdin.once('data', () => {
                    resolve();
                });
            });

            // Get the recaptcha token
            this.recaptchaToken = await this.page.evaluate(() => {
                return window.grecaptcha?.getResponse() || null;
            });

            if (this.recaptchaToken) {
                console.log('✅ reCAPTCHA token obtained');
            } else {
                throw new Error('Failed to get reCAPTCHA token');
            }
        }
    }

    async processPayment() {
        console.log('💳 Processing payment...');

        const paymentData = new URLSearchParams({
            _token: this.csrfToken,
            appointment_date: this.selectedDate,
            appointment_time: this.selectedTime,
            hash_param: this.recaptchaToken,
            'selected_payment[name]': 'VISA',
            'selected_payment[slug]': 'visacard',
            'selected_payment[link]': 'https://securepay.sslcommerz.com/gwprocess/v4/image/gw1/visa.png'
        });

        const result = await this.page.evaluate(async (url, data) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: data,
                credentials: 'include'
            });
            return response.json();
        }, 'https://payment.ivacbd.com/paynow', paymentData.toString());

        if (result.success) {
            console.log('✅ Payment processing started');
            if (result.url) {
                console.log(`🔗 Payment URL: ${result.url}`);
                await this.page.goto(result.url, { waitUntil: 'networkidle0' });
            }
        } else {
            throw new Error(result.message || 'Payment failed');
        }
    }

    // Main execution flow
    async run() {
        try {
            await this.init();

            // Step 1: Login
            await this.login();

            // Step 2: Send OTP
            await this.sendOtp();

            // Step 3: Wait for manual OTP input
            console.log('📲 Please enter OTP manually on the page...');
            console.log('Press Enter when OTP is verified and you want to continue...');
            await new Promise((resolve) => {
                process.stdin.once('data', () => {
                    resolve();
                });
            });

            // Step 4: Submit application info
            await this.submitApplicationInfo();

            // Step 5: Submit personal info
            await this.submitPersonalInfo();

            // Step 6: Get slot times
            await this.getSlotTimes();

            // Step 7: Handle reCAPTCHA
            await this.handleRecaptcha();

            // Step 8: Process payment
            await this.processPayment();

            console.log('🎉 Automation completed successfully!');

        } catch (error) {
            console.error('💥 Automation failed:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔚 Browser closed');
        }
    }
}

// Usage example
async function main() {
    const automation = new IVACAutomation({
        // Proxy configuration (optional)
        proxy: {
            server: '',
        },

        // Browser configuration
        headless: false,  // Set to true for headless mode

        // Update these with your actual credentials and details
        login: {
            mobileNumber: '01344570614',
            password: '123456'
        },

        application: {
            webFileId: 'BGDDV5101725',
            // ... other application details
        },

        personal: {
            fullName: 'TRISHA AKTAR',
            email: 'trisha666980@gmail.com',
            phone: '01344570614',
            // ... family members
        }
    });

    try {
        await automation.run();
    } catch (error) {
        console.error('Automation failed:', error);
    } finally {
        await automation.close();
    }
}

// Export for use as module
module.exports = IVACAutomation;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
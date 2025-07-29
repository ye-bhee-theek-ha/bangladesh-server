const puppeteer = require('puppeteer');

// Test script with proxy support to check IVAC accessibility
async function testIVACAccessWithProxy() {
    console.log('🧪 Testing IVAC website accessibility with proxy...');

    // List of free proxies to test (you can add more)
    const proxyList = [
        // 'http://203.96.226.154:8080',
        // 'http://182.160.114.213:8080',
        // 'http://114.130.153.122:58080',
        // 'http://103.187.39.21:1080',
        // 'http://202.5.37.104:17382',
        "http://103.243.82.26:100",
        "http://180.92.224.125:8080"
    ];

    for (const proxy of proxyList) {
        console.log(`\n🌐 Testing with proxy: ${proxy}`);

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    `--proxy-server=${proxy}`,
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            const page = await browser.newPage();

            // Set realistic user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            const testUrl = 'https://payment.ivacbd.com';

            console.log(`🔗 Testing: ${testUrl}`);

            const response = await page.goto(testUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

            const title = await page.title();
            const content = await page.content();
            const currentUrl = page.url();

            console.log(`📄 Page Title: ${title}`);
            console.log(`📍 Final URL: ${currentUrl}`);
            console.log(`📊 Status: ${response.status()}`);

            if (title.includes('Attention Required') ||
                title.includes('Cloudflare') ||
                content.includes('Cloudflare Ray ID')) {
                console.log(`❌ BLOCKED by Cloudflare with proxy: ${proxy}`);
            } else if (title.includes('IVAC') ||
                content.includes('ivac') ||
                content.includes('visa') ||
                content.includes('login') ||
                content.includes('Login')) {
                console.log(`✅ SUCCESS! IVAC site accessible with proxy: ${proxy}`);
                console.log(`🎉 Use this proxy in your main script!`);

                // Keep this browser open for manual testing
                console.log('Browser will stay open for 30 seconds for manual testing...');
                await new Promise(resolve => setTimeout(resolve, 30000));
                break;
            } else {
                console.log(`⚠️ UNCERTAIN response with proxy: ${proxy}`);
                console.log(`Content preview: ${content.substring(0, 200)}...`);
            }

        } catch (error) {
            console.log(`❌ ERROR with proxy ${proxy}: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }

        // Wait between proxy tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🔧 Proxy Testing Complete!');
    console.log('📋 Next Steps:');
    console.log('1. Use the working proxy in your main automation script');
    console.log('2. If no proxy worked, try premium proxy services');
    console.log('3. Consider using rotating proxies for better success rate');
}

// Test without proxy first
async function testWithoutProxy() {
    console.log('🧪 First testing without proxy...');

    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();

    try {
        const response = await page.goto('https://payment.ivacbd.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        const title = await page.title();
        const content = await page.content();

        if (title.includes('Attention Required') ||
            title.includes('Cloudflare') ||
            content.includes('Cloudflare Ray ID')) {
            console.log('❌ Blocked without proxy - proceeding with proxy tests...\n');
            await browser.close();
            return false;
        } else {
            console.log('✅ Site accessible without proxy!');
            await browser.close();
            return true;
        }
    } catch (error) {
        console.log(`❌ Error without proxy: ${error.message}`);
        await browser.close();
        return false;
    }
}

// Main test function
async function runTests() {
    const accessibleWithoutProxy = await testWithoutProxy();

    if (!accessibleWithoutProxy) {
        await testIVACAccessWithProxy();
    }
}

// Run the tests
runTests().catch(console.error);
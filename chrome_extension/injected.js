(function() {
    console.log('CreatorScan: Injected script loaded');

    // 1. Patch Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        const url = resource instanceof Request ? resource.url : resource;

        const response = await originalFetch.apply(this, args);

        // Check for search API (full/ or search_item)
        if (url && (url.includes('full/') || url.includes('search_item'))) { 
            const clone = response.clone();
            clone.json().then(data => {
                console.log('CreatorScan: Intercepted Fetch data', data);
                window.postMessage({ type: 'TIKTOK_SEARCH_API_RESPONSE', data: data }, '*');
            }).catch(err => console.error('CreatorScan: JSON parse error', err));
        }

        return response;
    };

    // 2. Patch XHR
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            // Check for search API (full/ or search_item)
            if (this.responseURL && (this.responseURL.includes('full/') || this.responseURL.includes('search_item'))) {
                 console.log('CreatorScan: Intercepted XHR data', this.responseURL);
                 try {
                     const data = JSON.parse(this.responseText);
                     window.postMessage({ type: 'TIKTOK_SEARCH_API_RESPONSE', data: data }, '*');
                 } catch(e) {
                     console.error('CreatorScan: XHR parse error', e);
                 }
            }
        });
        return originalXHRSend.apply(this, arguments);
    };
    
    // 3. Patch Visibility API to prevent background throttling
    Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
    
    // 4. Patch requestAnimationFrame to run in background
    const originalRAF = window.requestAnimationFrame;
    let nextRAFId = 0;
    const rafCallbacks = new Map();
    
    window.requestAnimationFrame = function(callback) {
        // Use setTimeout as fallback which runs in background (albeit slower ~1s)
        // We mix it: if visible, use real RAF; if not (or just always), use timeout to ensure execution
        // But simply replacing it with setTimeout(cb, 16) is safer for background execution
        return setTimeout(() => {
            callback(performance.now());
        }, 16);
    };

})();

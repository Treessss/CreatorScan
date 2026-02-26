(function() {
    console.log('CreatorScan: Injected script loaded');

    const INSTAGRAM_SERP_KEY = 'xdt_fbsearch__top_serp_graphql';
    const INSTAGRAM_PROFILE_PACKET_KIND = 'profile_page';
    const INSTAGRAM_SEARCH_PACKET_KIND = 'search_serp';

    function isTikTokSearchApiUrl(url) {
        return !!(url && (url.includes('full/') || url.includes('search_item')));
    }

    function isInstagramGraphqlUrl(url) {
        return !!(url && url.includes('instagram.com/graphql/query'));
    }

    function parseUrlDetails(url) {
        if (!url) return { url: '', path: '', query: {} };
        try {
            const parsed = new URL(url, window.location.origin);
            const keepParams = [
                'q',
                'query_hash',
                'doc_id',
                'variables',
                'fb_api_req_friendly_name'
            ];
            const query = {};
            keepParams.forEach((key) => {
                const value = parsed.searchParams.get(key);
                if (value != null) query[key] = value;
            });
            return {
                url: parsed.toString(),
                path: parsed.pathname,
                query
            };
        } catch (e) {
            return { url: String(url), path: '', query: {} };
        }
    }

    function serializeRequestBody(body) {
        if (!body) return null;
        try {
            if (typeof body === 'string') {
                return body.length > 4000 ? body.slice(0, 4000) + '...[truncated]' : body;
            }
            if (body instanceof URLSearchParams) {
                return body.toString();
            }
            if (typeof FormData !== 'undefined' && body instanceof FormData) {
                const out = {};
                for (const [k, v] of body.entries()) {
                    out[k] = typeof v === 'string' ? v : '[binary]';
                }
                return out;
            }
            if (body instanceof Blob) {
                return `[blob:${body.type || 'application/octet-stream'}:${body.size}]`;
            }
            if (body instanceof ArrayBuffer) {
                return `[arraybuffer:${body.byteLength}]`;
            }
            if (ArrayBuffer.isView(body)) {
                return `[typedarray:${body.byteLength}]`;
            }
            return String(body);
        } catch (e) {
            return `[unserializable:${String(e)}]`;
        }
    }

    function hasNestedKey(node, targetKey, seen) {
        if (!node || typeof node !== 'object') return false;
        const guard = seen || new WeakSet();
        if (guard.has(node)) return false;
        guard.add(node);

        if (Object.prototype.hasOwnProperty.call(node, targetKey)) return true;

        if (Array.isArray(node)) {
            for (const item of node) {
                if (hasNestedKey(item, targetKey, guard)) return true;
            }
            return false;
        }

        for (const value of Object.values(node)) {
            if (hasNestedKey(value, targetKey, guard)) return true;
        }
        return false;
    }

    function findNestedValueByKey(node, targetKey, seen) {
        if (!node || typeof node !== 'object') return undefined;
        const guard = seen || new WeakSet();
        if (guard.has(node)) return undefined;
        guard.add(node);

        if (Object.prototype.hasOwnProperty.call(node, targetKey)) {
            return node[targetKey];
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                const found = findNestedValueByKey(item, targetKey, guard);
                if (found !== undefined) return found;
            }
            return undefined;
        }

        for (const value of Object.values(node)) {
            const found = findNestedValueByKey(value, targetKey, guard);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    function postInstagramPacket(payload) {
        const responseData = payload && payload.response;
        if (!responseData || typeof responseData !== 'object') return;

        const isSearchPacket = hasNestedKey(responseData, INSTAGRAM_SERP_KEY);
        const profileUser = responseData?.data?.user;
        const isProfilePacket = !!(
            profileUser &&
            typeof profileUser === 'object' &&
            profileUser.username &&
            (
                profileUser.follower_count !== undefined ||
                profileUser.biography !== undefined ||
                profileUser.profile_pic_url
            )
        );

        if (!isSearchPacket && !isProfilePacket) return;

        const serpNode = isSearchPacket ? findNestedValueByKey(responseData, INSTAGRAM_SERP_KEY) : null;
        const serpNodeSummary = (serpNode && typeof serpNode === 'object' && !Array.isArray(serpNode))
            ? Object.keys(serpNode).slice(0, 20)
            : Array.isArray(serpNode) ? `array(${serpNode.length})` : typeof serpNode;

        window.postMessage({
            type: 'INSTAGRAM_GRAPHQL_RESPONSE',
            packet: {
                matchedKey: isSearchPacket ? INSTAGRAM_SERP_KEY : null,
                packetKind: isSearchPacket ? INSTAGRAM_SEARCH_PACKET_KIND : INSTAGRAM_PROFILE_PACKET_KIND,
                timestamp: Date.now(),
                ...payload
            }
        }, '*');

        console.log('CreatorScan: Intercepted Instagram GraphQL packet', {
            transport: payload.transport,
            url: payload.url,
            packetKind: isSearchPacket ? INSTAGRAM_SEARCH_PACKET_KIND : INSTAGRAM_PROFILE_PACKET_KIND,
            serpNodeSummary,
            profileUsername: isProfilePacket ? String(profileUser.username || '') : null
        });
    }

    async function readFetchRequestBody(resource, config) {
        try {
            if (config && config.body != null) {
                return serializeRequestBody(config.body);
            }
            if (resource instanceof Request) {
                const method = (resource.method || 'GET').toUpperCase();
                if (method === 'GET' || method === 'HEAD') return null;
                const clone = resource.clone();
                const text = await clone.text();
                return serializeRequestBody(text);
            }
        } catch (e) {
            return `[request-body-read-failed:${String(e)}]`;
        }
        return null;
    }

    // 1. Patch Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        const url = resource instanceof Request ? resource.url : resource;

        const response = await originalFetch.apply(this, args);

        // TikTok search API
        if (isTikTokSearchApiUrl(url)) {
            const clone = response.clone();
            clone.json().then(data => {
                console.log('CreatorScan: Intercepted Fetch data', data);
                window.postMessage({ type: 'TIKTOK_SEARCH_API_RESPONSE', data: data }, '*');
            }).catch(err => console.error('CreatorScan: JSON parse error', err));
        }

        // Instagram GraphQL search packets (filtered by target key)
        if (isInstagramGraphqlUrl(url)) {
            const clone = response.clone();
            const requestInfo = parseUrlDetails(url);
            const method = resource instanceof Request
                ? (resource.method || (config && config.method) || 'GET')
                : ((config && config.method) || 'GET');
            const requestBodyPromise = readFetchRequestBody(resource, config);

            clone.json().then(async (data) => {
                const requestBody = await requestBodyPromise;
                postInstagramPacket({
                    transport: 'fetch',
                    url: requestInfo.url,
                    method: String(method || 'GET').toUpperCase(),
                    request: {
                        path: requestInfo.path,
                        query: requestInfo.query,
                        body: requestBody
                    },
                    response: data
                });
            }).catch(err => console.error('CreatorScan: Instagram fetch JSON parse error', err));
        }

        return response;
    };

    // 2. Patch XHR
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__creatorScanMethod = method;
        this.__creatorScanUrl = url;
        return originalXHROpen.apply(this, arguments);
    };

    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        const requestBody = serializeRequestBody(body);
        this.addEventListener('load', function() {
            const responseUrl = this.responseURL || this.__creatorScanUrl || '';

            // TikTok search API
            if (isTikTokSearchApiUrl(responseUrl)) {
                 console.log('CreatorScan: Intercepted XHR data', this.responseURL);
                 try {
                     const data = (this.response && typeof this.response === 'object')
                        ? this.response
                        : JSON.parse(this.responseText);
                     window.postMessage({ type: 'TIKTOK_SEARCH_API_RESPONSE', data: data }, '*');
                 } catch(e) {
                     console.error('CreatorScan: XHR parse error', e);
                 }
            }

            // Instagram GraphQL search packets
            if (isInstagramGraphqlUrl(responseUrl)) {
                try {
                    const data = (this.response && typeof this.response === 'object')
                        ? this.response
                        : JSON.parse(this.responseText);
                    const requestInfo = parseUrlDetails(responseUrl);
                    postInstagramPacket({
                        transport: 'xhr',
                        url: requestInfo.url,
                        method: String(this.__creatorScanMethod || 'GET').toUpperCase(),
                        request: {
                            path: requestInfo.path,
                            query: requestInfo.query,
                            body: requestBody
                        },
                        response: data
                    });
                } catch (e) {
                    console.error('CreatorScan: Instagram XHR parse error', e);
                }
            }
        });
        return originalXHRSend.apply(this, arguments);
    };
    
    // 3. Patch Visibility API to prevent background throttling
    Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
    
    // 4. Patch requestAnimationFrame to run in background
    window.requestAnimationFrame = function(callback) {
        // Use setTimeout as fallback which runs in background (albeit slower ~1s)
        // We mix it: if visible, use real RAF; if not (or just always), use timeout to ensure execution
        // But simply replacing it with setTimeout(cb, 16) is safer for background execution
        return setTimeout(() => {
            callback(performance.now());
        }, 16);
    };

})();

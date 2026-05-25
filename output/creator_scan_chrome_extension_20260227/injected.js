(function() {
    window.__creatorScanInjectedReady = true;
    window.__creatorScanInjectedReadyAt = Date.now();
    console.log('CreatorScan: Injected script loaded');

    const INSTAGRAM_SERP_KEY = 'xdt_fbsearch__top_serp_graphql';
    const INSTAGRAM_PROFILE_PACKET_KIND = 'profile_page';
    const INSTAGRAM_SEARCH_PACKET_KIND = 'search_serp';
    const INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_APPID = 'com.bloks.www.ig.about_this_account';
    const INSTAGRAM_ABOUT_THIS_ACCOUNT_PAGE_CONTEXT_FETCH_REQUEST = 'CREATOR_SCAN_INSTAGRAM_ABOUT_THIS_ACCOUNT_FETCH_REQUEST';
    const INSTAGRAM_ABOUT_THIS_ACCOUNT_PAGE_CONTEXT_FETCH_RESPONSE = 'CREATOR_SCAN_INSTAGRAM_ABOUT_THIS_ACCOUNT_FETCH_RESPONSE';
    const INSTAGRAM_WEB_APP_ID = '936619743392459';

    function isTikTokSearchApiUrl(url) {
        return !!(url && (url.includes('full/') || url.includes('search_item')));
    }

    function isInstagramGraphqlUrl(url) {
        return !!(url && url.includes('instagram.com/graphql/query'));
    }

    function isInstagramAboutThisAccountWbloksUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url, window.location.origin);
            const path = String(parsed.pathname || '');
            if (!/\/async\/wbloks\/fetch\/?$/.test(path)) return false;
            return parsed.searchParams.get('appid') === INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_APPID;
        } catch (e) {
            const text = String(url);
            return (
                /\/async\/wbloks\/fetch\/?/i.test(text) &&
                text.includes(`appid=${INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_APPID}`)
            );
        }
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
                'fb_api_req_friendly_name',
                'appid',
                'type',
                '__bkv'
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

    function findInstagramAboutThisAccountFieldInitial(node, targetKey, seen) {
        if (!node || typeof node !== 'object') return undefined;
        const guard = seen || new WeakSet();
        if (guard.has(node)) return undefined;
        guard.add(node);

        if (node.data && typeof node.data === 'object' && node.data.key === targetKey) {
            if (node.data.initial !== undefined && node.data.initial !== null) {
                return node.data.initial;
            }
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                const found = findInstagramAboutThisAccountFieldInitial(item, targetKey, guard);
                if (found !== undefined) return found;
            }
            return undefined;
        }

        for (const value of Object.values(node)) {
            const found = findInstagramAboutThisAccountFieldInitial(value, targetKey, guard);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    function parseInstagramAboutThisAccountCountryFromWbloksResponseText(text) {
        const source = String(text || '').trim();
        if (!source) return null;
        const payloadText = source.startsWith('for (;;);') ? source.slice('for (;;);'.length) : source;
        let data;
        try {
            data = JSON.parse(payloadText);
        } catch (e) {
            return null;
        }
        const country = findInstagramAboutThisAccountFieldInitial(
            data,
            'IG_ABOUT_THIS_ACCOUNT:about_this_account_country'
        );
        if (country == null) return null;
        const value = String(country).trim();
        return value || null;
    }

    function parseInstagramWbloksErrorFromResponseText(text) {
        const source = String(text || '').trim();
        if (!source) return null;
        const payloadText = source.startsWith('for (;;);') ? source.slice('for (;;);'.length) : source;
        let data;
        try {
            data = JSON.parse(payloadText);
        } catch (e) {
            return null;
        }
        if (!data || typeof data !== 'object') return null;
        if (data.error == null) return null;
        return {
            code: data.error,
            summary: data.errorSummary ? String(data.errorSummary) : null,
            description: data.errorDescription ? String(data.errorDescription) : null
        };
    }

    function buildJazoestFromFBDtsgToken(token) {
        const text = String(token || '');
        if (!text) return null;
        let sum = 0;
        for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
        return `2${sum}`;
    }

    function getModuleExport(name) {
        if (typeof window.require !== 'function') {
            throw new Error('require unavailable');
        }
        return window.require(name);
    }

    function getAsyncParamsForPost() {
        const exported = getModuleExport('getAsyncParams');
        if (typeof exported === 'function') {
            return exported('POST');
        }
        if (exported && typeof exported.getAsyncParams === 'function') {
            return exported.getAsyncParams('POST');
        }
        throw new Error('getAsyncParams export unsupported');
    }

    function normalizeWbloksFormValue(value) {
        if (value == null) return null;
        if (typeof value === 'string') {
            const text = value.trim();
            return text || null;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return null;
    }

    function pickAboutThisAccountWbloksFormForDebug(form) {
        const keepKeys = [
            '__d', '__user', '__a', '__req', '__hs', 'dpr', '__ccg', '__rev', '__s', '__hsi',
            '__dyn', '__csr', '__hsdp', '__hblp', '__sjsp', '__comet_req',
            'fb_dtsg', 'jazoest', 'lsd', '__spin_r', '__spin_b', '__spin_t', '__crn', 'params'
        ];
        const out = {};
        for (const key of keepKeys) {
            if (!Object.prototype.hasOwnProperty.call(form, key)) continue;
            out[key] = form[key];
        }
        return out;
    }

    async function runInstagramAboutThisAccountPageContextFetch(payload) {
        const targetUserId = String(payload?.targetUserId || '').trim();
        if (!targetUserId) throw new Error('missing targetUserId');

        const refererType = String(payload?.refererType || 'ProfileMore').trim() || 'ProfileMore';
        const routeName = String(payload?.__crn || 'comet.igweb.PolarisProfilePostsTabRoute').trim() || 'comet.igweb.PolarisProfilePostsTabRoute';
        const profileUrl = String(payload?.profileUrl || '').trim();

        const asyncParamsRaw = getAsyncParamsForPost();
        if (!asyncParamsRaw || typeof asyncParamsRaw !== 'object') {
            throw new Error('getAsyncParams returned invalid payload');
        }

        const DTSG = getModuleExport('DTSG');
        const LSD = getModuleExport('LSD');
        const SiteData = getModuleExport('SiteData');

        const fbDtsg = typeof DTSG?.getToken === 'function'
            ? String(DTSG.getToken() || '').trim()
            : String(DTSG?.token || '').trim();
        const lsd = String(LSD?.token || '').trim();
        const jazoest = buildJazoestFromFBDtsgToken(fbDtsg);

        if (!fbDtsg || !lsd || !jazoest) {
            throw new Error('missing DTSG/LSD runtime tokens');
        }

        const requestUrl = new URL('https://www.instagram.com/async/wbloks/fetch/');
        requestUrl.searchParams.set('appid', INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_APPID);
        requestUrl.searchParams.set('type', 'app');

        const bkv = normalizeWbloksFormValue(SiteData?.bl_hash_version) || normalizeWbloksFormValue(payload?.__bkv);
        if (bkv) requestUrl.searchParams.set('__bkv', bkv);

        const form = new URLSearchParams();
        Object.entries(asyncParamsRaw).forEach(([key, value]) => {
            const normalized = normalizeWbloksFormValue(value);
            if (normalized == null) return;
            form.set(key, normalized);
        });

        form.set('__d', form.get('__d') || 'www');
        form.set('__a', '1');
        form.set('__crn', routeName);
        form.set('__user', form.get('__user') || '0');
        form.set('fb_dtsg', fbDtsg);
        form.set('lsd', lsd);
        form.set('jazoest', jazoest);
        form.set('params', JSON.stringify({
            referer_type: refererType,
            target_user_id: targetUserId
        }));

        const response = await originalFetch.call(window, requestUrl.toString(), {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            mode: 'cors',
            referrer: profileUrl || undefined,
            referrerPolicy: 'strict-origin-when-cross-origin',
            headers: {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: form.toString()
        });

        const responseText = await response.text();
        if (!response.ok) {
            const wbloksError = parseInstagramWbloksErrorFromResponseText(responseText);
            if (wbloksError && wbloksError.code != null) {
                throw new Error(
                    `wbloks HTTP ${response.status} ${response.statusText}` +
                    ` | code ${wbloksError.code}` +
                    (wbloksError.summary ? ` | ${wbloksError.summary}` : '') +
                    (wbloksError.description ? ` | ${wbloksError.description}` : '')
                );
            }
            throw new Error(`wbloks HTTP ${response.status} ${response.statusText}`);
        }
        const country = parseInstagramAboutThisAccountCountryFromWbloksResponseText(responseText);
        if (!country) {
            const wbloksError = parseInstagramWbloksErrorFromResponseText(responseText);
            if (wbloksError && wbloksError.code != null) {
                throw new Error(
                    `wbloks error ${wbloksError.code}` +
                    (wbloksError.summary ? ` ${wbloksError.summary}` : '') +
                    (wbloksError.description ? ` ${wbloksError.description}` : '')
                );
            }
            throw new Error('country not found in wbloks response');
        }

        return {
            country,
            request: {
                url: requestUrl.toString(),
                method: 'POST',
                body: pickAboutThisAccountWbloksFormForDebug(Object.fromEntries(form.entries()))
            },
            responseText
        };
    }

    function postInstagramAboutThisAccountPageContextFetchResponse(message) {
        window.postMessage({
            type: INSTAGRAM_ABOUT_THIS_ACCOUNT_PAGE_CONTEXT_FETCH_RESPONSE,
            ...message
        }, '*');
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

    function postInstagramAboutThisAccountWbloksPacket(payload) {
        if (!payload || typeof payload !== 'object') return;
        if (!payload.responseText || typeof payload.responseText !== 'string') return;

        try {
            const country = parseInstagramAboutThisAccountCountryFromWbloksResponseText(payload.responseText);
            console.debug('CreatorScan: injected captured about_this_account wbloks packet', {
                transport: payload.transport,
                method: payload.method,
                url: payload.url,
                hasCountry: !!country,
                country: country || null,
                responseLength: String(payload.responseText || '').length
            });
        } catch (e) {}

        window.postMessage({
            type: 'INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_RESPONSE',
            packet: {
                packetKind: 'about_this_account_wbloks',
                timestamp: Date.now(),
                ...payload
            }
        }, '*');
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== INSTAGRAM_ABOUT_THIS_ACCOUNT_PAGE_CONTEXT_FETCH_REQUEST) return;

        const requestId = data.requestId;
        Promise.resolve()
            .then(() => runInstagramAboutThisAccountPageContextFetch(data.payload || {}))
            .then((result) => {
                postInstagramAboutThisAccountPageContextFetchResponse({
                    requestId,
                    ok: true,
                    result
                });
            })
            .catch((error) => {
                postInstagramAboutThisAccountPageContextFetchResponse({
                    requestId,
                    ok: false,
                    error: String(error)
                });
            });
    });

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
        const requestUrl = resource instanceof Request ? resource.url : resource;

        const response = await originalFetch.apply(this, args);
        const responseUrl = response && typeof response.url === 'string' ? response.url : '';

        // TikTok search API
        if (isTikTokSearchApiUrl(requestUrl)) {
            const clone = response.clone();
            clone.json().then(data => {
                console.log('CreatorScan: Intercepted Fetch data', data);
                window.postMessage({ type: 'TIKTOK_SEARCH_API_RESPONSE', data: data }, '*');
            }).catch(err => console.error('CreatorScan: JSON parse error', err));
        }

        // Instagram GraphQL search packets (filtered by target key)
        const graphqlRequestMatched = isInstagramGraphqlUrl(requestUrl);
        const graphqlResponseMatched = isInstagramGraphqlUrl(responseUrl);
        const graphqlMatchedUrl = graphqlRequestMatched ? requestUrl : (graphqlResponseMatched ? responseUrl : null);
        if (graphqlMatchedUrl) {
            const clone = response.clone();
            const requestInfo = parseUrlDetails(graphqlMatchedUrl);
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

        const aboutRequestMatched = isInstagramAboutThisAccountWbloksUrl(requestUrl);
        const aboutResponseMatched = isInstagramAboutThisAccountWbloksUrl(responseUrl);
        const aboutMatchedUrl = aboutRequestMatched ? requestUrl : (aboutResponseMatched ? responseUrl : null);

        if (aboutMatchedUrl) {
            const clone = response.clone();
            const requestInfo = parseUrlDetails(aboutMatchedUrl);
            const method = resource instanceof Request
                ? (resource.method || (config && config.method) || 'GET')
                : ((config && config.method) || 'GET');
            const requestBodyPromise = readFetchRequestBody(resource, config);

            if (!aboutRequestMatched && aboutResponseMatched) {
                try {
                    console.debug('CreatorScan: about_this_account matched by response.url fallback', {
                        requestUrl: String(requestUrl || ''),
                        responseUrl
                    });
                } catch (e) {}
            }

            clone.text().then(async (text) => {
                const requestBody = await requestBodyPromise;
                postInstagramAboutThisAccountWbloksPacket({
                    transport: 'fetch',
                    url: requestInfo.url,
                    method: String(method || 'GET').toUpperCase(),
                    request: {
                        path: requestInfo.path,
                        query: requestInfo.query,
                        body: requestBody
                    },
                    responseText: text
                });
            }).catch((err) => console.error('CreatorScan: Instagram wbloks fetch text parse error', err));
        } else {
            const requestText = String(requestUrl || '');
            const responseText = String(responseUrl || '');
            if (requestText.includes('/async/wbloks/fetch') || responseText.includes('/async/wbloks/fetch')) {
                try {
                    console.debug('CreatorScan: wbloks fetch seen but appid did not match about_this_account', {
                        requestUrl: requestText,
                        responseUrl: responseText
                    });
                } catch (e) {}
            }
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

            if (isInstagramAboutThisAccountWbloksUrl(responseUrl)) {
                try {
                    const requestInfo = parseUrlDetails(responseUrl);
                    postInstagramAboutThisAccountWbloksPacket({
                        transport: 'xhr',
                        url: requestInfo.url,
                        method: String(this.__creatorScanMethod || 'GET').toUpperCase(),
                        request: {
                            path: requestInfo.path,
                            query: requestInfo.query,
                            body: requestBody
                        },
                        responseText: typeof this.responseText === 'string' ? this.responseText : ''
                    });
                } catch (e) {
                    console.error('CreatorScan: Instagram wbloks XHR parse error', e);
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

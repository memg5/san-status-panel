// ../node_modules/@hana/plugin-sdk/index.js
var PLUGIN_UI_PROTOCOL = "hana.plugin.ui";
var PLUGIN_UI_PROTOCOL_VERSION = 1;
var PLUGIN_SURFACE_SESSION_HEADER = "X-Hana-Plugin-Surface-Session";
var PLUGIN_SURFACE_SESSION_QUERY = "pluginSurfaceSession";
var PLUGIN_UI_ERROR_CODE = {
  BAD_MESSAGE: "BAD_MESSAGE",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  UNKNOWN_TYPE: "UNKNOWN_TYPE",
  CAPABILITY_DENIED: "CAPABILITY_DENIED",
  SLOT_DENIED: "SLOT_DENIED",
  TIMEOUT: "TIMEOUT",
  HOST_ERROR: "HOST_ERROR"
};
var PLUGIN_UI_CAPABILITY = {
  TOAST_SHOW: "toast.show",
  EXTERNAL_OPEN: "external.open",
  SESSION_FILE_OPEN: "sessionFile.open",
  RESOURCE_OPEN: "resource.open",
  RESOURCE_PICK: "resource.pick",
  RESOURCE_REQUEST_ACCESS: "resource.requestAccess",
  UI_RESIZE: "ui.resize",
  CLIPBOARD_WRITE_TEXT: "clipboard.writeText"
};
var MESSAGE_KINDS = /* @__PURE__ */ new Set([
  "event",
  "request",
  "response",
  "error"
]);
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function badMessage(message) {
  return {
    ok: false,
    error: {
      code: PLUGIN_UI_ERROR_CODE.BAD_MESSAGE,
      message
    }
  };
}
function parsePluginUiMessage(value) {
  if (!isObject(value)) {
    return badMessage("Plugin UI messages must be objects.");
  }
  if (value.protocol !== PLUGIN_UI_PROTOCOL) {
    return badMessage("Plugin UI message protocol is missing or invalid.");
  }
  if (value.version !== PLUGIN_UI_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: {
        code: PLUGIN_UI_ERROR_CODE.UNSUPPORTED_VERSION,
        message: `Unsupported Plugin UI protocol version: ${String(value.version)}.`
      }
    };
  }
  if (typeof value.kind !== "string" || !MESSAGE_KINDS.has(value.kind)) {
    return badMessage("Plugin UI message kind is missing or invalid.");
  }
  if (typeof value.type !== "string" || value.type.trim() === "") {
    return badMessage("Plugin UI message type must be a non-empty string.");
  }
  const kind = value.kind;
  if (kind !== "event" && (typeof value.id !== "string" || value.id.trim() === "")) {
    return badMessage(`Plugin UI ${kind} messages must include a non-empty id.`);
  }
  if (kind === "error") {
    if (!isObject(value.error)) {
      return badMessage("Plugin UI error messages must include an error object.");
    }
    if (typeof value.error.code !== "string" || value.error.code.trim() === "") {
      return badMessage("Plugin UI error code must be a non-empty string.");
    }
    if (typeof value.error.message !== "string" || value.error.message.trim() === "") {
      return badMessage("Plugin UI error message must be a non-empty string.");
    }
  }
  return {
    ok: true,
    value
  };
}
var HanaPluginError = class extends Error {
  name = "HanaPluginError";
  code;
  details;
  constructor(error) {
    super(error.message);
    this.code = error.code;
    this.details = error.details;
  }
};
var fallbackIdSeq = 0;
function defaultIdFactory() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackIdSeq += 1;
  return `hana-plugin-${Date.now()}-${fallbackIdSeq}`;
}
function getBrowserWindow() {
  if (typeof window === "undefined") {
    throw new Error("@hana/plugin-sdk requires a browser iframe window.");
  }
  return window;
}
function safeOriginFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
function resolveTargetOrigin(targetWindow, explicit) {
  if (explicit) return explicit;
  const hostOrigin = new URLSearchParams(targetWindow.location.search).get("hana-host-origin");
  if (hostOrigin) return hostOrigin;
  return safeOriginFromUrl(targetWindow.document.referrer) ?? "*";
}
function readInitialTheme(targetWindow) {
  const params = new URLSearchParams(targetWindow.location.search);
  return {
    theme: params.get("hana-theme") ?? void 0,
    cssUrl: params.get("hana-css") ?? void 0
  };
}
function isTrustedHostEvent(event, parentWindow, targetOrigin) {
  if (event.source !== parentWindow) return false;
  if (targetOrigin !== "*" && event.origin !== targetOrigin) return false;
  return true;
}
function externalOpenPayload(input) {
  return typeof input === "string" ? { url: input } : input;
}
function clipboardWriteTextPayload(input) {
  return typeof input === "string" ? { text: input } : input;
}
function readPluginIdFromIframeRoute(targetWindow) {
  const match = /^\/api\/plugins\/([^/]+)(?:\/|$)/.exec(targetWindow.location.pathname || "");
  if (!match) {
    throw new Error("Plugin asset URL helper requires an iframe route under /api/plugins/:pluginId/.");
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error("Plugin asset URL helper could not decode the current plugin id.");
  }
}
function normalizeAssetPath(input) {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("Invalid plugin asset path.");
  }
  if (input.includes("\\") || input.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(input)) {
    throw new Error("Invalid plugin asset path.");
  }
  const stripped = input.replace(/^\/+/, "");
  if (!stripped || stripped.startsWith("./")) {
    throw new Error("Invalid plugin asset path.");
  }
  const segments = stripped.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) {
    throw new Error("Invalid plugin asset path.");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}
function pluginAssetUrl(targetWindow, input) {
  const pluginId = readPluginIdFromIframeRoute(targetWindow);
  const assetPath = normalizeAssetPath(input);
  return `${targetWindow.location.origin}/api/plugins/${encodeURIComponent(pluginId)}/assets/${assetPath}`;
}
function readSurfaceSession(targetWindow) {
  return new URLSearchParams(targetWindow.location.search).get(PLUGIN_SURFACE_SESSION_QUERY) || null;
}
function normalizePluginApiPath(input) {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("Invalid plugin API path.");
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("\\") || trimmed.includes("\0") || trimmed.includes("#") || trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new Error("Invalid plugin API path.");
  }
  const stripped = trimmed.replace(/^\/+/, "");
  if (!stripped || stripped.startsWith("./") || stripped === "api/plugins" || stripped.startsWith("api/plugins/")) {
    throw new Error("Invalid plugin API path. Use a route path relative to the current plugin.");
  }
  const queryIndex = stripped.indexOf("?");
  const rawPath = queryIndex >= 0 ? stripped.slice(0, queryIndex) : stripped;
  if (!rawPath) {
    throw new Error("Invalid plugin API path.");
  }
  const segments = rawPath.split("/");
  for (const segment of segments) {
    if (!segment) throw new Error("Invalid plugin API path.");
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("Invalid plugin API path.");
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new Error("Invalid plugin API path.");
    }
  }
  const parsed = new URL(`http://hana.local/${stripped}`);
  const safePath = segments.map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
  return `${safePath}${parsed.search}`;
}
function pluginApiUrl(targetWindow, input) {
  const pluginId = readPluginIdFromIframeRoute(targetWindow);
  const apiPath = normalizePluginApiPath(input);
  return `${targetWindow.location.origin}/api/plugins/${encodeURIComponent(pluginId)}/${apiPath}`;
}
function pluginApiFetch(targetWindow, input, init) {
  const surfaceSession = readSurfaceSession(targetWindow);
  if (!surfaceSession) {
    throw new Error("hana.api.fetch requires pluginSurfaceSession in the iframe URL.");
  }
  const fetchImpl = targetWindow.fetch?.bind(targetWindow) ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error("hana.api.fetch requires window.fetch.");
  }
  const requestInit = init ?? {};
  const headers = new Headers(requestInit.headers);
  headers.set(PLUGIN_SURFACE_SESSION_HEADER, surfaceSession);
  return fetchImpl(pluginApiUrl(targetWindow, input), {
    ...requestInit,
    headers
  });
}
function createHanaPluginSdk(options = {}) {
  const targetWindow = options.targetWindow ?? getBrowserWindow();
  const parentWindow = options.parentWindow ?? targetWindow.parent;
  const targetOrigin = resolveTargetOrigin(targetWindow, options.targetOrigin);
  const requestTimeoutMs = options.requestTimeoutMs ?? 1e4;
  const idFactory = options.idFactory ?? defaultIdFactory;
  let themeSnapshot = readInitialTheme(targetWindow);
  const themeSubscribers = /* @__PURE__ */ new Set();
  function post(message) {
    parentWindow.postMessage(message, targetOrigin);
  }
  function postEvent(type, payload) {
    const message = {
      protocol: PLUGIN_UI_PROTOCOL,
      version: PLUGIN_UI_PROTOCOL_VERSION,
      kind: "event",
      type
    };
    if (payload !== void 0) message.payload = payload;
    post(message);
  }
  function onThemeMessage(event) {
    if (!isTrustedHostEvent(event, parentWindow, targetOrigin)) return;
    const parsed = parsePluginUiMessage(event.data);
    if (!parsed.ok) return;
    const message = parsed.value;
    if (message.kind !== "event" || message.type !== "hana.theme.changed") return;
    if (typeof message.payload !== "object" || message.payload === null) return;
    const payload = message.payload;
    themeSnapshot = {
      theme: typeof payload.theme === "string" ? payload.theme : themeSnapshot.theme,
      cssUrl: typeof payload.cssUrl === "string" ? payload.cssUrl : themeSnapshot.cssUrl
    };
    for (const callback of themeSubscribers) callback(themeSnapshot);
  }
  function request(type, payload, requestOptions = {}) {
    const id = idFactory();
    const timeoutMs = requestOptions.timeoutMs ?? requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        targetWindow.removeEventListener("message", onMessage);
        targetWindow.clearTimeout(timeout);
      };
      const onMessage = (event) => {
        if (!isTrustedHostEvent(event, parentWindow, targetOrigin)) return;
        const parsed = parsePluginUiMessage(event.data);
        if (!parsed.ok) return;
        const message2 = parsed.value;
        if (message2.id !== id || message2.type !== type) return;
        if (message2.kind === "response") {
          cleanup();
          resolve(message2.payload);
        }
        if (message2.kind === "error" && message2.error) {
          cleanup();
          reject(new HanaPluginError(message2.error));
        }
      };
      const timeout = targetWindow.setTimeout(() => {
        cleanup();
        reject(new HanaPluginError({
          code: "TIMEOUT",
          message: `Plugin host request timed out: ${type}.`
        }));
      }, timeoutMs);
      targetWindow.addEventListener("message", onMessage);
      const message = {
        protocol: PLUGIN_UI_PROTOCOL,
        version: PLUGIN_UI_PROTOCOL_VERSION,
        id,
        kind: "request",
        type
      };
      if (payload !== void 0) message.payload = payload;
      post(message);
    });
  }
  return {
    ready(payload) {
      postEvent("hana.ready", payload);
    },
    assets: {
      url(assetPath) {
        return pluginAssetUrl(targetWindow, assetPath);
      }
    },
    api: {
      url(apiPath) {
        return pluginApiUrl(targetWindow, apiPath);
      },
      fetch(apiPath, init) {
        return pluginApiFetch(targetWindow, apiPath, init);
      }
    },
    ui: {
      resize(size) {
        postEvent(PLUGIN_UI_CAPABILITY.UI_RESIZE, size);
      }
    },
    theme: {
      getSnapshot() {
        return { ...themeSnapshot };
      },
      subscribe(callback) {
        if (themeSubscribers.size === 0) {
          targetWindow.addEventListener("message", onThemeMessage);
        }
        themeSubscribers.add(callback);
        callback({ ...themeSnapshot });
        return () => {
          themeSubscribers.delete(callback);
          if (themeSubscribers.size === 0) {
            targetWindow.removeEventListener("message", onThemeMessage);
          }
        };
      }
    },
    host: {
      request
    },
    toast: {
      show(input, options2) {
        return request(PLUGIN_UI_CAPABILITY.TOAST_SHOW, input, options2);
      }
    },
    external: {
      open(input, options2) {
        return request(PLUGIN_UI_CAPABILITY.EXTERNAL_OPEN, externalOpenPayload(input), options2);
      }
    },
    clipboard: {
      writeText(input, options2) {
        return request(
          PLUGIN_UI_CAPABILITY.CLIPBOARD_WRITE_TEXT,
          clipboardWriteTextPayload(input),
          options2
        );
      }
    },
    resources: {
      open(input, options2) {
        return request(PLUGIN_UI_CAPABILITY.RESOURCE_OPEN, input, options2);
      },
      pick(input = {}, options2) {
        return request(PLUGIN_UI_CAPABILITY.RESOURCE_PICK, input, options2);
      },
      requestAccess(input, options2) {
        return request(
          PLUGIN_UI_CAPABILITY.RESOURCE_REQUEST_ACCESS,
          input,
          options2
        );
      }
    }
  };
}
var singleton = null;
function getSingleton() {
  singleton ??= createHanaPluginSdk();
  return singleton;
}
var hana = {
  ready(payload) {
    return getSingleton().ready(payload);
  },
  assets: {
    url(assetPath) {
      return getSingleton().assets.url(assetPath);
    }
  },
  api: {
    url(apiPath) {
      return getSingleton().api.url(apiPath);
    },
    fetch(apiPath, init) {
      return getSingleton().api.fetch(apiPath, init);
    }
  },
  ui: {
    resize(size) {
      return getSingleton().ui.resize(size);
    }
  },
  theme: {
    getSnapshot() {
      return getSingleton().theme.getSnapshot();
    },
    subscribe(callback) {
      return getSingleton().theme.subscribe(callback);
    }
  },
  host: {
    request(type, payload, options) {
      return getSingleton().host.request(type, payload, options);
    }
  },
  toast: {
    show(input, options) {
      return getSingleton().toast.show(input, options);
    }
  },
  external: {
    open(input, options) {
      return getSingleton().external.open(input, options);
    }
  },
  clipboard: {
    writeText(input, options) {
      return getSingleton().clipboard.writeText(input, options);
    }
  },
  resources: {
    open(input, options) {
      return getSingleton().resources.open(input, options);
    },
    pick(input, options) {
      return getSingleton().resources.pick(input, options);
    },
    requestAccess(input, options) {
      return getSingleton().resources.requestAccess(input, options);
    }
  }
};

// widget.js
hana.ready();
var API_STATUS = "api/status";
var API_POKE = "api/poke";
var API_SEND = "api/send";
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function render(data) {
  const activity = data.activity || "\u2699\uFE0F \u6682\u65E0\u72B6\u6001";
  const energy = data.energy || "?";
  const mood = data.mood || "?";
  const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }) : "—";
  document.getElementById("content").innerHTML = `
    <div class="row"><span class="label">\u{1F3AF} \u6D3B\u52A8</span><span class="val">${esc(activity)}</span></div>
    <div class="row"><span class="label">\u{1F375} \u7CBE\u529B</span><span class="val">${esc(energy)}</span></div>
    <div class="row"><span class="label">\u{1F60A} \u5FC3\u60C5</span><span class="val">${esc(mood)}</span></div>
    <div class="ok">\u{1F550} \u66F4\u65B0\u4E8E ${esc(updated)}</div>
  `;
  hana.ui.resize({ height: document.body.scrollHeight + 20 });
}
async function loadStatus() {
  try {
    const res = await hana.api.fetch(API_STATUS);
    if (!res.ok) throw new Error("\u8BF7\u6C42\u5931\u8D25");
    render(await res.json());
  } catch (err) {
    document.getElementById("content").innerHTML = '<div class="row"><span class="label">\u26A0\uFE0F \u72B6\u6001\u52A0\u8F7D\u5931\u8D25</span></div>';
  }
}
async function poke() {
  await hana.api.fetch(API_POKE, { method: "POST" });
  hana.toast.show({ message: "\u6233\u4E86\u4E00\u4E0B\u6851\u591A\u6D85", type: "info" });
  setTimeout(loadStatus, 800);
}
async function sendItem(item) {
  await hana.api.fetch(API_SEND, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item })
  });
  hana.toast.show({ message: `\u9001\u51FA ${item}`, type: "success" });
  setTimeout(loadStatus, 800);
}
window.__sandoPoke = poke;
window.__sandoSend = sendItem;
// 初次加载：立即请求，失败则重试（间隔递增）
(async function initLoad() {
  for (var i = 0; i < 5; i++) {
    try {
      var r = await hana.api.fetch(API_STATUS);
      if (!r.ok) throw new Error("请求失败");
      render(await r.json());
      return;
    } catch (_) {
      await new Promise(function (r) { setTimeout(r, (i + 1) * 1000); });
    }
  }
  // 5 次都失败，显示错误
  document.getElementById("content").innerHTML = '⚠️ 状态加载失败';
})();
// 短轮询（2026-08-09）：SSE 长连接方案在 Hana 0.446.6 下会导致切换会话卡死，改为轮询
setInterval(loadStatus, 4000);

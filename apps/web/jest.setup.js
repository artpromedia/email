import "@testing-library/jest-dom";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));

// Mock next/headers
jest.mock("next/headers", () => ({
  cookies: () => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn(),
  }),
  headers: () => new Map(),
}));

// Mock Request/Response for middleware tests
global.Request = class Request {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || "GET";
    this.headers = new Headers(options.headers);
    this.body = options.body;
  }

  clone() {
    return new Request(this.url, {
      method: this.method,
      headers: Object.fromEntries(this.headers.entries()),
      body: this.body,
    });
  }
};

global.Response = class Response {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.statusText = options.statusText || "OK";
    this.headers = new Headers(options.headers);
    this.ok = this.status >= 200 && this.status < 300;
  }

  static json(data, options = {}) {
    return new Response(JSON.stringify(data), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  static redirect(url, status = 302) {
    return new Response(null, {
      status,
      headers: { Location: url },
    });
  }
};

global.Headers = class Headers {
  constructor(init = {}) {
    this._headers = new Map();
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.set(key, value);
      });
    }
  }

  get(name) {
    return this._headers.get(name.toLowerCase());
  }

  set(name, value) {
    this._headers.set(name.toLowerCase(), value);
  }

  has(name) {
    return this._headers.has(name.toLowerCase());
  }

  delete(name) {
    this._headers.delete(name.toLowerCase());
  }

  entries() {
    return this._headers.entries();
  }

  forEach(callback) {
    this._headers.forEach(callback);
  }
};

// Mock NextResponse as a constructor
global.NextResponse = class NextResponse extends global.Response {
  constructor(body, options = {}) {
    super(body, options);
  }

  static next(options = {}) {
    return new NextResponse(null, {
      status: 200,
      ...options,
      headers: new global.Headers(options.headers),
    });
  }

  static json(data, options = {}) {
    return new NextResponse(JSON.stringify(data), {
      ...options,
      status: options.status || 200,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  static redirect(url, status = 307) {
    return new NextResponse(null, {
      status,
      headers: { Location: url },
    });
  }
};

jest.mock("next/server", () => ({
  NextResponse: global.NextResponse,
  NextRequest: global.Request,
}));

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

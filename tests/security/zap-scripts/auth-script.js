// OWASP ZAP Authentication Script
// Handles JWT authentication for API scanning

var HttpRequestHeader = Java.type('org.parosproxy.paros.network.HttpRequestHeader');
var HttpHeader = Java.type('org.parosproxy.paros.network.HttpHeader');
var URI = Java.type('org.apache.commons.httpclient.URI');

// Configuration
var LOGIN_URL = '/api/auth/login';
var TEST_USER = 'security-test@example.com';
var TEST_PASSWORD = 'SecurityTest123!';

/**
 * Authenticate to the application and return credentials
 */
function authenticate(helper, paramsValues, credentials) {
    var targetUrl = paramsValues.get('Target URL');
    var loginUrl = targetUrl + LOGIN_URL;

    print('ZAP Auth: Attempting authentication to ' + loginUrl);

    // Prepare login request
    var requestBody = JSON.stringify({
        email: credentials.getParam('username'),
        password: credentials.getParam('password')
    });

    var requestUri = new URI(loginUrl, false);
    var requestMethod = HttpRequestHeader.POST;
    var requestHeader = new HttpRequestHeader(requestMethod, requestUri, HttpHeader.HTTP11);
    requestHeader.setHeader(HttpHeader.CONTENT_TYPE, 'application/json');
    requestHeader.setContentLength(requestBody.length);

    var msg = helper.prepareMessage();
    msg.setRequestHeader(requestHeader);
    msg.setRequestBody(requestBody);

    // Send request
    helper.sendAndReceive(msg);

    // Parse response
    var responseCode = msg.getResponseHeader().getStatusCode();
    var responseBody = msg.getResponseBody().toString();

    print('ZAP Auth: Response code: ' + responseCode);

    if (responseCode === 200) {
        try {
            var jsonResponse = JSON.parse(responseBody);
            if (jsonResponse.token || jsonResponse.accessToken) {
                var token = jsonResponse.token || jsonResponse.accessToken;
                print('ZAP Auth: Successfully obtained JWT token');
                return token;
            }
        } catch (e) {
            print('ZAP Auth: Failed to parse response: ' + e);
        }
    }

    print('ZAP Auth: Authentication failed');
    return null;
}

/**
 * Get required authentication parameters
 */
function getRequiredParamsNames() {
    return ['Target URL'];
}

/**
 * Get optional authentication parameters
 */
function getOptionalParamsNames() {
    return [];
}

/**
 * Get credentials parameters (shown in ZAP UI)
 */
function getCredentialsParamsNames() {
    return ['username', 'password'];
}

/**
 * Get logged in indicator pattern
 */
function getLoggedInIndicator() {
    return '.*"authenticated":\\s*true.*';
}

/**
 * Get logged out indicator pattern
 */
function getLoggedOutIndicator() {
    return '.*"error":\\s*"Unauthorized".*|.*401.*';
}

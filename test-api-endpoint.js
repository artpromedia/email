const https = require("http");

const data = JSON.stringify({
  messageId: "cmezoep9l000e9z5xjmrles4z",
  action: "reply",
});

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/mail/compose/from-message",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJkZW1vQGNlZXJpb24uY29tIiwibmFtZSI6IkRlbW8gVXNlciIsImlhdCI6MTY5MzQ0NDgwMCwiZXhwIjoxNjkzNDQ4NDAwLCJqdGkiOiJkZW1vLXRva2VuIn0.demo",
    "Content-Length": data.length,
  },
};

console.log("🧪 Testing compose endpoint...");

const req = https.request(options, (res) => {
  console.log(`📡 Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);

  let responseBody = "";
  res.on("data", (chunk) => {
    responseBody += chunk;
  });

  res.on("end", () => {
    console.log("✅ Response received:");
    console.log(responseBody);

    if (res.statusCode === 200) {
      try {
        const parsed = JSON.parse(responseBody);
        console.log("📧 Parsed response:", JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log("⚠️  Could not parse JSON response");
      }
    }
  });
});

req.on("error", (e) => {
  console.error(`❌ Request error: ${e.message}`);
});

req.write(data);
req.end();

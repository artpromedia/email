// Simple integration test for Reply/Reply-All/Forward
const http = require("http");

async function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);

    const options = {
      hostname: "localhost",
      port: 4000,
      path: "/mail/compose/from-message",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer demo-token",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
        });
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function testIntegration() {
  console.log("🧪 Testing Reply/Reply-All/Forward Integration\n");

  const messageId = "cmezoep9l000e9z5xjmrles4z";

  const tests = [
    {
      name: "📧 REPLY",
      payload: { messageId, action: "reply" },
    },
    {
      name: "👥 REPLY ALL",
      payload: { messageId, action: "replyAll" },
    },
    {
      name: "📤 FORWARD",
      payload: { messageId, action: "forward", includeAttachments: true },
    },
  ];

  for (const test of tests) {
    try {
      console.log(`\n${test.name} Test...`);

      const response = await makeRequest(test.payload);

      if (response.statusCode === 200) {
        const result = JSON.parse(response.body);
        console.log(`✅ Success! Draft ID: ${result.draftId}`);
        console.log(`📝 Subject: "${result.subject}"`);
        console.log(`📮 To: ${result.to.join(", ")}`);
        if (result.cc && result.cc.length > 0) {
          console.log(`📋 CC: ${result.cc.join(", ")}`);
        }
        console.log(
          `🔤 Body preview: ${result.body ? result.body.substring(0, 100) + "..." : "No body"}`,
        );
      } else {
        console.log(`❌ Failed with status ${response.statusCode}`);
        console.log(`📄 Response: ${response.body}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log("\n✅ Integration tests completed!");
}

testIntegration().catch(console.error);
